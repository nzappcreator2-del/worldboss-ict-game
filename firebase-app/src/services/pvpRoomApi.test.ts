import { describe, expect, it } from 'vitest'
import { normalizePvpRoom } from './pvpRoomApi'

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
