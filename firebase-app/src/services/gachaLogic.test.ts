import { describe, expect, it } from 'vitest'
import { COSMETIC_CATALOG } from './gameLogic'
import {
  GACHA_RARITIES,
  GACHA_RARITY_WEIGHTS,
  GACHA_ROLL_COST,
  applyGachaRoll,
  gachaOdds,
  gachaPool,
  gachaRarityForPrice,
  rollGachaItem,
  type GachaRarity,
} from './gachaLogic'

// A scripted random source: each call returns the next value, so a weighted
// draw can be pinned to an exact outcome instead of being asserted loosely.
const scripted = (...values: number[]) => {
  let index = 0
  return () => values[Math.min(index++, values.length - 1)]
}

const paidIds = Object.values(COSMETIC_CATALOG).filter((item) => item.price > 0).map((item) => item.id)
const freeIds = Object.values(COSMETIC_CATALOG).filter((item) => item.price === 0).map((item) => item.id)

describe('gachaRarityForPrice', () => {
  it('maps each price band to a tier', () => {
    expect(gachaRarityForPrice(150)).toBe('COMMON')
    expect(gachaRarityForPrice(300)).toBe('UNCOMMON')
    expect(gachaRarityForPrice(500)).toBe('RARE')
    expect(gachaRarityForPrice(950)).toBe('LEGENDARY')
  })

  it('puts each boundary price in the cheaper tier', () => {
    expect(gachaRarityForPrice(250)).toBe('COMMON')
    expect(gachaRarityForPrice(251)).toBe('UNCOMMON')
    expect(gachaRarityForPrice(450)).toBe('UNCOMMON')
    expect(gachaRarityForPrice(451)).toBe('RARE')
    expect(gachaRarityForPrice(650)).toBe('RARE')
    expect(gachaRarityForPrice(651)).toBe('LEGENDARY')
  })

  it('treats junk prices as the cheapest tier rather than throwing', () => {
    expect(gachaRarityForPrice(Number.NaN)).toBe('COMMON')
    expect(gachaRarityForPrice(-10)).toBe('COMMON')
  })
})

describe('GACHA_RARITY_WEIGHTS', () => {
  it('sums to 100 so the weights read as percentages', () => {
    expect(GACHA_RARITIES.reduce((total, tier) => total + GACHA_RARITY_WEIGHTS[tier], 0)).toBe(100)
  })

  it('makes every step up in tier strictly rarer', () => {
    const weights = GACHA_RARITIES.map((tier) => GACHA_RARITY_WEIGHTS[tier])
    for (let index = 1; index < weights.length; index += 1) {
      expect(weights[index]).toBeLessThan(weights[index - 1])
    }
  })

  it('publishes the drop rates players see', () => {
    const odds = gachaOdds()
    expect(odds.map((row) => row.rarity)).toEqual([...GACHA_RARITIES])
    expect(odds.reduce((total, row) => total + row.percent, 0)).toBe(100)
    expect(odds.every((row) => row.count >= 0)).toBe(true)
  })
})

describe('gachaPool', () => {
  it('never offers the free starter pieces — they are owned from day one', () => {
    const pool = gachaPool([])
    const offered = GACHA_RARITIES.flatMap((tier) => pool[tier])
    for (const id of freeIds) expect(offered).not.toContain(id)
    expect(offered).toHaveLength(paidIds.length)
  })

  it('drops items the player already owns', () => {
    const owned = paidIds.slice(0, 5)
    const offered = GACHA_RARITIES.flatMap((tier) => gachaPool(owned)[tier])
    for (const id of owned) expect(offered).not.toContain(id)
    expect(offered).toHaveLength(paidIds.length - owned.length)
  })

  it('files every item under the tier its price earns', () => {
    const pool = gachaPool([])
    for (const tier of GACHA_RARITIES) {
      for (const id of pool[tier]) expect(gachaRarityForPrice(COSMETIC_CATALOG[id].price)).toBe(tier)
    }
  })

  it('ignores unknown ids in the owned list instead of throwing', () => {
    const offered = GACHA_RARITIES.flatMap((tier) => gachaPool(['not-a-real-item', ''])[tier])
    expect(offered).toHaveLength(paidIds.length)
  })
})

