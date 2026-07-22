import { describe, expect, it } from 'vitest'
import {
  LESSON_MAP_SETS,
  monsterSkinForSpawn,
  resolveLessonMapSet,
} from './lessonMapSets'

describe('lesson map sets', () => {
  it('registers the legacy set plus seven complete themed sets', () => {
    expect(LESSON_MAP_SETS).toHaveLength(8)
    expect(LESSON_MAP_SETS.map((set) => set.id)).toEqual([
      'legacy-forest',
      'mushroom-grove',
      'desert-ruins',
      'frost-kingdom',
      'volcanic-forge',
      'sky-temple',
      'coral-kingdom',
      'haunted-marsh',
    ])
    for (const set of LESSON_MAP_SETS) {
      expect(set.zoneImages[1]).toBeTruthy()
      expect(set.zoneImages[2]).toBeTruthy()
      expect(set.zoneImages[3]).toBeTruthy()
    }
    expect(new Set(LESSON_MAP_SETS.flatMap((set) => Object.values(set.zoneImages)))).toHaveLength(24)
  })

  it('keeps missing and invalid values on the legacy set for backwards compatibility', () => {
    expect(resolveLessonMapSet(undefined, 'L20').id).toBe('legacy-forest')
    expect(resolveLessonMapSet('', 'L20').id).toBe('legacy-forest')
    expect(resolveLessonMapSet('missing-theme', 'L20').id).toBe('legacy-forest')
  })

  it('resolves explicit selections and keeps automatic selections stable per lesson id', () => {
    expect(resolveLessonMapSet('sky-temple', 'L3').id).toBe('sky-temple')
    expect(resolveLessonMapSet('auto', 'L2').id).toBe('mushroom-grove')
    expect(resolveLessonMapSet('auto', 'L2').id).toBe(resolveLessonMapSet('auto', 'L2').id)
    expect(resolveLessonMapSet('auto', 'L9').id).toBe('legacy-forest')
    expect(resolveLessonMapSet('auto', 'custom-lesson').id).not.toBe('')
  })

  it('selects visual skins deterministically without changing combat species', () => {
    const set = resolveLessonMapSet('desert-ruins', 'L3')
    expect(monsterSkinForSpawn(set, 1, 0)).toBe('tiny-orc')
    expect(monsterSkinForSpawn(set, 1, 2)).toBe('tiny-orc')
    expect(monsterSkinForSpawn(set, 2, 0)).toBe('tiny-orc')
    expect(set.bossSkin).toBe('tiny-demon')
    expect(monsterSkinForSpawn(resolveLessonMapSet('', 'L1'), 1, 0)).toBeUndefined()
  })
})
