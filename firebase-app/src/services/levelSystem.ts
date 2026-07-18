// MMORPG-style hero level curve, shared by every surface that turns XP into a
// level (lesson adventure, boss rewards, profile, dashboard, directory mirror).
// Replaces the legacy flat `floor(xp / 100) + 1` formula: early levels come fast
// to hook young players, then each level needs a little more than the last.
//
// XP to go from level N to N+1: 80 + 20 * (N - 1)  →  L1→2: 80, L2→3: 100, ...
// Firestore rules cap XP/coin deltas at ±1000 per write, so session reward
// flushes are clamped well below that (see clampSessionReward).

export const LEVEL_CAP = 99
export const BASE_LEVEL_UP_XP = 80
export const LEVEL_UP_XP_GROWTH = 20

export const SESSION_REWARD_XP_CAP = 400
export const SESSION_REWARD_COIN_CAP = 400

function sanitizeLevel(rawLevel: number): number {
  const level = Math.floor(Number(rawLevel))
  if (!Number.isFinite(level) || level < 1) return 1
  return level
}

export function xpForNextLevel(rawLevel: number): number {
  const level = sanitizeLevel(rawLevel)
  if (level >= LEVEL_CAP) return 0
  return BASE_LEVEL_UP_XP + LEVEL_UP_XP_GROWTH * (level - 1)
}

export function totalXpForLevel(rawLevel: number): number {
  const level = Math.min(LEVEL_CAP, sanitizeLevel(rawLevel))
  const steps = level - 1
  return steps * BASE_LEVEL_UP_XP + LEVEL_UP_XP_GROWTH * (steps * (steps - 1)) / 2
}

export function levelForXp(rawXp: unknown): number {
  const xp = Math.max(0, Number(rawXp) || 0)
  let level = 1
  while (level < LEVEL_CAP && xp >= totalXpForLevel(level + 1)) level += 1
  return level
}

export type LevelProgress = {
  level: number
  intoLevel: number
  requiredXp: number
  percent: number
}

export function levelProgress(rawXp: unknown): LevelProgress {
  const xp = Math.max(0, Number(rawXp) || 0)
  const level = levelForXp(xp)
  const requiredXp = xpForNextLevel(level)
  const intoLevel = Math.min(xp - totalXpForLevel(level), requiredXp || Number.MAX_SAFE_INTEGER)
  if (requiredXp === 0) return { level, intoLevel: 0, requiredXp: 0, percent: 100 }
  return { level, intoLevel, requiredXp, percent: (intoLevel / requiredXp) * 100 }
}

export function clampSessionReward(rawXp: number, rawCoins: number): { xp: number; coins: number } {
  const clamp = (value: number, max: number) => Math.min(max, Math.max(0, Math.floor(Number(value) || 0)))
  return { xp: clamp(rawXp, SESSION_REWARD_XP_CAP), coins: clamp(rawCoins, SESSION_REWARD_COIN_CAP) }
}
