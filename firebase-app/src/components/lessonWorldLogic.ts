import type { CharacterPosition } from './dashboardCharacter'
import type { LessonMonsterSpeciesKey } from './lessonCombatLogic'

// The lesson world is a canvas larger than the viewport; the camera follows the player
// Ragnarok-style. Scales are the canvas size as a multiple of the viewport.
export const LESSON_CAMERA_SCALE = { x: 1.8, y: 1.5 } as const
export const LESSON_WALK_BOUNDS = { minX: 6, maxX: 94, minY: 14, maxY: 88 } as const
// Slightly wider than the sword range feels generous: loot from a melee kill is always reachable.
export const LESSON_PICKUP_RANGE = 8
export const LESSON_PORTAL_WARP_RANGE = 7
export const LESSON_BAG_SLOTS = 12

export type LessonEnemySpawn = CharacterPosition & { species: LessonMonsterSpeciesKey }

export type LessonZoneConfig = {
  playerSpawn: CharacterPosition
  enemySpawns: LessonEnemySpawn[]
  portal: CharacterPosition
  landmark: CharacterPosition
}

// Portals sit at the map's edge gate; landmarks are the video cabinet / boss pedestal.
// Spawn 0 in zone 1 must stay a shadow-keeper at (25,60) — LessonPage.test.tsx anchors
// its combat-math regression tests (3-hit kill, HP text, death-choice camp) on that spot.
export const LESSON_ZONE_CONFIGS: Record<1 | 2 | 3, LessonZoneConfig> = {
  1: {
    playerSpawn: { x: 18, y: 62 },
    enemySpawns: [
      // The tutorial monster sits inside the (tight, melee) attack ring of the
      // spawn point so the first sword click always connects.
      { x: 21, y: 61, species: 'shadow-keeper' },
      { x: 58, y: 38, species: 'shadow-keeper' },
      { x: 74, y: 68, species: 'shadow-keeper' },
      { x: 42, y: 29, species: 'gel-slime' },
      { x: 84, y: 30, species: 'spore-cap' },
    ],
    portal: { x: 91, y: 42 },
    landmark: { x: 50, y: 44 },
  },
  2: {
    playerSpawn: { x: 14, y: 66 },
    enemySpawns: [
      // Like zone 1, the first guard stands inside the melee ring of the spawn.
      { x: 17, y: 65, species: 'archive-guard' },
      { x: 62, y: 42, species: 'archive-guard' },
      { x: 40, y: 75, species: 'gloom-bat' },
      { x: 78, y: 60, species: 'grimoire' },
      { x: 33, y: 32, species: 'gloom-bat' },
    ],
    portal: { x: 91, y: 50 },
    landmark: { x: 46, y: 38 },
  },
  3: {
    playerSpawn: { x: 30, y: 70 },
    enemySpawns: [],
    portal: { x: 91, y: 50 },
    landmark: { x: 55, y: 42 },
  },
}

// Offset (in canvas %) so the player stays centered until the camera hits a map edge.
export function cameraOffset(playerPct: number, scale: number) {
  const viewSpan = 100 / Math.max(1, scale)
  return Math.min(100 - viewSpan, Math.max(0, playerPct - viewSpan / 2))
}

export type LootKind = 'coin' | 'potion' | 'card'
export type LootRarity = 'common' | 'uncommon' | 'rare'
export type LootRoll = { kind: LootKind; amount: number } | null

export const LESSON_CARD_ATTACK_BONUS = 8

export const LOOT_INFO: Record<LootKind, { label: string; icon: string; rarity: LootRarity }> = {
  coin: { label: 'เหรียญความรู้', icon: '🪙', rarity: 'common' },
  potion: { label: 'ยาฟื้นฟูสีแดง', icon: '🧪', rarity: 'uncommon' },
  card: { label: 'การ์ดมอนสเตอร์', icon: '🃏', rarity: 'rare' },
}

// Tier 1 (zone 1 grunts): 50% coins (3-9), 20% potion, 6% card, 24% nothing.
// Tier 2 (zone 2 guards): 50% coins (6-14), 22% potion, 8% card, 20% nothing.
export function rollLoot(random: () => number = Math.random, tier: 1 | 2 = 1): LootRoll {
  const roll = Math.min(1, Math.max(0, Number(random()) || 0))
  const amountRoll = Math.min(0.999, Math.max(0, Number(random()) || 0))
  if (roll < 0.5) {
    return tier === 2
      ? { kind: 'coin', amount: 6 + Math.floor(amountRoll * 9) }
      : { kind: 'coin', amount: 3 + Math.floor(amountRoll * 7) }
  }
  if (roll < (tier === 2 ? 0.72 : 0.7)) return { kind: 'potion', amount: 1 }
  if (roll < (tier === 2 ? 0.8 : 0.76)) return { kind: 'card', amount: 1 }
  return null
}

export type GroundDrop = { id: number; kind: LootKind; amount: number; x: number; y: number }
export type BagItem = { kind: LootKind; count: number }

export function addToBag(bag: BagItem[], kind: LootKind, count: number, slots = LESSON_BAG_SLOTS): { bag: BagItem[]; added: boolean } {
  const existing = bag.findIndex((item) => item.kind === kind)
  if (existing >= 0) {
    return { bag: bag.map((item, index) => index === existing ? { ...item, count: item.count + count } : item), added: true }
  }
  if (bag.length >= slots) return { bag, added: false }
  return { bag: [...bag, { kind, count }], added: true }
}

export function takeFromBag(bag: BagItem[], kind: LootKind, count = 1): { bag: BagItem[]; taken: boolean } {
  const existing = bag.findIndex((item) => item.kind === kind && item.count >= count)
  if (existing < 0) return { bag, taken: false }
  return {
    bag: bag
      .map((item, index) => index === existing ? { ...item, count: item.count - count } : item)
      .filter((item) => item.count > 0),
    taken: true,
  }
}

export function dropsWithinRange(drops: readonly GroundDrop[], player: CharacterPosition, range = LESSON_PICKUP_RANGE) {
  return drops.filter((drop) => Math.hypot(drop.x - player.x, drop.y - player.y) <= range)
}

export function isWithinRange(a: CharacterPosition, b: CharacterPosition, range: number) {
  return Math.hypot(a.x - b.x, a.y - b.y) <= range
}

// Rotation (degrees, CSS clockwise) for a quest-guide arrow at `from` pointing
// toward `to`; 0deg matches an arrow glyph that points right.
export function guideAngleDeg(from: CharacterPosition, to: CharacterPosition) {
  return Math.round((Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI)
}
