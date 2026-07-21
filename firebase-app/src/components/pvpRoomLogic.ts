// Pure rules for the renovated PVP arena: duel (1v1) and team (2v2/3v3/4v4)
// rooms, the lobby ready flow, and the quiz-race battle where the fastest
// correct answer strikes a random enemy. Firestore wiring lives in
// services/pvpRoomApi.ts; this module stays synchronous and testable.

import { cosmeticsState, type CosmeticSlot } from '../services/gameLogic'
import { heroCombatProfile, heroLevel, sanitizeHeroStats, type HeroStats } from '../services/heroStats'

export type PvpRoomMode = 'duel' | 'team'
export type PvpTeam = 0 | 1
export type PvpRoomStatus = 'LOBBY' | 'PLAYING' | 'FINISHED' | 'CANCELLED'
export type PvpOutcome = 'win' | 'lose' | 'draw'

export type PvpEquipped = Partial<Record<CosmeticSlot, string>>

export type PvpPlayer = {
  userId: string
  uid: string
  name: string
  avatar: string
  gender: '' | 'male' | 'female'
  equipped: PvpEquipped
  level: number
  stats: HeroStats
  team: PvpTeam
  ready: boolean
  hp: number
  maxHp: number
  damageDealt: number
  kills: number
  answersWon: number
}

export type PvpBattleAction = {
  round: number
  attackerId: string
  targetId: string
  damage: number
  crit: boolean
  defeated: boolean
}

export type PvpBattle = {
  round: number
  questionIds: string[]
  lastAction: PvpBattleAction | null
}

export type PvpRoom = {
  roomId: string
  mode: PvpRoomMode
  teamSize: number
  isPrivate: boolean
  hostId: string
  hostUid: string
  status: PvpRoomStatus
  memberUids: string[]
  players: Record<string, PvpPlayer>
  battle: PvpBattle | null
  winnerTeam: PvpTeam | null
  [key: string]: unknown
}

export type PvpRankingDoc = {
  userId: string
  name: string
  avatar: string
  level: number
  class: string
  wins: number
  losses: number
  rating: number
  matches: number
}

export const PVP_ROUND_SECONDS = 20
export const PVP_MAX_QUESTIONS = 60
export const PVP_TEAM_SIZES = [2, 3, 4] as const
// Everyone gets this long to spot the countdown before round 1 opens.
export const PVP_COUNTDOWN_SECONDS = 4
export const PVP_RATING_WIN = 25
export const PVP_RATING_LOSS = -10

// Feet-position bounds matched to the stone courtyard in pvp-lobby-courtyard.jpg.
// Keeping this in the pure rules module also lets incoming realtime presence
// from older clients be projected back onto the playable floor before render.
export const PVP_LOBBY_WALK_BOUNDS = { minX: 6, maxX: 94, minY: 52, maxY: 86 } as const

export function clampPvpLobbyPosition(position: { x: number; y: number }) {
  const x = Number.isFinite(position.x) ? position.x : 50
  const y = Number.isFinite(position.y) ? position.y : 68
  return {
    x: Math.min(PVP_LOBBY_WALK_BOUNDS.maxX, Math.max(PVP_LOBBY_WALK_BOUNDS.minX, x)),
    y: Math.min(PVP_LOBBY_WALK_BOUNDS.maxY, Math.max(PVP_LOBBY_WALK_BOUNDS.minY, y)),
  }
}

const PVP_BASE_DAMAGE = 16
const PVP_VARIANCE_MAX = 10
const PVP_CRIT_MULTIPLIER = 2

export function sanitizeRoomCode(raw: unknown): string {
  return String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
}

export function validRoomCode(code: string): boolean {
  return /^[A-Z0-9]{4,8}$/.test(code)
}

function clampTeamSize(mode: PvpRoomMode, rawSize: number): number {
  if (mode === 'duel') return 1
  const size = Math.floor(Number(rawSize) || 0)
  return Math.min(4, Math.max(2, size))
}

