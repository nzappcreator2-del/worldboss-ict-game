import { describe, expect, it } from 'vitest'
import {
  PVP_MAX_QUESTIONS,
  PVP_LOBBY_WALK_BOUNDS,
  PVP_ROUND_SECONDS,
  advanceRoundOnTimeout,
  applyRankingDelta,
  buildPvpPlayer,
  canJoinRoom,
  canStartBattle,
  clampPvpLobbyPosition,
  computeMvp,
  currentQuestionId,
  joinRoom,
  leaveRoom,
  newRoom,
  outcomeForPlayer,
  pickTeamForJoin,
  pvpDamage,
  pvpMatchReward,
  rankingDelta,
  refereeId,
  resolveAnswer,
  sanitizeRoomCode,
  setRoomTeamSize,
  shuffleQuestionIds,
  startBattle,
  switchTeam,
  toggleRoomReady,
  validRoomCode,
  type PvpRoom,
} from './pvpRoomLogic'

const heroUser = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: `Hero ${id}`,
  avatar: '🧙',
  gender: 'male',
  level: 5,
  xp: 500,
  inventory: { stats: { str: 4, vit: 2, dex: 2, luk: 0 }, cosmetics: { owned: ['hat-bandana'], equipped: { hat: 'hat-bandana' } } },
  ...extra,
})

const makeRoom = (overrides: Partial<PvpRoom> = {}): PvpRoom => {
  const host = buildPvpPlayer(heroUser('u1'), 'uid-1', 0)
  return {
    ...newRoom('room-1', 'duel', 1, false, host),
    ...overrides,
  }
}

const teamRoom = (): PvpRoom => {
  let room = { ...newRoom('room-2', 'team', 2, true, buildPvpPlayer(heroUser('u1'), 'uid-1', 0)) }
  room = joinRoom(room, buildPvpPlayer(heroUser('u2'), 'uid-2', pickTeamForJoin(room)!))!
  room = joinRoom(room, buildPvpPlayer(heroUser('u3'), 'uid-3', pickTeamForJoin(room)!))!
  room = joinRoom(room, buildPvpPlayer(heroUser('u4'), 'uid-4', pickTeamForJoin(room)!))!
  return room
}

const everyoneReady = (room: PvpRoom): PvpRoom =>
  Object.keys(room.players).reduce((next, id) => toggleRoomReady(next, id, true), room)

describe('PVP lobby walk area', () => {
  it('keeps player feet on the courtyard and out of the sky or chat edge', () => {
    expect(PVP_LOBBY_WALK_BOUNDS).toEqual({ minX: 6, maxX: 94, minY: 52, maxY: 86 })
    expect(clampPvpLobbyPosition({ x: 50, y: 18 })).toEqual({ x: 50, y: 52 })
    expect(clampPvpLobbyPosition({ x: -20, y: 99 })).toEqual({ x: 6, y: 86 })
    expect(clampPvpLobbyPosition({ x: 72, y: 70 })).toEqual({ x: 72, y: 70 })
  })
})

describe('room codes', () => {
  it('sanitizes to uppercase alphanumerics capped at 8 chars', () => {
    expect(sanitizeRoomCode(' abc-123x! ')).toBe('ABC123X')
    expect(sanitizeRoomCode('verylongroomcode')).toBe('VERYLONG')
  })

  it('accepts 4-8 chars and rejects shorter or empty codes', () => {
    expect(validRoomCode('AB12')).toBe(true)
    expect(validRoomCode('ABCD1234')).toBe(true)
    expect(validRoomCode('AB1')).toBe(false)
    expect(validRoomCode('')).toBe(false)
  })
})

