import type { WalkDirection } from './dashboardCharacter'

export type JoystickVector = { dx: number; dy: number; distance: number; magnitude: number }

// Fraction of the base radius the thumb must travel before it counts as a held direction,
// so a light tap near the center doesn't trigger unintended movement.
export const JOYSTICK_DEAD_ZONE = 0.2

export function joystickVector(
  center: { x: number; y: number },
  pointer: { x: number; y: number },
  maxRadius: number,
): JoystickVector {
  const rawDx = pointer.x - center.x
  const rawDy = pointer.y - center.y
  const distance = Math.hypot(rawDx, rawDy)
  if (distance === 0 || maxRadius <= 0) return { dx: 0, dy: 0, distance: 0, magnitude: 0 }
  const clampedDistance = Math.min(distance, maxRadius)
  const scale = clampedDistance / distance
  return {
    dx: rawDx * scale,
    dy: rawDy * scale,
    distance: clampedDistance,
    magnitude: clampedDistance / maxRadius,
  }
}

export function joystickDirection(dx: number, dy: number, magnitude: number): WalkDirection | null {
  if (magnitude < JOYSTICK_DEAD_ZONE) return null
  return Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down')
}
