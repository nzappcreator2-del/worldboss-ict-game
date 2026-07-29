import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../firebase/client', () => ({
  db: {},
  ensureSignedIn: vi.fn(async () => ({ uid: 'uid-1' })),
}))

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(async () => undefined),
  collection: (_db: unknown, ...rest: string[]) => ({ __path: rest.join('/') }),
  deleteDoc: vi.fn(async () => undefined),
  doc: (_db: unknown, ...rest: string[]) => {
    // Mirrors the real doc(): an empty segment collapses the path, and an odd
    // segment count is a synchronous throw, not a rejected promise.
    const segments = rest.filter(Boolean)
    if (segments.length % 2 !== 0) throw new Error(`Invalid document reference. ${segments.join('/')} has ${segments.length}.`)
    return { __path: segments.join('/') }
  },
  getDoc: vi.fn(async () => ({ exists: () => true, data: () => ({ ownerUid: 'uid-1' }) })),
  getDocs: vi.fn(async () => ({ docs: [] })),
  limit: (n: number) => ({ __limit: n }),
  onSnapshot: vi.fn(),
  orderBy: (...args: unknown[]) => ({ __orderBy: args }),
  query: (base: unknown) => base,
  runTransaction: vi.fn(async () => ({ success: true })),
  serverTimestamp: () => 'ts',
  setDoc: vi.fn(async () => undefined),
  where: (...args: unknown[]) => ({ __where: args }),
}))

import { setDoc } from 'firebase/firestore'
import { ensureSignedIn } from '../firebase/client'
import { normalizePvpRoom, updatePvpPresence } from './pvpRoomApi'

const asMock = (fn: unknown) => fn as unknown as ReturnType<typeof vi.fn>

// The lobby presence timer fires every 350 ms and reads the room id from a ref
// that leaving the lobby blanks a tick before the interval is cleared. The
// empty id used to reach doc(), which throws synchronously — outside the
// setDoc().catch() — so it escaped as an unhandled rejection and burned a
// clientErrors write on every student who walked out of a PVP lobby.
describe('updatePvpPresence', () => {
  const presence = { userId: 'u1', x: 50, y: 60, direction: 'down', action: 'idle' }

  beforeEach(() => {
    asMock(ensureSignedIn).mockClear()
    asMock(setDoc).mockClear()
  })

  it('writes presence for a real room', async () => {
    await expect(updatePvpPresence('PRIVATE_ABCD', presence)).resolves.toBeUndefined()

    expect(asMock(setDoc)).toHaveBeenCalledTimes(1)
    expect(asMock(setDoc).mock.calls[0][0]).toMatchObject({ __path: 'pvpRooms/PRIVATE_ABCD/presence/uid-1' })
  })

  it('bails out on a blank room id without touching auth or Firestore', async () => {
    await expect(updatePvpPresence('', presence)).resolves.toBeUndefined()

    expect(asMock(ensureSignedIn)).not.toHaveBeenCalled()
    expect(asMock(setDoc)).not.toHaveBeenCalled()
  })
})

describe('normalizePvpRoom', () => {
  it('coerces a loose Firestore document into a typed room snapshot', () => {
    const room = normalizePvpRoom('PRIVATE_ABCD', {
      mode: 'team',
      teamSize: '3',
      isPrivate: true,
      hostId: 'u1',
      hostUid: 'uid-1',
      status: 'PLAYING',
      memberUids: ['uid-1', 'uid-2'],
      players: {
        u1: { uid: 'uid-1', name: 'ฟ้า', gender: 'female', team: 0, ready: true, hp: '90', maxHp: 112, stats: { str: '4' }, equipped: { hat: 'hat-bandana' } },
        u2: { uid: 'uid-2', name: 'เมฆ', gender: 'dragon', team: 1, hp: -5 },
      },
      battle: { round: '2', questionIds: ['q1', 2], lastAction: { round: 1, attackerId: 'u1', targetId: 'u2', damage: 19, crit: false, defeated: false } },
      winnerTeam: null,
      updatedAt: { toMillis: () => 1234 },
    })

    expect(room.roomId).toBe('PRIVATE_ABCD')
    expect(room.mode).toBe('team')
    expect(room.teamSize).toBe(3)
    expect(room.status).toBe('PLAYING')
    expect(room.players.u1.stats.str).toBe(4)
    expect(room.players.u1.equipped.hat).toBe('hat-bandana')
    expect(room.players.u2.gender).toBe('')
    expect(room.players.u2.hp).toBe(0)
    expect(room.battle?.round).toBe(2)
    expect(room.battle?.questionIds).toEqual(['q1', '2'])
    expect(room.battle?.lastAction?.damage).toBe(19)
    expect(room.updatedAtMs).toBe(1234)
  })

  it('defaults corrupt documents to an empty lobby instead of crashing', () => {
    const room = normalizePvpRoom('r1', { status: 'EXPLODED', players: 'nope', battle: 7 })
    expect(room.status).toBe('LOBBY')
    expect(room.players).toEqual({})
    expect(room.battle).toBeNull()
    expect(room.winnerTeam).toBeNull()
  })
})
