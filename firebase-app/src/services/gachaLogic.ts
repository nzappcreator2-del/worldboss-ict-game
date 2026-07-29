// Item gacha: one 500-coin roll hands back a real wardrobe piece from
// COSMETIC_CATALOG instead of the legacy emoji avatar.
//
// Three rules shape the design:
//   1. Rarity is derived from the catalog price, never stored separately, so a
//      new item added to the shop is automatically tiered and priced-in with no
//      second list to keep in sync.
//   2. A roll never returns something already owned. The catalog is finite
//      (~53 purchasable pieces), so allowing duplicates would quickly turn a
//      500-coin roll into a coin shredder for a ten-year-old. Owned pieces are
//      filtered out *before* the draw, which also means the pool naturally
//      skews expensive as a player fills their wardrobe.
//   3. A roll never fails after payment. If the drawn tier is sold out the draw
//      falls through to the next tier that still has stock; only when the whole
//      wardrobe is owned does it return null, and the caller refuses to charge.
//
// Everything here is pure and takes its randomness as a parameter, matching the
// `shuffleQuestionIds(ids, Math.random)` style already used in pvpRoomLogic.

import { COSMETIC_CATALOG, cosmeticsState, type Inventory } from './gameLogic'

export const GACHA_ROLL_COST = 500

export const GACHA_RARITIES = ['COMMON', 'UNCOMMON', 'RARE', 'LEGENDARY'] as const
export type GachaRarity = typeof GACHA_RARITIES[number]

// Upper price bound of each tier; anything dearer than the last bound is
// legendary. Boundary prices belong to the cheaper tier.
const RARITY_PRICE_CEILING: Record<Exclude<GachaRarity, 'LEGENDARY'>, number> = {
  COMMON: 250,
  UNCOMMON: 450,
  RARE: 650,
}

// Drop rates in percent, summing to 100. Tuned so the headline pieces (the 950
// crowns) stay genuinely hard to hit: a roll is worth roughly 340 coins on
// average against its 500-coin price, which is what makes the shop still the
// sensible way to buy a *specific* item. Adjust here and nowhere else.
export const GACHA_RARITY_WEIGHTS: Record<GachaRarity, number> = {
  COMMON: 50,
  UNCOMMON: 29,
  RARE: 15,
  LEGENDARY: 6,
}

export type GachaResultItem = { itemId: string; rarity: GachaRarity }

export function gachaRarityForPrice(rawPrice: unknown): GachaRarity {
  const price = Number(rawPrice)
  if (!Number.isFinite(price) || price <= RARITY_PRICE_CEILING.COMMON) return 'COMMON'
  if (price <= RARITY_PRICE_CEILING.UNCOMMON) return 'UNCOMMON'
  if (price <= RARITY_PRICE_CEILING.RARE) return 'RARE'
  return 'LEGENDARY'
}

/**
 * Purchasable, not-yet-owned catalog ids grouped by tier. Free starter pieces
 * (price 0) are excluded: every player already has them.
 */
export function gachaPool(ownedIds: readonly string[] = []): Record<GachaRarity, string[]> {
  const owned = new Set(ownedIds.map(String))
  const pool: Record<GachaRarity, string[]> = { COMMON: [], UNCOMMON: [], RARE: [], LEGENDARY: [] }
  for (const item of Object.values(COSMETIC_CATALOG)) {
    if (item.price <= 0 || owned.has(item.id)) continue
    pool[gachaRarityForPrice(item.price)].push(item.id)
  }
  return pool
}

/** Published drop rates, so the shop can show players what they are paying for. */
export function gachaOdds(ownedIds: readonly string[] = []): Array<{ rarity: GachaRarity; percent: number; count: number }> {
  const pool = gachaPool(ownedIds)
  return GACHA_RARITIES.map((rarity) => ({ rarity, percent: GACHA_RARITY_WEIGHTS[rarity], count: pool[rarity].length }))
}

const unitInterval = (value: number): number => {
  if (!Number.isFinite(value)) return 0
  return Math.min(0.999999, Math.max(0, value))
}

/**
 * Draw one unowned item. `random` is called twice: once to pick the tier
 * (weighted, renormalized across tiers that still have stock) and once to pick
 * a piece inside it. Returns null only when the entire wardrobe is owned.
 */
export function rollGachaItem(
  ownedIds: readonly string[] = [],
  random: () => number = Math.random,
): GachaResultItem | null {
  const pool = gachaPool(ownedIds)
  const available = GACHA_RARITIES.filter((rarity) => pool[rarity].length > 0)
  if (available.length === 0) return null

  // Renormalizing over the tiers that still have stock is what makes a sold-out
  // tier fall through instead of wasting the roll.
  const totalWeight = available.reduce((total, rarity) => total + GACHA_RARITY_WEIGHTS[rarity], 0)
  let cursor = unitInterval(random()) * totalWeight
  let picked = available[available.length - 1]
  for (const rarity of available) {
    if (cursor < GACHA_RARITY_WEIGHTS[rarity]) { picked = rarity; break }
    cursor -= GACHA_RARITY_WEIGHTS[rarity]
  }

  const items = pool[picked]
  const index = Math.min(items.length - 1, Math.floor(unitInterval(random()) * items.length))
  return { itemId: items[index], rarity: picked }
}

export type GachaRollOutcome =
  | {
    success: true
    coins: number
    inventory: Inventory
    itemId: string
    name: string
    slot: string
    price: number
    rarity: GachaRarity
  }
  | { success: false; error: string }

/**
 * Whole roll as one pure state transition: check funds, draw, bank the prize.
 * Mirrors buyCosmetic — the prize is auto-equipped so the reveal visibly
 * changes the character — and refuses before charging on either failure path,
 * so a rejected roll can never cost coins.
 */
export function applyGachaRoll(
  rawCoins: number,
  rawInventory: Inventory,
  gender?: unknown,
  random: () => number = Math.random,
): GachaRollOutcome {
  const coins = Number(rawCoins) || 0
  if (coins < GACHA_ROLL_COST) return { success: false, error: 'เหรียญไม่พอสุ่มกาชา!' }

  const current = cosmeticsState(rawInventory, gender)
  const drawn = rollGachaItem(current.owned, random)
  if (!drawn) return { success: false, error: 'สะสมไอเทมครบทุกชิ้นแล้ว! ไม่มีของใหม่ให้สุ่มอีก 🎉' }

  const item = COSMETIC_CATALOG[drawn.itemId]
  return {
    success: true,
    coins: coins - GACHA_ROLL_COST,
    inventory: {
      ...rawInventory,
      cosmetics: {
        owned: [...current.owned, drawn.itemId],
        equipped: { ...current.equipped, [item.slot]: drawn.itemId },
      },
    },
    itemId: drawn.itemId,
    name: item.name,
    slot: item.slot,
    price: item.price,
    rarity: drawn.rarity,
  }
}