describe('player snapshots', () => {
  it('captures character appearance and combat stats from the user profile', () => {
    const player = buildPvpPlayer(heroUser('u9'), 'uid-9', 1)
    expect(player.userId).toBe('u9')
    expect(player.uid).toBe('uid-9')
    expect(player.gender).toBe('male')
    expect(player.equipped.hat).toBe('hat-bandana')
    expect(player.team).toBe(1)
    expect(player.ready).toBe(false)
    // vit 2 -> maxHp 100 + 12
    expect(player.maxHp).toBe(112)
    expect(player.hp).toBe(112)
    expect(player.stats).toEqual({ str: 4, vit: 2, dex: 2, luk: 0 })
  })

  it('falls back safely for legacy users without gender or stats', () => {
    const player = buildPvpPlayer({ id: 'u2', name: 'Old', avatar: '🧛' }, 'uid-2', 0)
    expect(player.gender).toBe('')
    expect(player.maxHp).toBe(100)
    expect(player.level).toBe(1)
    expect(player.stats).toEqual({ str: 0, vit: 0, dex: 0, luk: 0 })
  })
})

describe('room lifecycle', () => {
  it('creates a lobby room with the host as first member', () => {
    const room = makeRoom()
    expect(room.status).toBe('LOBBY')
    expect(room.hostId).toBe('u1')
    expect(room.memberUids).toEqual(['uid-1'])
    expect(Object.keys(room.players)).toEqual(['u1'])
    expect(room.teamSize).toBe(1)
  })

  it('assigns joiners to the smaller team and blocks joining when full', () => {
    let room = makeRoom()
    expect(pickTeamForJoin(room)).toBe(1)
    room = joinRoom(room, buildPvpPlayer(heroUser('u2'), 'uid-2', 1))!
    expect(room.players.u2.team).toBe(1)
    expect(pickTeamForJoin(room)).toBeNull()
    expect(canJoinRoom(room, 'u3')).toBe(false)
    expect(joinRoom(room, buildPvpPlayer(heroUser('u3'), 'uid-3', 0))).toBeNull()
  })

  it('rejects joining a room twice or after it started', () => {
    const room = teamRoom()
    expect(canJoinRoom(room, 'u2')).toBe(false)
    const playing = { ...room, status: 'PLAYING' as const }
    expect(canJoinRoom(playing, 'u9')).toBe(false)
  })

  it('lets host resize teams only while it fits current players', () => {
    let room = teamRoom() // 2v2
    expect(setRoomTeamSize(room, 3)!.teamSize).toBe(3)
    room = setRoomTeamSize(room, 2)!
    expect(setRoomTeamSize({ ...room, mode: 'duel' }, 3)).toBeNull()
    // Shrinking below a team's member count is rejected.
    expect(setRoomTeamSize(room, 1)).toBeNull()
  })

  it('switches team only when the target team has space', () => {
    let room = makeRoom() // duel 1v1, host on team 0
    room = joinRoom(room, buildPvpPlayer(heroUser('u2'), 'uid-2', 1))!
    expect(switchTeam(room, 'u2')).toBeNull() // team 0 already full
    room = setRoomTeamSize({ ...room, mode: 'team' }, 2)!
    const moved = switchTeam(room, 'u2')!
    expect(moved.players.u2.team).toBe(0)
  })

  it('toggles ready and reports start readiness', () => {
    let room = makeRoom()
    expect(canStartBattle(room).ok).toBe(false)
    room = joinRoom(room, buildPvpPlayer(heroUser('u2'), 'uid-2', 1))!
    expect(canStartBattle(room).ok).toBe(false)
    room = everyoneReady(room)
    expect(room.players.u1.ready).toBe(true)
    expect(canStartBattle(room).ok).toBe(true)
  })

  it('requires both teams populated before starting a team battle', () => {
    let room = { ...newRoom('r', 'team', 2, false, buildPvpPlayer(heroUser('u1'), 'uid-1', 0)) }
    room = joinRoom(room, buildPvpPlayer(heroUser('u2'), 'uid-2', 0))!
    room = everyoneReady(room)
    expect(canStartBattle(room).ok).toBe(false)
  })

  it('removes a lobby member on leave and cancels when the host leaves', () => {
    let room = teamRoom()
    room = leaveRoom(room, 'u3')
    expect(room.players.u3).toBeUndefined()
    expect(room.memberUids).not.toContain('uid-3')
    expect(room.status).toBe('LOBBY')
    const cancelled = leaveRoom(room, 'u1')
    expect(cancelled.status).toBe('CANCELLED')
  })

  it('treats leaving mid-battle as a forfeit that can end the match', () => {
    let room = everyoneReady(makeRoom())
    room = joinRoom({ ...room, status: 'LOBBY' }, buildPvpPlayer(heroUser('u2'), 'uid-2', 1))!
    room = everyoneReady(room)
    room = startBattle(room, ['q1', 'q2'])
    const after = leaveRoom(room, 'u2')
    expect(after.players.u2.hp).toBe(0)
    expect(after.status).toBe('FINISHED')
    expect(after.winnerTeam).toBe(0)
  })
})

