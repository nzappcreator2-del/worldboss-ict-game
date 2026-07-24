export type WalkDirection = 'up' | 'left' | 'down' | 'right'
export type CharacterPosition = { x: number; y: number }

export type CharacterSpriteConfig = {
  columns: number
  rows: number
  sourceFrameSize: number
  walkFrames: readonly number[]
  directionRows: Record<WalkDirection, number>
}

export const TEST_CHARACTER_SPRITE: CharacterSpriteConfig = {
  columns: 18,
  rows: 66,
  sourceFrameSize: 64,
  walkFrames: [0, 1, 2, 3, 4, 5, 6, 7, 8],
  directionRows: { up: 8, left: 9, down: 10, right: 11 },
}

export const DEFAULT_CHARACTER_POSITION: CharacterPosition = { x: 50, y: 64 }
export const HUB_WALK_BOUNDS = { minX: 20, maxX: 78, minY: 40, maxY: 80 } as const
export const HUB_MOVEMENT_SPEED = 13
export const CHARACTER_RENDER_SIZE = 112

export type WalkBounds = { minX: number; maxX: number; minY: number; maxY: number }

function clampPosition(position: CharacterPosition, bounds: WalkBounds = HUB_WALK_BOUNDS): CharacterPosition {
  return {
    x: Math.min(bounds.maxX, Math.max(bounds.minX, position.x)),
    y: Math.min(bounds.maxY, Math.max(bounds.minY, position.y)),
  }
}

export function directionForKey(key: unknown): WalkDirection | null {
  if (typeof key !== 'string') return null
  const normalized = key.toLowerCase()
  if (normalized === 'arrowup' || normalized === 'w') return 'up'
  if (normalized === 'arrowleft' || normalized === 'a') return 'left'
  if (normalized === 'arrowdown' || normalized === 's') return 'down'
  if (normalized === 'arrowright' || normalized === 'd') return 'right'
  return null
}

export function moveCharacter(position: CharacterPosition, direction: WalkDirection, step = 2, bounds?: WalkBounds): CharacterPosition {
  const next = { ...position }
  if (direction === 'up') next.y -= step
  if (direction === 'left') next.x -= step
  if (direction === 'down') next.y += step
  if (direction === 'right') next.x += step
  return clampPosition(next, bounds)
}

export function nextWalkFrame(frame: number, frameCount: number) {
  return frameCount > 0 ? (frame + 1) % frameCount : 0
}

export function movementStepForElapsed(elapsedMs: number, speedPerSecond = HUB_MOVEMENT_SPEED) {
  const safeElapsed = Math.min(50, Math.max(0, elapsedMs))
  return (safeElapsed / 1000) * speedPerSecond
}

export function movementElapsedForFrame(
  previousTimestamp: number | null,
  timestamp: number,
  fallbackMs = 16,
  maxFrameMs = 34,
) {
  if (previousTimestamp === null) return fallbackMs
  return Math.min(maxFrameMs, Math.max(0, timestamp - previousTimestamp))
}

export function pointerToWalkPosition(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  bounds?: WalkBounds,
) {
  if (rect.width <= 0 || rect.height <= 0) return { ...DEFAULT_CHARACTER_POSITION }
  return clampPosition({
    x: ((clientX - rect.left) / rect.width) * 100,
    y: ((clientY - rect.top) / rect.height) * 100,
  }, bounds)
}

export function directionTowardTarget(position: CharacterPosition, target: CharacterPosition): WalkDirection {
  const deltaX = target.x - position.x
  const deltaY = target.y - position.y
  if (Math.abs(deltaX) >= Math.abs(deltaY)) return deltaX < 0 ? 'left' : 'right'
  return deltaY < 0 ? 'up' : 'down'
}

export function moveTowardTarget(position: CharacterPosition, target: CharacterPosition, maxDistance: number, bounds?: WalkBounds) {
  const deltaX = target.x - position.x
  const deltaY = target.y - position.y
  const distance = Math.hypot(deltaX, deltaY)
  if (distance <= Math.max(0, maxDistance) || distance < 0.01) {
    return { position: clampPosition(target, bounds), reached: true }
  }
  const ratio = Math.max(0, maxDistance) / distance
  return {
    position: clampPosition({ x: position.x + deltaX * ratio, y: position.y + deltaY * ratio }, bounds),
    reached: false,
  }
}

export function spriteBackgroundPosition(
  config: CharacterSpriteConfig,
  direction: WalkDirection,
  frame: number,
  renderFrameSize: number,
) {
  const sourceColumn = config.walkFrames[frame % config.walkFrames.length] || 0
  return `${-sourceColumn * renderFrameSize}px ${-config.directionRows[direction] * renderFrameSize}px`
}
