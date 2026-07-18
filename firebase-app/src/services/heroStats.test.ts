import { describe, expect, it } from 'vitest'
import {
  HERO_BASE_MAX_HP,
  HERO_POINTS_PER_LEVEL,
  HERO_STAT_KEYS,
  HERO_STAT_MAX,
  allocateHeroStat,
  heroCombatProfile,
  heroLevel,
  remainingStatPoints,
  sanitizeHeroStats,
  spentStatPoints,
  totalStatPoints,
} from './heroStats'

describe('hero stat sanitization', () => {
  it('fills missing or garbage input with zeroed stats', () => {
    expect(sanitizeHeroStats(undefined)).toEqual({ str: 0, vit: 0, dex: 0, luk: 0 })
    expect(sanitizeHeroStats(null)).toEqual({ str: 0, vit: 0, dex: 0, luk: 0 })
    expect(sanitizeHeroStats('junk')).toEqual({ str: 0, vit: 0, dex: 0, luk: 0 })
    expect(sanitizeHeroStats({ str: 'x', vit: -4, dex: 2.9, luk: 1000 })).toEqual({ str: 0, vit: 0, dex: 2, luk: HERO_STAT_MAX })
  })
})

describe('hero level and stat points', () => {
  it('prefers the stored level and falls back to the xp formula', () => {
    expect(heroLevel({ level: 8 })).toBe(8)
    expect(heroLevel({ xp: 250 })).toBe(3)
    expect(heroLevel({})).toBe(1)
  })

  it('grants points per level above one', () => {
    expect(totalStatPoints(1)).toBe(0)
    expect(totalStatPoints(8)).toBe(7 * HERO_POINTS_PER_LEVEL)
    expect(totalStatPoints(0)).toBe(0)
  })

  it('computes remaining points from the user document', () => {
    const user = { level: 8, inventory: { stats: { str: 3, vit: 2, dex: 0, luk: 1 } } }
    expect(spentStatPoints({ str: 3, vit: 2, dex: 0, luk: 1 })).toBe(6)
    expect(remainingStatPoints(user)).toBe(21 - 6)
    expect(remainingStatPoints({ level: 1 })).toBe(0)
  })
})

describe('hero combat profile', () => {
  it('returns exactly the legacy combat constants when no stats exist', () => {
    expect(heroCombatProfile(undefined)).toEqual({
      maxHp: HERO_BASE_MAX_HP,
      bonusAttack: 0,
      critThreshold: 0.9,
      varianceFloor: 0,
    })
  })

  it('derives combat bonuses from STR/VIT/DEX/LUK', () => {
    const profile = heroCombatProfile({ str: 5, vit: 5, dex: 6, luk: 10 })
    expect(profile.maxHp).toBe(130)
    expect(profile.bonusAttack).toBe(10)
    expect(profile.critThreshold).toBeCloseTo(0.85, 5)
    expect(profile.varianceFloor).toBe(3)
  })

  it('caps the crit threshold floor and the variance ceiling', () => {
    const maxed = heroCombatProfile({ str: 0, vit: 0, dex: 99, luk: 99 })
    expect(maxed.critThreshold).toBe(0.5)
    expect(maxed.varianceFloor).toBe(6)
  })
})

describe('stat allocation', () => {
  const user = { level: 8, xp: 700, inventory: { badges: ['badge_a'], dailyDone: ['q1'], stats: { str: 1, vit: 0, dex: 0, luk: 0 } } }

  it('allocates a point and preserves the rest of the inventory', () => {
    const outcome = allocateHeroStat(user, 'str')
    if (!outcome.success) throw new Error('expected success')
    expect(outcome.stats.str).toBe(2)
    expect(outcome.remaining).toBe(21 - 2)
    expect(outcome.inventory.badges).toEqual(['badge_a'])
    expect(outcome.inventory.dailyDone).toEqual(['q1'])
    expect(outcome.inventory.stats).toEqual({ str: 2, vit: 0, dex: 0, luk: 0 })
  })

  it('rejects unknown stat keys', () => {
    const outcome = allocateHeroStat(user, 'int')
    expect(outcome.success).toBe(false)
  })

  it('rejects when no points remain', () => {
    const spent = { level: 2, inventory: { stats: { str: 3, vit: 0, dex: 0, luk: 0 } } }
    const outcome = allocateHeroStat(spent, 'vit')
    expect(outcome.success).toBe(false)
  })

  it('rejects allocation past the stat cap', () => {
    const capped = { level: 99, inventory: { stats: { str: HERO_STAT_MAX, vit: 0, dex: 0, luk: 0 } } }
    const outcome = allocateHeroStat(capped, 'str')
    expect(outcome.success).toBe(false)
  })

  it('works for users who have never allocated before', () => {
    const fresh = { level: 3, inventory: { potion: 1 } }
    const outcome = allocateHeroStat(fresh, 'luk')
    if (!outcome.success) throw new Error('expected success')
    expect(outcome.stats).toEqual({ str: 0, vit: 0, dex: 0, luk: 1 })
    expect(outcome.inventory.potion).toBe(1)
  })

  it('exposes the four RO stat keys', () => {
    expect(HERO_STAT_KEYS).toEqual(['str', 'vit', 'dex', 'luk'])
  })
})
