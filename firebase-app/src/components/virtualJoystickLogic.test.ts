import { describe, expect, it } from 'vitest'
import { JOYSTICK_DEAD_ZONE, joystickDirection, joystickVector } from './virtualJoystickLogic'

describe('virtualJoystickLogic', () => {
  describe('joystickVector', () => {
    it('returns zero vector when the pointer is at the center', () => {
      const vector = joystickVector({ x: 100, y: 100 }, { x: 100, y: 100 }, 40)
      expect(vector).toEqual({ dx: 0, dy: 0, distance: 0, magnitude: 0 })
    })

    it('reports the raw offset and full magnitude when within the radius', () => {
      const vector = joystickVector({ x: 100, y: 100 }, { x: 120, y: 100 }, 40)
      expect(vector.dx).toBeCloseTo(20)
      expect(vector.dy).toBeCloseTo(0)
      expect(vector.distance).toBeCloseTo(20)
      expect(vector.magnitude).toBeCloseTo(0.5)
    })

    it('clamps the thumb to the base radius when dragged further away', () => {
      const vector = joystickVector({ x: 100, y: 100 }, { x: 300, y: 100 }, 40)
      expect(vector.distance).toBeCloseTo(40)
      expect(vector.magnitude).toBeCloseTo(1)
      expect(vector.dx).toBeCloseTo(40)
      expect(vector.dy).toBeCloseTo(0)
    })

    it('preserves the drag angle when clamping a diagonal drag', () => {
      const vector = joystickVector({ x: 0, y: 0 }, { x: 300, y: 300 }, 40)
      expect(vector.distance).toBeCloseTo(40)
      expect(vector.dx).toBeCloseTo(40 * Math.SQRT1_2)
      expect(vector.dy).toBeCloseTo(40 * Math.SQRT1_2)
    })
  })

  describe('joystickDirection', () => {
    it('returns null inside the dead zone', () => {
      expect(joystickDirection(5, 0, JOYSTICK_DEAD_ZONE - 0.01)).toBeNull()
    })

    it('picks the dominant axis once past the dead zone', () => {
      expect(joystickDirection(30, 5, 0.9)).toBe('right')
      expect(joystickDirection(-30, 5, 0.9)).toBe('left')
      expect(joystickDirection(5, 30, 0.9)).toBe('down')
      expect(joystickDirection(5, -30, 0.9)).toBe('up')
    })

    it('breaks a horizontal/vertical tie in favor of the horizontal axis', () => {
      expect(joystickDirection(20, 20, 0.9)).toBe('right')
      expect(joystickDirection(-20, -20, 0.9)).toBe('left')
    })
  })
})