describe('battle', () => {
  const playingRoom = () => {
    let room = makeRoom()
    room = joinRoom(room, buildPvpPlayer(heroUser('u2'), 'uid-2', 1))!
    room = everyoneReady(room)
    return startBattle(room, ['q1', 'q2', 'q3'])
  }

  it('starts with round 1, restored hp, and the question order', () => {
    const room = playingRoom()
    expect(room.status).toBe('PLAYING')
    expect(room.battle?.round).toBe(1)
    expect(room.battle?.questionIds).toEqual(['q1', 'q2', 'q3'])
    expect(room.players.u1.hp).toBe(room.players.u1.maxHp)
    expect(currentQuestionId(room.battle!)).toBe('q1')
  })

  it('cycles questions when rounds outlast the bank', () => {
    const room = playingRoom()
    expect(currentQuestionId({ ...room.battle!, round: 4 })).toBe('q1')
    expect(currentQuestionId({ ...room.battle!, round: 5 })).toBe('q2')
  })

  it('shuffles deterministically with an injected rng and caps the bank', () => {
    const ids = Array.from({ length: 100 }, (_, index) => `q${index}`)
    const shuffled = shuffleQuestionIds(ids, () => 0.5)
    expect(shuffled).toHaveLength(PVP_MAX_QUESTIONS)
    expect(shuffleQuestionIds(['a', 'b', 'c'], () => 0)).toEqual(['b', 'c', 'a'])
  })

  it('lets the fastest correct answer strike a random enemy and advance the round', () => {
    const room = playingRoom()
    const next = resolveAnswer(room, 'u1', () => 0)!
    expect(next.battle?.round).toBe(2)
    const action = next.battle?.lastAction
    expect(action?.attackerId).toBe('u1')
    expect(action?.targetId).toBe('u2')
    expect(action?.damage).toBeGreaterThan(0)
    expect(next.players.u2.hp).toBe(next.players.u2.maxHp - action!.damage)
    expect(next.players.u1.damageDealt).toBe(action!.damage)
    expect(next.players.u1.answersWon).toBe(1)
  })

  it('finishes the match and credits the kill when the last enemy falls', () => {
    let room = playingRoom()
    room = { ...room, players: { ...room.players, u2: { ...room.players.u2, hp: 1 } } }
    const next = resolveAnswer(room, 'u1', () => 0)!
    expect(next.players.u2.hp).toBe(0)
    expect(next.players.u1.kills).toBe(1)
    expect(next.status).toBe('FINISHED')
    expect(next.winnerTeam).toBe(0)
    expect(next.battle?.lastAction?.defeated).toBe(true)
  })

  it('ignores answers from dead players or outside battle', () => {
    const room = playingRoom()
    const dead = { ...room, players: { ...room.players, u1: { ...room.players.u1, hp: 0 } } }
    expect(resolveAnswer(dead, 'u1', () => 0)).toBeNull()
    expect(resolveAnswer({ ...room, status: 'LOBBY' }, 'u1', () => 0)).toBeNull()
  })

  it('advances the round without damage on timeout', () => {
    const room = playingRoom()
    const next = advanceRoundOnTimeout(room)!
    expect(next.battle?.round).toBe(2)
    expect(next.battle?.lastAction).toBeNull()
    expect(next.players.u2.hp).toBe(next.players.u2.maxHp)
  })

  it('nominates the host (or the smallest alive userId) as timeout referee', () => {
    const room = playingRoom()
    expect(refereeId(room)).toBe('u1')
    const hostDead = { ...room, players: { ...room.players, u1: { ...room.players.u1, hp: 0 } } }
    expect(refereeId(hostDead)).toBe('u2')
  })

  it('scales damage with str and doubles on crit', () => {
    const base = pvpDamage({ str: 0, vit: 0, dex: 0, luk: 0 }, () => 0)
    const strong = pvpDamage({ str: 40, vit: 0, dex: 0, luk: 0 }, () => 0)
    expect(strong.damage).toBeGreaterThan(base.damage)
    expect(base.crit).toBe(false)
    const crit = pvpDamage({ str: 0, vit: 0, dex: 0, luk: 99 }, () => 0.95)
    expect(crit.crit).toBe(true)
    expect(crit.damage).toBeGreaterThanOrEqual(base.damage * 2 - 20)
  })
})