export function buildPvpPlayer(
  user: { id: string; name?: unknown; avatar?: unknown; gender?: unknown; level?: unknown; xp?: unknown; class?: unknown; inventory?: unknown },
  uid: string,
  team: PvpTeam,
): PvpPlayer {
  const inventory = user.inventory && typeof user.inventory === 'object' ? user.inventory as Record<string, unknown> : {}
  const stats = sanitizeHeroStats(inventory.stats)
  const profile = heroCombatProfile(stats)
  const gender = user.gender === 'male' || user.gender === 'female' ? user.gender : ''
  return {
    userId: user.id,
    uid,
    name: String(user.name || ''),
    avatar: String(user.avatar || '🧙‍♂️'),
    gender,
    equipped: cosmeticsState(inventory, gender).equipped,
    level: heroLevel(user),
    stats,
    team,
    ready: false,
    hp: profile.maxHp,
    maxHp: profile.maxHp,
    damageDealt: 0,
    kills: 0,
    answersWon: 0,
  }
}

export function newRoom(roomId: string, mode: PvpRoomMode, teamSize: number, isPrivate: boolean, host: PvpPlayer): PvpRoom {
  return {
    roomId,
    mode,
    teamSize: clampTeamSize(mode, teamSize),
    isPrivate,
    hostId: host.userId,
    hostUid: host.uid,
    status: 'LOBBY',
    memberUids: [host.uid],
    players: { [host.userId]: { ...host, team: 0 } },
    battle: null,
    winnerTeam: null,
  }
}

export function teamMembers(room: PvpRoom, team: PvpTeam): PvpPlayer[] {
  return Object.values(room.players).filter((player) => player.team === team)
}

export function aliveMembers(room: PvpRoom, team: PvpTeam): PvpPlayer[] {
  return teamMembers(room, team).filter((player) => player.hp > 0)
}

export function pickTeamForJoin(room: PvpRoom): PvpTeam | null {
  const zero = teamMembers(room, 0).length
  const one = teamMembers(room, 1).length
  if (zero < room.teamSize && zero <= one) return 0
  if (one < room.teamSize) return 1
  if (zero < room.teamSize) return 0
  return null
}

export function canJoinRoom(room: PvpRoom, userId: string): boolean {
  return room.status === 'LOBBY'
    && !room.players[userId]
    && Object.keys(room.players).length < room.teamSize * 2
}

export function joinRoom(room: PvpRoom, player: PvpPlayer): PvpRoom | null {
  if (!canJoinRoom(room, player.userId)) return null
  if (teamMembers(room, player.team).length >= room.teamSize) return null
  return {
    ...room,
    memberUids: [...room.memberUids, player.uid],
    players: { ...room.players, [player.userId]: { ...player, ready: false } },
  }
}

export function leaveRoom(room: PvpRoom, userId: string): PvpRoom {
  const player = room.players[userId]
  if (!player) return room
  if (room.status === 'LOBBY') {
    const players = { ...room.players }
    delete players[userId]
    const next: PvpRoom = {
      ...room,
      players,
      memberUids: room.memberUids.filter((uid) => uid !== player.uid),
    }
    if (userId === room.hostId || Object.keys(players).length === 0) next.status = 'CANCELLED'
    return next
  }
  if (room.status !== 'PLAYING') return room
  // Mid-battle exit = forfeit: the deserter drops to 0 HP but stays on the
  // scoreboard so the summary screen still shows the full match.
  let next: PvpRoom = { ...room, players: { ...room.players, [userId]: { ...player, hp: 0 } } }
  const enemyTeam: PvpTeam = player.team === 0 ? 1 : 0
  if (aliveMembers(next, player.team).length === 0) {
    next = { ...next, status: 'FINISHED', winnerTeam: enemyTeam }
  }
  return next
}

