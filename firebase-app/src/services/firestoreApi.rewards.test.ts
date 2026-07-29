// Reward-write clamping in firestoreApi. Firestore rules reject any single
// write that moves xp or coins by more than ±1000, and a rejected write loses
// the student's whole session — so every reward path has to land under the cap
// before it reaches the transaction. Sibling service modules are stubbed and
// firebase/firestore is replaced with a transaction recorder, so these tests
// read the exact numbers the client would send.
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./adminApi', () => ({ adminApi: {} }))
vi.mock('./aiApi', () => ({ aiApi: {} }))
vi.mock('./pvpApi', () => ({ pvpApi: {} }))

vi.mock('../firebase/client', () => ({
  db: {},
  ensureSignedIn: vi.fn(async () => ({ uid: 'OWNER' })),
}))

const userUpdates: Array<Record<string, unknown>> = []

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => ({ __path: path }),
  doc: (_db: unknown, ...rest: string[]) => ({ __path: rest.join('/') }),
  query: (base: unknown) => base,
  where: (...args: unknown[]) => ({ __where: args }),
  orderBy: (...args: unknown[]) => ({ __orderBy: args }),
  limit: (n: number) => ({ __limit: n }),
  getDocs: vi.fn(async () => ({ docs: [] })),
  getDoc: vi.fn(async () => ({ exists: () => true, data: () => ({ ownerUid: 'OWNER', xp: 0, coins: 0 }) })),
  getCountFromServer: vi.fn(async () => ({ data: () => ({ count: 0 }) })),
  runTransaction: vi.fn(async (_db: unknown, run: (transaction: unknown) => Promise<unknown>) => run({
    get: async () => ({ exists: () => true, data: () => ({ ownerUid: 'OWNER', name: 'ฟ้า', class: 'ป.5', xp: 0, coins: 0 }) }),
    set: vi.fn(),
    update: (ref: { __path: string }, values: Record<string, unknown>) => {
      if (ref.__path.startsWith('users')) userUpdates.push(values)
    },
  })),
  serverTimestamp: () => 'ts',
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  onSnapshot: vi.fn(),
}))

import { firestoreApi } from './firestoreApi'
import { SESSION_REWARD_COIN_CAP, SESSION_REWARD_XP_CAP } from './levelSystem'

beforeEach(() => {
  userUpdates.length = 0
})

describe('saveCyberSafetyResult', () => {
  it('writes a normal run through untouched', async () => {
    await firestoreApi.saveCyberSafetyResult('u1', 4, 80, 80)

    expect(userUpdates).toHaveLength(1)
    expect(userUpdates[0]).toMatchObject({ coins: 80, xp: 80 })
  })

  it('clamps an oversized run to the session cap instead of letting rules deny the write', async () => {
    // 20 coins/XP per first-try-correct scenario: an admin who authors more than
    // fifty scenarios would otherwise ask for a delta above the ±1000 rules cap.
    await firestoreApi.saveCyberSafetyResult('u1', 90, 1800, 1800)

    expect(userUpdates).toHaveLength(1)
    expect(userUpdates[0]).toMatchObject({ coins: SESSION_REWARD_COIN_CAP, xp: SESSION_REWARD_XP_CAP })
    expect(Number(userUpdates[0].coins)).toBeLessThan(1000)
    expect(Number(userUpdates[0].xp)).toBeLessThan(1000)
  })

  it('never sends a negative delta when a caller passes junk', async () => {
    await firestoreApi.saveCyberSafetyResult('u1', 0, -50, Number.NaN)

    expect(userUpdates[0]).toMatchObject({ coins: 0, xp: 0 })
  })
})