describe('results and rankings', () => {
  const finished = (): PvpRoom => {
    let room = makeRoom()
    room = joinRoom(room, buildPvpPlayer(heroUser('u2'), 'uid-2', 1))!
    room = everyoneReady(room)
    room = startBattle(room, ['q1'])
    room = {
      ...room,
      status: 'FINISHED',
      winnerTeam: 0,
      players: {
        ...room.players,
        u1: { ...room.players.u1, damageDealt: 120, kills: 1, answersWon: 4 },
        u2: { ...room.players.u2, hp: 0, damageDealt: 60, kills: 0, answersWon: 2 },
      },
    }
    return room
  }

  it('reports outcome per player', () => {
    const room = finished()
    expect(outcomeForPlayer(room, 'u1')).toBe('win')
    expect(outcomeForPlayer(room, 'u2')).toBe('lose')
    expect(outcomeForPlayer({ ...room, winnerTeam: null }, 'u1')).toBe('draw')
  })

  it('picks the MVP from the winning team by battle score', () => {
    expect(computeMvp(finished())).toBe('u1')
  })

  it('computes bounded ranking deltas and applies them with a floor of zero', () => {
    expect(rankingDelta('win')).toEqual({ wins: 1, losses: 0, rating: 25 })
    expect(rankingDelta('lose')).toEqual({ wins: 0, losses: 1, rating: -10 })
    const fresh = applyRankingDelta(null, rankingDelta('lose'), { userId: 'u1', name: 'ฟ้า', avatar: '🧙', level: 5, class: 'ป.5' })
    expect(fresh.rating).toBe(0)
    expect(fresh.losses).toBe(1)
    expect(fresh.matches).toBe(1)
    const grown = applyRankingDelta({ wins: 2, losses: 1, rating: 40, matches: 3 }, rankingDelta('win'), { userId: 'u1', name: 'ฟ้า', avatar: '🧙', level: 6, class: 'ป.5' })
    expect(grown).toMatchObject({ wins: 3, losses: 1, rating: 65, matches: 4, level: 6 })
  })

  it('grants clamped match rewards', () => {
    expect(pvpMatchReward('win').xp).toBeGreaterThan(pvpMatchReward('lose').xp)
    expect(pvpMatchReward('draw').xp).toBeGreaterThan(0)
  })

  it('exposes the round duration constant used by the UI timers', () => {
    expect(PVP_ROUND_SECONDS).toBeGreaterThanOrEqual(10)
  })
})
