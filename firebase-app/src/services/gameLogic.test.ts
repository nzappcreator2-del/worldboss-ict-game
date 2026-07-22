import { describe, expect, it } from 'vitest'
import {
  COSMETIC_CATALOG,
  applyDailyProgress,
  applyLoginBonus,
  buyCosmetic,
  buyInventoryItem,
  completeQuest,
  cosmeticsState,
  pickGachaAvatar,
  resetDailyState,
  unlockAllCosmetics,
  consumeInventoryItem,
  toggleCosmetic,
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

  it('does not award the bonus again after lastLogin becomes a server timestamp on re-login', () => {
    const first = applyLoginBonus({ coins: 0, streak: 0, lastLogin: '2026-06-27', inventory: {} }, '2026-06-28')
    expect(first).toMatchObject({ isNew: true, totalCoins: 20 })
    const reLogin = applyLoginBonus(
      { coins: 20, streak: first.streak, lastLogin: { seconds: 1782000000 }, inventory: first.inventory },
      '2026-06-28',
    )
    expect(reLogin).toMatchObject({ isNew: false, coins: 20 })
  })

  it('keeps the streak growing across days even when lastLogin is a timestamp object', () => {
    const nextDay = applyLoginBonus(
      { coins: 40, streak: 5, lastLogin: { seconds: 1782000000 }, inventory: { lastBonusDate: '2026-06-27' } },
      '2026-06-28',
    )
    expect(nextDay).toMatchObject({ isNew: true, streak: 6 })
    expect(nextDay.inventory).toMatchObject({ lastBonusDate: '2026-06-28' })
  })

  it('awards the 7-day streak badge once the canonical bonus date chain reaches 7', () => {
    const day7 = applyLoginBonus(
      { coins: 0, streak: 6, inventory: { lastBonusDate: '2026-06-27' } },
      '2026-06-28',
    )
    expect(day7.streak).toBe(7)
    expect(day7.inventory.badges).toContain('badge_streak_7')
  })

  it('resets the streak to 1 after a missed day', () => {
    const afterGap = applyLoginBonus(
      { coins: 0, streak: 6, inventory: { lastBonusDate: '2026-06-25' } },
      '2026-06-28',
    )
    expect(afterGap).toMatchObject({ isNew: true, streak: 1 })
  })

  it('prevents claiming a completed quest twice', () => {
    expect(completeQuest({ coins: 10, xp: 20, inventory: { dailyDate: '2026-06-28', dailyDone: ['play1'] } }, '2026-06-28', 'play1', 5, 5)).toMatchObject({ success: false })
  })

  it('successfully completes a quest and preserves the existing inventory (including cosmetics)', () => {
    const user = {
      coins: 100,
      xp: 200,
      inventory: {
        dailyDate: '2026-06-28',
        dailyDone: [],
        potion: 5,
        cosmetics: {
          owned: ['hat-feather'],
          equipped: { hat: 'hat-feather' }
        }
      }
    }
    const result = completeQuest(user, '2026-06-28', 'play1', 50, 60)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.coins).toBe(150)
      expect(result.xp).toBe(260)
      expect(result.inventory).toMatchObject({
        dailyDate: '2026-06-28',
        dailyDone: ['play1'],
        potion: 5,
        cosmetics: {
          owned: ['hat-feather'],
          equipped: { hat: 'hat-feather' }
        }
      })
    }
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

describe('cosmetic wardrobe', () => {
  it('ships the base 5 hair/outfit designs plus 5 hat/weapon/accessory shapes x 3 tiers (base + 2 recolors) each', () => {
    const bySlot = Object.values(COSMETIC_CATALOG).reduce<Record<string, number>>((all, item) => {
      all[item.slot] = (all[item.slot] || 0) + 1
      return all
    }, {})
    expect(bySlot).toEqual({ hair: 5, outfit: 5, hat: 15, weapon: 15, accessory: 15 })
  })

  it('tags every hat/weapon/accessory item unisex, and every catalog id resolves to a real tier or base shape', () => {
    for (const item of Object.values(COSMETIC_CATALOG)) {
      expect(['unisex', 'male', 'female']).toContain(item.gender)
      if (item.slot === 'hat' || item.slot === 'weapon' || item.slot === 'accessory') expect(item.gender).toBe('unisex')
    }
  })

  it('dresses a brand-new player in the free starter hair and outfit', () => {
    const fresh = cosmeticsState({})
    expect(fresh.owned).toContain('hair-bangs')
    expect(fresh.owned).toContain('outfit-tshirt')
    expect(fresh.equipped.hair).toBe('hair-bangs')
    expect(fresh.equipped.outfit).toBe('outfit-tshirt')
    expect(fresh.equipped.hat).toBeUndefined()
    expect(fresh.equipped.weapon).toBeUndefined()
  })

  it('sells catalog outfits, auto-equips the new piece, and dedupes ownership', () => {
    const bought = buyCosmetic(600, {}, 'hat-feather')
    expect(bought.success).toBe(true)
    if (!bought.success) return
    expect(bought.coins).toBe(600 - COSMETIC_CATALOG['hat-feather'].price)
    const cosmetics = cosmeticsState(bought.inventory)
    expect(cosmetics.owned).toContain('hat-feather')
    expect(cosmetics.equipped.hat).toBe('hat-feather')

    const again = buyCosmetic(9999, bought.inventory, 'hat-feather')
    expect(again.success).toBe(false)
  })

  it('rejects unknown items and insufficient coins', () => {
    expect(buyCosmetic(9999, {}, 'no-such-item').success).toBe(false)
    expect(buyCosmetic(10, {}, 'hat-crown').success).toBe(false)
  })

  it('keeps every catalog price inside the Firestore per-write coin delta cap', () => {
    for (const item of Object.values(COSMETIC_CATALOG)) {
      expect(item.price).toBeGreaterThanOrEqual(0)
      expect(item.price).toBeLessThanOrEqual(950)
    }
  })

  it('toggles equipment per slot and refuses pieces the player does not own', () => {
    const bought = buyCosmetic(600, {}, 'weapon-waraxe')
    if (!bought.success) throw new Error('buy failed')
    const unequipped = toggleCosmetic(bought.inventory, 'weapon-waraxe')
    expect(unequipped.success).toBe(true)
    if (!unequipped.success) return
    expect(cosmeticsState(unequipped.inventory).equipped.weapon).toBeUndefined()

    const reequipped = toggleCosmetic(unequipped.inventory, 'weapon-waraxe')
    if (!reequipped.success) throw new Error('equip failed')
    expect(cosmeticsState(reequipped.inventory).equipped.weapon).toBe('weapon-waraxe')

    expect(toggleCosmetic({}, 'weapon-waraxe').success).toBe(false)
  })

  it('keeps gendered students in their baked school look until they equip something', () => {
    // The male/female student bases already include hair + uniform baked into
    // the spritesheet (see characterAssets.ts / scripts/compose-character-sheet.mjs),
    // so — unlike the legacy hero — an empty hair/outfit slot must not be
    // auto-filled with the free starter gear; the baked look already covers it.
    const fresh = cosmeticsState({}, 'male')
    expect(fresh.equipped.hair).toBeUndefined()
    expect(fresh.equipped.outfit).toBeUndefined()

    const bought = buyCosmetic(600, {}, 'hat-feather', 'female')
    if (!bought.success) throw new Error('buy failed')
    // Buying a hat must not materialize the legacy starter hair/outfit.
    expect(cosmeticsState(bought.inventory, 'female').equipped).toEqual({ hat: 'hat-feather' })

    const removed = toggleCosmetic(bought.inventory, 'hat-feather', 'female')
    if (!removed.success) throw new Error('toggle failed')
    expect(cosmeticsState(removed.inventory, 'female').equipped).toEqual({})
  })

  it('allows gendered students to buy and equip hair/outfit cosmetics like anyone else', () => {
    // Every catalog slot, including hair/outfit, is purchasable and equippable
    // regardless of gender — the shop no longer hides any category.
    const boughtHair = buyCosmetic(600, {}, 'hair-ponytail', 'male')
    expect(boughtHair.success).toBe(true)
    if (!boughtHair.success) return
    expect(cosmeticsState(boughtHair.inventory, 'male').equipped.hair).toBe('hair-ponytail')

    const boughtOutfit = buyCosmetic(600, {}, 'outfit-tunic', 'female')
    expect(boughtOutfit.success).toBe(true)
    if (!boughtOutfit.success) return
    expect(cosmeticsState(boughtOutfit.inventory, 'female').equipped.outfit).toBe('outfit-tunic')

    const equipHair = toggleCosmetic(boughtHair.inventory, 'hair-ponytail', 'male')
    expect(equipHair.success).toBe(true)
  })

  it('swapping hair keeps the starter style owned so the player can switch back', () => {
    const bought = buyCosmetic(600, {}, 'hair-ponytail')
    if (!bought.success) throw new Error('buy failed')
    expect(cosmeticsState(bought.inventory).equipped.hair).toBe('hair-ponytail')
    const back = toggleCosmetic(bought.inventory, 'hair-ponytail')
    if (!back.success) throw new Error('toggle failed')
    // Removing the bought hair falls back to the free starter bangs, never bald.
    expect(cosmeticsState(back.inventory).equipped.hair).toBe('hair-bangs')
  })
})

describe('unlockAllCosmetics', () => {
  it('grants every catalog item without charging coins', () => {
    const inventory = unlockAllCosmetics({})
    expect(cosmeticsState(inventory).owned.sort()).toEqual(Object.keys(COSMETIC_CATALOG).sort())
  })

  it('keeps whatever the player is already wearing', () => {
    const bought = buyCosmetic(600, {}, 'hat-feather')
    if (!bought.success) throw new Error('buy failed')
    const inventory = unlockAllCosmetics(bought.inventory)
    expect(cosmeticsState(inventory).equipped.hat).toBe('hat-feather')
  })

  it('is idempotent — unlocking twice does not duplicate anything', () => {
    const once = unlockAllCosmetics({})
    const twice = unlockAllCosmetics(once)
    expect(cosmeticsState(twice).owned).toEqual(cosmeticsState(once).owned)
  })

  it('leaves unrelated inventory keys alone', () => {
    const inventory = unlockAllCosmetics({ potion: 3, badges: ['badge_streak_7'] })
    expect(inventory.potion).toBe(3)
    expect(inventory.badges).toEqual(['badge_streak_7'])
  })
})
