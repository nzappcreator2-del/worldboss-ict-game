import { describe, expect, it } from 'vitest'
import {
  MAP_START_POSITION,
  autoWalkDuration,
  clampMapPosition,
  lessonNodePosition,
  mapPointerPosition,
} from './adventureMapLogic'

describe('adventureMapLogic', () => {
  it('keeps manual movement inside the playable island', () => {
    expect(clampMapPosition({ x: -10, y: 110 })).toEqual({ x: 15, y: 84 })
    expect(clampMapPosition({ x: 55, y: 52 })).toEqual({ x: 55, y: 52 })
  })

  it('maps pointers to bounded percentage coordinates', () => {
    expect(mapPointerPosition(600, 350, { left: 100, top: 100, width: 1000, height: 500 })).toEqual({ x: 50, y: 50 })
    expect(mapPointerPosition(-100, 900, { left: 0, top: 0, width: 1000, height: 500 })).toEqual({ x: 15, y: 84 })
  })

  it('provides stable lesson destinations and distance-aware auto-walk timing', () => {
    expect(lessonNodePosition(0)).toEqual({ x: 28, y: 67 })
    expect(lessonNodePosition(11)).toEqual({ x: 76, y: 31 })
    expect(autoWalkDuration(MAP_START_POSITION, MAP_START_POSITION)).toBe(0)
    expect(autoWalkDuration(MAP_START_POSITION, { x: 80, y: 20 })).toBeGreaterThanOrEqual(450)
    expect(autoWalkDuration(MAP_START_POSITION, { x: 80, y: 20 })).toBeLessThanOrEqual(950)
  })
})
