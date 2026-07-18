import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CHARACTER_POSITION,
  CHARACTER_RENDER_SIZE,
  HUB_MOVEMENT_SPEED,
  TEST_CHARACTER_SPRITE,
  directionForKey,
  directionTowardTarget,
  moveCharacter,
  moveTowardTarget,
  movementStepForElapsed,
  nextWalkFrame,
  pointerToWalkPosition,
  spriteBackgroundPosition,
} from './dashboardCharacter'

describe('dashboardCharacter', () => {
  it('maps arrow and WASD keys to movement directions', () => {
    expect(directionForKey('ArrowUp')).toBe('up')
    expect(directionForKey('a')).toBe('left')
    expect(directionForKey('S')).toBe('down')
    expect(directionForKey('d')).toBe('right')
    expect(directionForKey('Enter')).toBeNull()
  })

  it('moves within the configured walkable floor and clamps every edge', () => {
    expect(moveCharacter(DEFAULT_CHARACTER_POSITION, 'right', 4)).toEqual({ x: 54, y: 64 })
    expect(moveCharacter({ x: 76, y: 80 }, 'right', 10)).toEqual({ x: 78, y: 80 })
    expect(moveCharacter({ x: 22, y: 43 }, 'up', 10)).toEqual({ x: 22, y: 40 })
  })

  it('loops walk frames and resolves sprite coordinates from replaceable config', () => {
    expect(TEST_CHARACTER_SPRITE.walkFrames).toHaveLength(9)
    expect(TEST_CHARACTER_SPRITE.directionRows).toEqual({ up: 8, left: 9, down: 10, right: 11 })
    expect(nextWalkFrame(8, TEST_CHARACTER_SPRITE.walkFrames.length)).toBe(0)
    expect(spriteBackgroundPosition(TEST_CHARACTER_SPRITE, 'down', 2, 96)).toBe('-192px -960px')
  })

  it('calculates frame-rate-independent movement and clamps long frame gaps', () => {
    expect(HUB_MOVEMENT_SPEED).toBe(13)
    expect(CHARACTER_RENDER_SIZE).toBe(112)
    expect(movementStepForElapsed(16)).toBeCloseTo(0.208)
    expect(movementStepForElapsed(1000)).toBe(0.65)
  })

  it('converts pointer coordinates into bounded walk targets', () => {
    const rect = { left: 100, top: 50, width: 1000, height: 500 }
    expect(pointerToWalkPosition(600, 300, rect)).toEqual({ x: 50, y: 50 })
    expect(pointerToWalkPosition(-100, 1000, rect)).toEqual({ x: 20, y: 80 })
  })

  it('moves toward a clicked target without overshooting and picks a facing direction', () => {
    expect(directionTowardTarget({ x: 50, y: 64 }, { x: 70, y: 66 })).toBe('right')
    expect(directionTowardTarget({ x: 50, y: 64 }, { x: 49, y: 50 })).toBe('up')
    expect(moveTowardTarget({ x: 50, y: 64 }, { x: 60, y: 64 }, 2)).toEqual({ position: { x: 52, y: 64 }, reached: false })
    expect(moveTowardTarget({ x: 59.5, y: 64 }, { x: 60, y: 64 }, 2)).toEqual({ position: { x: 60, y: 64 }, reached: true })
  })
})
