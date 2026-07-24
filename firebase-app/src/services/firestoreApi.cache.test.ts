// Integration test for the read-cache wiring in firestoreApi. The heavy sibling
// service modules (admin/ai/pvp) are stubbed so the import graph stays small;
// firebase/firestore is stubbed with inert query builders plus a getDocs that
// routes by collection path, letting us count real Firestore reads.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./adminApi', () => ({ adminApi: {} }))
vi.mock('./aiApi', () => ({ aiApi: {} }))
vi.mock('./pvpApi', () => ({ pvpApi: {} }))

vi.mock('../firebase/client', () => ({
  db: {},
  ensureSignedIn: vi.fn(async () => ({ uid: 'OWNER' })),
}))

vi.mock('firebase/firestore', () => {
  const directoryDocs = [
    { id: 'u1', name: 'ฟ้า', class: 'ป.5', avatar: '🧙', xp: 40, level: 2, rank: 'SILVER' },
    { id: 'u2', name: 'เมฆ', class: 'ป.6', avatar: '⚔️', xp: 10, level: 1, rank: 'BRONZE' },
  ]
  const progressDocs = [{ id: 'u1_L1', userId: 'u1', lessonId: 'L1', status: 'Passed' }]
  const snapshotFor = (path: string) => {
    const rows = path === 'directory' ? directoryDocs : path === 'progress' ? progressDocs : []
    return { docs: rows.map((row) => ({ id: row.id, data: () => row })) }
  }
  return {
    collection: (_db: unknown, path: string) => ({ __path: path }),
    doc: (_db: unknown, ...rest: string[]) => ({ __path: rest.join('/') }),
    query: (base: { __path: string }, ...clauses: unknown[]) => ({ ...base, __clauses: clauses }),
    where: (...args: unknown[]) => ({ __where: args }),
    orderBy: (...args: unknown[]) => ({ __orderBy: args }),
    limit: vi.fn((n: number) => ({ __limit: n })),
    getDocs: vi.fn(async (target: { __path: string }) => snapshotFor(target.__path)),
    getDoc: vi.fn(async () => ({ exists: () => true, data: () => ({ ownerUid: 'OWNER', xp: 0, coins: 0 }) })),
    getCountFromServer: vi.fn(async () => ({ data: () => ({ count: 0 }) })),
    runTransaction: vi.fn(async (_db: unknown, cb: (t: unknown) => Promise<unknown>) => cb({
      get: async (ref: { __path: string }) => ({
        exists: () => true,
        data: () => (ref.__path.startsWith('progress') ? {} : { ownerUid: 'OWNER', xp: 0, coins: 0 }),
      }),
      set: vi.fn(),
      update: vi.fn(),
    })),
    serverTimestamp: () => 'ts',
    setDoc: vi.fn(),
    updateDoc: vi.fn(),
    onSnapshot: vi.fn(),
  }
})

import { getDoc, getDocs, limit } from 'firebase/firestore'
import { ensureSignedIn } from '../firebase/client'
import { firestoreApi } from './firestoreApi'
import { clearReadCache } from './readCache'

const directoryReadCount = () =>
  (getDocs as unknown as ReturnType<typeof vi.fn>).mock.calls
    .filter((call) => (call[0] as { __path?: string })?.__path === 'directory').length

const progressReadCount = () =>
  (getDocs as unknown as ReturnType<typeof vi.fn>).mock.calls
    .filter((call) => (call[0] as { __path?: string })?.__path === 'progress').length

describe('firestoreApi read caching', () => {
  beforeEach(() => {
    clearReadCache()
    vi.clearAllMocks()
  })
  afterEach(() => {
    clearReadCache()
  })

  it('reads the directory only once across the two leaderboards + name list within the TTL', async () => {
    await firestoreApi.getGuildLeaderboard()
    await firestoreApi.getRegisteredUsers()
    await firestoreApi.getGuildLeaderboard()
    expect(directoryReadCount()).toBe(1)
  })

  it('fetches the individual leaderboard with a server-side top-20 limit (scales flat)', async () => {
    const result = await firestoreApi.getLeaderboard()
    expect(result.success).toBe(true)
    expect(limit).toHaveBeenCalledWith(20)
  })

  it('serves repeated passed-lesson reads from cache but reloads after a progress write', async () => {
    await firestoreApi.getStudentProgress('u1')
    await firestoreApi.getStudentProgress('u1')
    expect(progressReadCount()).toBe(1)

    await firestoreApi.saveStudentProgress('u1', 'L2', 'Passed', 5, 5)
    await firestoreApi.getStudentProgress('u1')
    expect(progressReadCount()).toBe(2)
  })
})

describe('firestoreApi mutation ownership (no redundant pre-read)', () => {
  beforeEach(() => {
    clearReadCache()
    vi.clearAllMocks()
  })

  it('reads the user only inside the transaction, not via a separate pre-read getDoc', async () => {
    await firestoreApi.saveStudentProgress('u1', 'L2', 'Passed', 5, 5)
    // The old ownedUser() pre-check getDoc is gone; ownership is enforced on the
    // transaction snapshot instead, so a save no longer touches getDoc at all.
    expect(getDoc).not.toHaveBeenCalled()
  })

  it('still rejects a session that does not own the profile (check moved into the transaction)', async () => {
    ;(ensureSignedIn as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ uid: 'INTRUDER' })
    await expect(firestoreApi.saveStudentProgress('u1', 'L2', 'Passed', 5, 5))
      .rejects.toThrow('belongs to another session')
  })
})

describe('teacher-quest board caching', () => {
  beforeEach(() => {
    clearReadCache()
    vi.clearAllMocks()
  })

  it('reads the user once for the map\'s double board fetch and reloads after accepting a quest', async () => {
    await firestoreApi.getTeacherQuestBoard('u1')
    await firestoreApi.getTeacherQuestBoard('u1')
    // ownedUser's getDoc runs once; the second fetch is served from the cache.
    expect(getDoc).toHaveBeenCalledTimes(1)

    await firestoreApi.acceptTeacherQuest('u1', 'TQ001')
    await firestoreApi.getTeacherQuestBoard('u1')
    // Accepting invalidated questBoard:u1, so the board is recomputed.
    expect(getDoc).toHaveBeenCalledTimes(2)
  })
})