export function toggleRoomReady(room: PvpRoom, userId: string, ready: boolean): PvpRoom {
  const player = room.players[userId]
  if (!player || room.status !== 'LOBBY') return room
  return { ...room, players: { ...room.players, [userId]: { ...player, ready } } }
}

export function switchTeam(room: PvpRoom, userId: string): PvpRoom | null {
  const player = room.players[userId]
  if (!player || room.status !== 'LOBBY') return null
  const target: PvpTeam = player.team === 0 ? 1 : 0
  if (teamMembers(room, target).length >= room.teamSize) return null
  return { ...room, players: { ...room.players, [userId]: { ...player, team: target, ready: false } } }
}

export function setRoomTeamSize(room: PvpRoom, rawSize: number): PvpRoom | null {
  if (room.status !== 'LOBBY') return null
  if (room.mode === 'duel') return rawSize === 1 ? room : null
  const size = Math.floor(Number(rawSize) || 0)
  if (!PVP_TEAM_SIZES.includes(size as typeof PVP_TEAM_SIZES[number])) return null
  if (teamMembers(room, 0).length > size || teamMembers(room, 1).length > size) return null
  return { ...room, teamSize: size }
}

export function canStartBattle(room: PvpRoom): { ok: boolean; reason: string } {
  if (room.status !== 'LOBBY') return { ok: false, reason: 'ห้องนี้ไม่อยู่ในสถานะรอเริ่ม' }
  const players = Object.values(room.players)
  if (players.length < 2) return { ok: false, reason: 'ต้องมีผู้เล่นอย่างน้อย 2 คน' }
  if (teamMembers(room, 0).length === 0 || teamMembers(room, 1).length === 0) {
    return { ok: false, reason: 'ทั้งสองทีมต้องมีผู้เล่น' }
  }
  if (players.some((player) => !player.ready)) return { ok: false, reason: 'รอผู้เล่นทุกคนกดพร้อม' }
  return { ok: true, reason: '' }
}

export function shuffleQuestionIds(ids: string[], rng: () => number): string[] {
  const pool = [...ids]
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1))
    ;[pool[index], pool[swap]] = [pool[swap], pool[index]]
  }
  return pool.slice(0, PVP_MAX_QUESTIONS)
}

export function startBattle(room: PvpRoom, questionIds: string[]): PvpRoom {
  const players: Record<string, PvpPlayer> = {}
  for (const [id, player] of Object.entries(room.players)) {
    players[id] = { ...player, hp: player.maxHp, damageDealt: 0, kills: 0, answersWon: 0 }
  }
  return {
    ...room,
    status: 'PLAYING',
    winnerTeam: null,
    players,
    battle: { round: 1, questionIds, lastAction: null },
  }
}

export function currentQuestionId(battle: PvpBattle): string {
  if (battle.questionIds.length === 0) return ''
  return battle.questionIds[(battle.round - 1) % battle.questionIds.length]
}

export function pvpDamage(rawStats: unknown, rng: () => number): { damage: number; crit: boolean } {
  const profile = heroCombatProfile(rawStats)
  const spread = PVP_VARIANCE_MAX - profile.varianceFloor + 1
  const variance = Math.floor(profile.varianceFloor + rng() * spread)
  const strBonus = Math.floor(profile.bonusAttack / 4)
  const crit = rng() >= profile.critThreshold
  const damage = (PVP_BASE_DAMAGE + Math.min(PVP_VARIANCE_MAX, variance) + strBonus) * (crit ? PVP_CRIT_MULTIPLIER : 1)
  return { damage, crit }
}

