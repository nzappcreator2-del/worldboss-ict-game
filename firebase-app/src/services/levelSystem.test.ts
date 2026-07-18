import { describe, expect, it } from 'vitest'
import {
  LEVEL_CAP,
  SESSION_REWARD_COIN_CAP,
  SESSION_REWARD_XP_CAP,
  clampSessionReward,
  levelForXp,
  levelProgress,
  totalXpForLevel,
  xpForNextLevel,
} from './levelSystem'

describe('xpForNextLevel', () => {
  it('starts cheap and grows linearly like an MMORPG curve', () => {
    expect(xpForNextLevel(1)).toBe(80)
    expect(xpForNextLevel(2)).toBe(100)
    expect(xpForNextLevel(3)).toBe(120)
    expect(xpForNextLevel(10)).toBe(260)
  })

  it('returns zero at or beyond the level cap', () => {
    expect(xpForNextLevel(LEVEL_CAP)).toBe(0)
    expect(xpForNextLevel(LEVEL_CAP + 5)).toBe(0)
  })

  it('treats invalid levels as level one', () => {
    expect(xpForNextLevel(0)).toBe(80)
    expect(xpForNextLevel(Number.NaN)).toBe(80)
  })
})

describe('totalXpForLevel', () => {
  it('accumulates the per-level requirements', () => {
    expect(totalXpForLevel(1)).toBe(0)
    expect(totalXpForLevel(2)).toBe(80)
    expect(totalXpForLevel(3)).toBe(180)
    expect(totalXpForLevel(4)).toBe(300)
    expect(totalXpForLevel(5)).toBe(440)
  })
})

describe('levelForXp', () => {
  it('maps xp totals onto the curve', () => {
    expect(levelForXp(0)).toBe(1)
    expect(levelForXp(79)).toBe(1)
    expect(levelForXp(80)).toBe(2)
    expect(levelForXp(350)).toBe(4)
    expect(levelForXp(440)).toBe(5)
  })

  it('never exceeds the cap and tolerates junk input', () => {
    expect(levelForXp(10_000_000)).toBe(LEVEL_CAP)
    expect(levelForXp(-50)).toBe(1)
    expect(levelForXp(Number.NaN)).toBe(1)
  })
})

describe('levelProgress', () => {
  it('reports xp into the current level and the requirement for the next', () => {
    const progress = levelProgress(350)
    expect(progress.level).toBe(4)
    expect(progress.intoLevel).toBe(50)
    expect(progress.requiredXp).toBe(140)
    expect(progress.percent).toBeCloseTo((50 / 140) * 100, 5)
  })

  it('pins percent to 100 at the level cap', () => {
    const progress = levelProgress(totalXpForLevel(LEVEL_CAP) + 999)
    expect(progress.level).toBe(LEVEL_CAP)
    expect(progress.requiredXp).toBe(0)
    expect(progress.percent).toBe(100)
  })
})

describe('clampSessionReward', () => {
  it('floors, clamps negatives to zero, and caps xp and coins per flush', () => {
    expect(clampSessionReward(37.8, 12.2)).toEqual({ xp: 37, coins: 12 })
    expect(clampSessionReward(-5, -9)).toEqual({ xp: 0, coins: 0 })
    expect(clampSessionReward(99_999, 99_999)).toEqual({ xp: SESSION_REWARD_XP_CAP, coins: SESSION_REWARD_COIN_CAP })
    expect(clampSessionReward(Number.NaN, undefined as unknown as number)).toEqual({ xp: 0, coins: 0 })
  })
})
