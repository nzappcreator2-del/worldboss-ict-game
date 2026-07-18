import { describe, expect, it } from 'vitest'
import type { CharacterPosition } from './dashboardCharacter'
import {
  LESSON_BAG_SLOTS,
  LESSON_CAMERA_SCALE,
  LESSON_ZONE_CONFIGS,
  LOOT_INFO,
  addToBag,
  cameraOffset,
  dropsWithinRange,
  guideAngleDeg,
  rollLoot,
  takeFromBag,
} from './lessonWorldLogic'

describe('lesson world camera', () => {
  it('keeps the camera clamped at the map edges', () => {
    expect(cameraOffset(0, LESSON_CAMERA_SCALE.x)).toBe(0)
    expect(cameraOffset(100, LESSON_CAMERA_SCALE.x)).toBeCloseTo(100 - 100 / LESSON_CAMERA_SCALE.x, 5)
  })

  it('centers the player between the edges', () => {
    const viewSpan = 100 / LESSON_CAMERA_SCALE.x
    expect(cameraOffset(50, LESSON_CAMERA_SCALE.x)).toBeCloseTo(50 - viewSpan / 2, 5)
  })

  it('positions every zone portal at the map edge gate', () => {
    for (const zone of [1, 2, 3] as const) {
      expect(LESSON_ZONE_CONFIGS[zone].portal.x).toBeGreaterThanOrEqual(88)
    }
  })
})

describe('field monster spawn table', () => {
  const distance = (a: CharacterPosition, b: CharacterPosition) => Math.hypot(a.x - b.x, a.y - b.y)
  const knownSpecies = ['shadow-keeper', 'archive-guard', 'gel-slime', 'spore-cap', 'gloom-bat', 'grimoire']

  it('keeps monster id 1 anchored on the original shadow-keeper spawn used by regression tests', () => {
    expect(LESSON_ZONE_CONFIGS[1].enemySpawns[0]).toMatchObject({ x: 21, y: 61, species: 'shadow-keeper' })
  })

  it('keeps exactly three shadow-keepers in zone one', () => {
    const keepers = LESSON_ZONE_CONFIGS[1].enemySpawns.filter((spawn) => spawn.species === 'shadow-keeper')
    expect(keepers).toHaveLength(3)
  })

  it('places every new zone-one monster outside the skill range and patrol wander of the player spawn', () => {
    const playerSpawn = LESSON_ZONE_CONFIGS[1].playerSpawn
    const newSpawns = LESSON_ZONE_CONFIGS[1].enemySpawns.filter((spawn) => spawn.species !== 'shadow-keeper')
    expect(newSpawns.length).toBeGreaterThan(0)
    for (const spawn of newSpawns) {
      expect(distance(spawn, playerSpawn)).toBeGreaterThan(18)
    }
  })

  it('only uses known species keys across every zone and keeps the boss zone monster-free', () => {
    for (const zone of [1, 2, 3] as const) {
      for (const spawn of LESSON_ZONE_CONFIGS[zone].enemySpawns) {
        expect(knownSpecies).toContain(spawn.species)
      }
    }
    expect(LESSON_ZONE_CONFIGS[3].enemySpawns).toHaveLength(0)
  })
})

describe('monster loot', () => {
  it('drops coins on a low roll and a potion on a mid roll', () => {
    expect(rollLoot(() => 0.1)).toEqual({ kind: 'coin', amount: 3 })
    expect(rollLoot(() => 0.6)).toEqual({ kind: 'potion', amount: 1 })
    expect(rollLoot(() => 0.9)).toBeNull()
  })

  it('drops a rare monster card on a high-mid roll', () => {
    expect(rollLoot(() => 0.72)).toEqual({ kind: 'card', amount: 1 })
    expect(LOOT_INFO.card.rarity).toBe('rare')
  })

  it('gives richer coin piles and better card odds from tier-two guards', () => {
    expect(rollLoot(() => 0.1, 2)).toEqual({ kind: 'coin', amount: 6 })
    expect(rollLoot(() => 0.78, 2)).toEqual({ kind: 'card', amount: 1 })
    expect(rollLoot(() => 0.78, 1)).toBeNull()
  })
})

describe('bag', () => {
  it('stacks items of the same kind instead of consuming slots', () => {
    const first = addToBag([], 'coin', 5)
    const second = addToBag(first.bag, 'coin', 4)
    expect(second.bag).toEqual([{ kind: 'coin', count: 9 }])
  })

  it('rejects new item kinds when every slot is full', () => {
    const full = Array.from({ length: LESSON_BAG_SLOTS }, (_, i) => ({ kind: `x${i}` as never, count: 1 }))
    const result = addToBag(full, 'potion', 1)
    expect(result.added).toBe(false)
    expect(result.bag).toHaveLength(LESSON_BAG_SLOTS)
  })

  it('consumes items and clears emptied stacks', () => {
    const { bag } = addToBag([], 'potion', 1)
    const used = takeFromBag(bag, 'potion')
    expect(used.taken).toBe(true)
    expect(used.bag).toEqual([])
    expect(takeFromBag(used.bag, 'potion').taken).toBe(false)
  })
})

describe('ground drops', () => {
  it('finds only drops inside the pickup radius', () => {
    const drops = [
      { id: 1, kind: 'coin' as const, amount: 5, x: 50, y: 50 },
      { id: 2, kind: 'coin' as const, amount: 5, x: 80, y: 50 },
    ]
    expect(dropsWithinRange(drops, { x: 52, y: 50 }).map((d) => d.id)).toEqual([1])
  })
})

describe('quest guide arrow', () => {
  it('points along the CSS clockwise rotation toward the portal', () => {
    expect(guideAngleDeg({ x: 10, y: 50 }, { x: 90, y: 50 })).toBe(0)
    expect(guideAngleDeg({ x: 50, y: 10 }, { x: 50, y: 90 })).toBe(90)
    expect(guideAngleDeg({ x: 90, y: 50 }, { x: 10, y: 50 })).toBe(180)
    expect(guideAngleDeg({ x: 50, y: 90 }, { x: 50, y: 10 })).toBe(-90)
  })
})
