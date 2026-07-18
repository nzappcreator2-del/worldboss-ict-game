// Ragnarok-style stat allocation: pure functions only. Persistence lives at
// users/{id}.inventory.stats (see firestoreApi.allocateStatPoint) so no Firestore
// rules changes are needed — `inventory` is already an unvalidated player-data bag.

import { levelForXp } from './levelSystem'

export const HERO_STAT_KEYS = ['str', 'vit', 'dex', 'luk'] as const
export type HeroStatKey = typeof HERO_STAT_KEYS[number]
export type HeroStats = Record<HeroStatKey, number>

export const HERO_POINTS_PER_LEVEL = 3
export const HERO_STAT_MAX = 99
export const HERO_BASE_MAX_HP = 100

export const STR_ATTACK_PER_POINT = 2
export const VIT_MAX_HP_PER_POINT = 6
export const LUK_CRIT_PER_POINT = 0.005
export const HERO_MIN_CRIT_THRESHOLD = 0.5
export const HERO_BASE_CRIT_THRESHOLD = 0.9
export const HERO_MAX_VARIANCE_FLOOR = 6

function sanitizeStatValue(raw: unknown): number {
  const num = Math.floor(Number(raw))
  if (!Number.isFinite(num) || num < 0) return 0
  return Math.min(HERO_STAT_MAX, num)
}

export function sanitizeHeroStats(raw: unknown): HeroStats {
  const source = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  return {
    str: sanitizeStatValue(source.str),
    vit: sanitizeStatValue(source.vit),
    dex: sanitizeStatValue(source.dex),
    luk: sanitizeStatValue(source.luk),
  }
}

export function heroLevel(user: { level?: unknown; xp?: unknown }): number {
  const level = Number(user.level)
  if (Number.isFinite(level) && level >= 1) return Math.floor(level)
  return levelForXp(user.xp)
}

export function totalStatPoints(level: number): number {
  return Math.max(0, Math.floor(level) - 1) * HERO_POINTS_PER_LEVEL
}

export function spentStatPoints(stats: HeroStats): number {
  return stats.str + stats.vit + stats.dex + stats.luk
}

export function remainingStatPoints(user: { level?: unknown; xp?: unknown; inventory?: unknown }): number {
  const inventory = user.inventory && typeof user.inventory === 'object' ? user.inventory as Record<string, unknown> : {}
  const stats = sanitizeHeroStats(inventory.stats)
  return Math.max(0, totalStatPoints(heroLevel(user)) - spentStatPoints(stats))
}

export type HeroCombatProfile = {
  maxHp: number
  bonusAttack: number
  critThreshold: number
  varianceFloor: number
}

export function heroCombatProfile(rawStats: unknown): HeroCombatProfile {
  const stats = sanitizeHeroStats(rawStats)
  return {
    maxHp: HERO_BASE_MAX_HP + stats.vit * VIT_MAX_HP_PER_POINT,
    bonusAttack: stats.str * STR_ATTACK_PER_POINT,
    critThreshold: Math.max(HERO_MIN_CRIT_THRESHOLD, HERO_BASE_CRIT_THRESHOLD - stats.luk * LUK_CRIT_PER_POINT),
    varianceFloor: Math.min(HERO_MAX_VARIANCE_FLOOR, Math.floor(stats.dex / 2)),
  }
}

export type StatAllocationOutcome =
  | { success: true; stats: HeroStats; inventory: Record<string, unknown>; remaining: number }
  | { success: false; error: string }

export function allocateHeroStat(user: Record<string, unknown>, rawKey: unknown): StatAllocationOutcome {
  const key = rawKey as HeroStatKey
  if (!HERO_STAT_KEYS.includes(key)) return { success: false, error: 'ค่าสเตตัสไม่ถูกต้อง' }

  const level = heroLevel(user as { level?: unknown; xp?: unknown })
  const inventory = user.inventory && typeof user.inventory === 'object' ? user.inventory as Record<string, unknown> : {}
  const stats = sanitizeHeroStats(inventory.stats)
  const remaining = totalStatPoints(level) - spentStatPoints(stats)
  if (remaining <= 0) return { success: false, error: 'แต้มสเตตัสไม่พอ' }
  if (stats[key] >= HERO_STAT_MAX) return { success: false, error: 'ค่าสเตตัสนี้เต็มแล้ว' }

  const nextStats: HeroStats = { ...stats, [key]: stats[key] + 1 }
  return {
    success: true,
    stats: nextStats,
    inventory: { ...inventory, stats: nextStats },
    remaining: remaining - 1,
  }
}