describe('rollGachaItem', () => {
  it('returns a common item when the tier draw lands in the common band', () => {
    const result = rollGachaItem([], scripted(0.01, 0))
    expect(result).not.toBeNull()
    expect(result!.rarity).toBe('COMMON')
    expect(COSMETIC_CATALOG[result!.itemId].price).toBeLessThanOrEqual(250)
  })

  it('returns a legendary item when the tier draw lands in the last band', () => {
    const result = rollGachaItem([], scripted(0.999, 0))
    expect(result).not.toBeNull()
    expect(result!.rarity).toBe('LEGENDARY')
    expect(COSMETIC_CATALOG[result!.itemId].price).toBeGreaterThan(650)
  })

  it('never returns something the player already owns', () => {
    // Own everything except one specific legendary; every roll must find it.
    const target = paidIds.find((id) => gachaRarityForPrice(COSMETIC_CATALOG[id].price) === 'LEGENDARY')!
    const owned = paidIds.filter((id) => id !== target)
    for (const draw of [0, 0.25, 0.5, 0.75, 0.99]) {
      expect(rollGachaItem(owned, scripted(draw, draw))).toEqual({ itemId: target, rarity: 'LEGENDARY' })
    }
  })

  // A roll costs coins, so an empty tier must fall through to one that still
  // has stock rather than burning the payment on nothing.
  it('falls back to another tier when the drawn tier is sold out', () => {
    const commons = paidIds.filter((id) => gachaRarityForPrice(COSMETIC_CATALOG[id].price) === 'COMMON')
    const result = rollGachaItem(commons, scripted(0.01, 0))
    expect(result).not.toBeNull()
    expect(result!.rarity).not.toBe('COMMON')
    expect(commons).not.toContain(result!.itemId)
  })

  it('returns null once every item is owned so the caller can refuse to charge', () => {
    expect(rollGachaItem(paidIds, scripted(0.5, 0.5))).toBeNull()
  })

  it('survives a random source that returns out-of-range or junk values', () => {
    for (const draw of [-1, 1, 2, Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = rollGachaItem([], scripted(draw, draw))
      expect(result).not.toBeNull()
      expect(COSMETIC_CATALOG[result!.itemId]).toBeDefined()
    }
  })

  it('can eventually reach every purchasable item', () => {
    const seen = new Set<string>()
    for (let step = 0; step < 4000; step += 1) {
      const result = rollGachaItem([], scripted(step / 4000, (step * 7919 % 4000) / 4000))
      if (result) seen.add(result.itemId)
    }
    expect(seen.size).toBe(paidIds.length)
  })

  it('honours the published odds over many rolls', () => {
    const counts: Record<GachaRarity, number> = { COMMON: 0, UNCOMMON: 0, RARE: 0, LEGENDARY: 0 }
    const rolls = 10_000
    for (let step = 0; step < rolls; step += 1) {
      const result = rollGachaItem([], scripted(step / rolls, 0.5))
      if (result) counts[result.rarity] += 1
    }
    for (const tier of GACHA_RARITIES) {
      // Sweeping the draw uniformly reproduces the weights almost exactly.
      expect(Math.abs(counts[tier] / rolls * 100 - GACHA_RARITY_WEIGHTS[tier])).toBeLessThan(1)
    }
  })
})

describe('GACHA_ROLL_COST', () => {
  it('keeps the historical 500-coin price and stays inside the rules coin cap', () => {
    expect(GACHA_ROLL_COST).toBe(500)
    expect(GACHA_ROLL_COST).toBeLessThanOrEqual(1000)
  })
})

describe('applyGachaRoll', () => {
  const ownedOf = (inventory: unknown) => (inventory as { cosmetics: { owned: string[] } }).cosmetics.owned
  const equippedOf = (inventory: unknown) => (inventory as { cosmetics: { equipped: Record<string, string> } }).cosmetics.equipped

  it('charges the roll, banks the prize and wears it straight away', () => {
    const result = applyGachaRoll(900, {}, undefined, scripted(0.01, 0))
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.coins).toBe(900 - GACHA_ROLL_COST)
    expect(ownedOf(result.inventory)).toContain(result.itemId)
    expect(equippedOf(result.inventory)[COSMETIC_CATALOG[result.itemId].slot]).toBe(result.itemId)
    expect(result.rarity).toBe('COMMON')
    expect(result.name).toBe(COSMETIC_CATALOG[result.itemId].name)
    expect(result.price).toBe(COSMETIC_CATALOG[result.itemId].price)
  })

  it('refuses and charges nothing when the player cannot afford a roll', () => {
    const result = applyGachaRoll(GACHA_ROLL_COST - 1, {}, undefined, scripted(0.5, 0.5))
    expect(result).toEqual({ success: false, error: expect.stringContaining('เหรียญไม่พอ') })
  })

  it('refuses and charges nothing when every item is already owned', () => {
    const inventory = { cosmetics: { owned: paidIds, equipped: {} } }
    const result = applyGachaRoll(5000, inventory, undefined, scripted(0.5, 0.5))
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toContain('ครบทุกชิ้น')
  })

  it('keeps previously owned pieces and other equipped slots intact', () => {
    const target = paidIds.find((id) => COSMETIC_CATALOG[id].slot === 'hat')!
    const keep = paidIds.find((id) => COSMETIC_CATALOG[id].slot === 'weapon')!
    const owned = paidIds.filter((id) => id !== target)
    const inventory = { potion: 3, cosmetics: { owned, equipped: { weapon: keep } } }

    const result = applyGachaRoll(900, inventory, undefined, scripted(0.5, 0))
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.itemId).toBe(target)
    expect(equippedOf(result.inventory).weapon).toBe(keep)
    expect(ownedOf(result.inventory)).toContain(keep)
    expect((result.inventory as { potion: number }).potion).toBe(3)
  })

  // End-to-end economy invariant, driven with real randomness: rolling until
  // the box empties must hand over every purchasable piece exactly once and
  // then refuse, never looping forever or repeating a prize.
  it('drains the whole catalog in exactly one roll per item, then sells out', () => {
    let inventory: Record<string, unknown> = {}
    const won: string[] = []
    for (let roll = 0; roll < paidIds.length; roll += 1) {
      const result = applyGachaRoll(GACHA_ROLL_COST, inventory, undefined, Math.random)
      expect(result.success).toBe(true)
      if (!result.success) return
      expect(won).not.toContain(result.itemId)
      won.push(result.itemId)
      inventory = result.inventory as Record<string, unknown>
    }

    expect(won.sort()).toEqual([...paidIds].sort())
    const soldOut = applyGachaRoll(GACHA_ROLL_COST, inventory, undefined, Math.random)
    expect(soldOut.success).toBe(false)
  })

  it('never lets a single roll move coins past the Firestore per-write cap', () => {
    const result = applyGachaRoll(1000, {}, undefined, scripted(0.99, 0))
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(1000 - result.coins).toBeLessThanOrEqual(1000)
    expect(result.coins).toBeGreaterThanOrEqual(0)
  })
})
