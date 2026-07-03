import { describe, expect, it } from 'vitest'
import {
  applyDailyProgress,
  applyLoginBonus,
  buyInventoryItem,
  completeQuest,
  pickGachaAvatar,
  resetDailyState,
  consumeInventoryItem,
  worldBossResult,
} from './gameLogic'

describe('daily quest logic', () => {
  it('resets progress and completion when the date changes', () => {
    expect(resetDailyState({ dailyDate: '2026-06-27', dailyDone: ['play1'] }, '2026-06-28')).toMatchObject({
      dailyDate: '2026-06-28', dailyDone: [], dailyProgress: { play1: 0, correct5: 0 }, dailyAnswers: [],
    })
  })

  it('does not count the same correct answer twice', () => {
    const first = applyDailyProgress({}, '2026-06-28', 'correct5', 1, 'Q1')
    const duplicate = applyDailyProgress(first.inventory, '2026-06-28', 'correct5', 1, 'Q1')
    expect(first.newProgress).toBe(1)
    expect(duplicate).toMatchObject({ status: 'duplicate_answer', newProgress: 1 })
  })

  it('awards login once per day and preserves a consecutive streak', () => {
    const result = applyLoginBonus({ coins: 10, streak: 2, lastLogin: '2026-06-27', inventory: {} }, '2026-06-28')
    expect(result).toMatchObject({ isNew: true, streak: 3, totalCoins: 30, coinsGained: 20 })
    expect(applyLoginBonus({ coins: 30, streak: 3, lastLogin: '2026-06-28', inventory: result.inventory }, '2026-06-28')).toMatchObject({ isNew: false, coins: 30 })
  })

  it('prevents claiming a completed quest twice', () => {
    expect(completeQuest({ coins: 10, xp: 20, inventory: { dailyDate: '2026-06-28', dailyDone: ['play1'] } }, '2026-06-28', 'play1', 5, 5)).toMatchObject({ success: false })
  })
})

describe('inventory and gacha logic', () => {
  it('uses server prices and rejects insufficient coins', () => {
    expect(buyInventoryItem(99, {}, 'potion')).toMatchObject({ success: false })
    expect(buyInventoryItem(150, {}, 'potion')).toMatchObject({ success: true, coins: 50, inventory: { potion: 1 } })
    expect(buyInventoryItem(999, {}, 'unknown')).toMatchObject({ success: false })
  })

  it('cannot use a missing item', () => {
    expect(consumeInventoryItem({}, 'potion')).toMatchObject({ success: false })
    expect(consumeInventoryItem({ potion: 2 }, 'potion')).toEqual({ success: true, inventory: { potion: 1 } })
  })

  it('uses weighted gacha boundaries deterministically', () => {
    expect(pickGachaAvatar(0)).toMatchObject({ emoji: '🐵', rarity: 'Common' })
    expect(pickGachaAvatar(0.999)).toMatchObject({ emoji: '👽', rarity: 'Mythic' })
  })
})

describe('world boss result', () => {
  it('treats lower time as better for normal bosses', () => {
    expect(worldBossResult('WB001', 8.456, 10)).toEqual({ cleanScore: 8.46, isPersonalBest: true, bestScore: 8.46 })
  })

  it('treats higher score as better for WB002 challenge variants', () => {
    expect(worldBossResult('WB002_10', 8, 10)).toEqual({ cleanScore: 8, isPersonalBest: false, bestScore: 10 })
  })

  it('treats higher quiz score as better for WB003', () => {
    expect(worldBossResult('WB003', 9, 7)).toEqual({ cleanScore: 9, isPersonalBest: true, bestScore: 9 })
  })
})
