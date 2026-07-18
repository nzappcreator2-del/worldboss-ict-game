import type { CharacterPosition } from './dashboardCharacter'

export const MAP_START_POSITION: CharacterPosition = { x: 48, y: 60 }
export const MAP_WALK_BOUNDS = { minX: 15, maxX: 88, minY: 18, maxY: 84 } as const
export const MAP_MANUAL_STEP = 2.4
export const MAP_MANUAL_SPEED = 18

const LESSON_NODE_POSITIONS: readonly CharacterPosition[] = [
  { x: 28, y: 67 },
  { x: 50, y: 64 },
  { x: 62, y: 74 },
  { x: 83, y: 46 },
  { x: 76, y: 29 },
  { x: 61, y: 29 },
  { x: 49, y: 32 },
  { x: 42, y: 51 },
  { x: 29, y: 51 },
  { x: 31, y: 37 },
  { x: 45, y: 22 },
  { x: 76, y: 31 },
]

export function clampMapPosition(position: CharacterPosition): CharacterPosition {
  return {
    x: Math.min(MAP_WALK_BOUNDS.maxX, Math.max(MAP_WALK_BOUNDS.minX, position.x)),
    y: Math.min(MAP_WALK_BOUNDS.maxY, Math.max(MAP_WALK_BOUNDS.minY, position.y)),
  }
}

export function lessonNodePosition(index: number): CharacterPosition {
  return LESSON_NODE_POSITIONS[index] || {
    x: 22 + ((index * 13) % 62),
    y: 24 + ((index * 17) % 52),
  }
}

export function mapPointerPosition(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
): CharacterPosition {
  if (rect.width <= 0 || rect.height <= 0) return { ...MAP_START_POSITION }
  return clampMapPosition({
    x: ((clientX - rect.left) / rect.width) * 100,
    y: ((clientY - rect.top) / rect.height) * 100,
  })
}

export function autoWalkDuration(from: CharacterPosition, to: CharacterPosition) {
  const distance = Math.hypot(to.x - from.x, to.y - from.y)
  if (distance < 0.1) return 0
  return Math.round(Math.min(950, Math.max(450, distance * 18)))
}

export function moveMapCharacter(position: CharacterPosition, direction: 'up' | 'left' | 'down' | 'right', step = MAP_MANUAL_STEP) {
  const next = { ...position }
  if (direction === 'up') next.y -= step
  if (direction === 'left') next.x -= step
  if (direction === 'down') next.y += step
  if (direction === 'right') next.x += step
  return clampMapPosition(next)
}