export function resolveAnswer(room: PvpRoom, attackerId: string, rng: () => number): PvpRoom | null {
  if (room.status !== 'PLAYING' || !room.battle) return null
  const attacker = room.players[attackerId]
  if (!attacker || attacker.hp <= 0) return null
  const enemyTeam: PvpTeam = attacker.team === 0 ? 1 : 0
  const targets = aliveMembers(room, enemyTeam)
  if (targets.length === 0) return null
  const target = targets[Math.min(targets.length - 1, Math.floor(rng() * targets.length))]
  const { damage, crit } = pvpDamage(attacker.stats, rng)
  const nextHp = Math.max(0, target.hp - damage)
  const defeated = target.hp > 0 && nextHp === 0
  const players: Record<string, PvpPlayer> = {
    ...room.players,
    [target.userId]: { ...target, hp: nextHp },
    [attackerId]: {
      ...attacker,
      damageDealt: attacker.damageDealt + damage,
      kills: attacker.kills + (defeated ? 1 : 0),
      answersWon: attacker.answersWon + 1,
    },
  }
  const next: PvpRoom = {
    ...room,
    players,
    battle: {
      ...room.battle,
      round: room.battle.round + 1,
      lastAction: { round: room.battle.round, attackerId, targetId: target.userId, damage, crit, defeated },
    },
  }
  if (aliveMembers(next, enemyTeam).length === 0) {
    next.status = 'FINISHED'
    next.winnerTeam = attacker.team
  }
  return next
}

export function advanceRoundOnTimeout(room: PvpRoom): PvpRoom | null {
  if (room.status !== 'PLAYING' || !room.battle) return null
  return { ...room, battle: { ...room.battle, round: room.battle.round + 1, lastAction: null } }
}

// Timeout rounds are advanced by exactly one designated client so slow rooms
// never double-skip: the host while alive, otherwise the smallest alive userId.
export function refereeId(room: PvpRoom): string {
  const alive = Object.values(room.players).filter((player) => player.hp > 0)
  if (alive.some((player) => player.userId === room.hostId)) return room.hostId
  const sorted = alive.map((player) => player.userId).sort()
  return sorted[0] || room.hostId
}

export function outcomeForPlayer(room: PvpRoom, userId: string): PvpOutcome {
  const player = room.players[userId]
  if (!player || room.winnerTeam === null) return 'draw'
  return room.winnerTeam === player.team ? 'win' : 'lose'
}

export function battleScore(player: PvpPlayer): number {
  return player.damageDealt + player.kills * 40 + player.answersWon * 10
}

export function computeMvp(room: PvpRoom): string {
  const pool = room.winnerTeam === null
    ? Object.values(room.players)
    : teamMembers(room, room.winnerTeam)
  const ranked = [...pool].sort((a, b) => battleScore(b) - battleScore(a) || a.userId.localeCompare(b.userId))
  return ranked[0]?.userId || ''
}

export function rankingDelta(outcome: PvpOutcome): { wins: number; losses: number; rating: number } {
  if (outcome === 'win') return { wins: 1, losses: 0, rating: PVP_RATING_WIN }
  if (outcome === 'lose') return { wins: 0, losses: 1, rating: PVP_RATING_LOSS }
  return { wins: 0, losses: 0, rating: 5 }
}

export function applyRankingDelta(
  current: { wins?: unknown; losses?: unknown; rating?: unknown; matches?: unknown } | null,
  delta: { wins: number; losses: number; rating: number },
  snapshot: { userId: string; name: string; avatar: string; level: number; class: string },
): PvpRankingDoc {
  const wins = (Number(current?.wins) || 0) + delta.wins
  const losses = (Number(current?.losses) || 0) + delta.losses
  const rating = Math.max(0, (Number(current?.rating) || 0) + delta.rating)
  const matches = (Number(current?.matches) || 0) + 1
  return { ...snapshot, wins, losses, rating, matches }
}

// Flushed through the same clamped session-reward path the lesson adventure
// uses, so Firestore's ±1000 delta cap and level recompute stay authoritative.
export function pvpMatchReward(outcome: PvpOutcome): { xp: number; coins: number } {
  if (outcome === 'win') return { xp: 60, coins: 30 }
  if (outcome === 'lose') return { xp: 20, coins: 10 }
  return { xp: 35, coins: 15 }
}
