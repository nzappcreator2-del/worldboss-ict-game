import type { CharacterPosition } from './dashboardCharacter'

export type CameraSize = {
  width: number
  height: number
}

export type CameraAnchor = {
  x: number
  y: number
}

const DEFAULT_CAMERA_ANCHOR: CameraAnchor = { x: 0.5, y: 0.5 }

function finitePositive(value: number) {
  return Number.isFinite(value) && value > 0
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

/**
 * Calculates a bounded world translation for a player-follow camera.
 * A world that already fits inside the viewport stays fixed, preserving the
 * existing desktop layout exactly.
 */
export function mobileCameraOffset(
  position: CharacterPosition,
  viewport: CameraSize,
  world: CameraSize,
  anchor: CameraAnchor = DEFAULT_CAMERA_ANCHOR,
) {
  if (
    !finitePositive(viewport.width) ||
    !finitePositive(viewport.height) ||
    !finitePositive(world.width) ||
    !finitePositive(world.height)
  ) {
    return { x: 0, y: 0 }
  }

  const overflowX = Math.max(0, world.width - viewport.width)
  const overflowY = Math.max(0, world.height - viewport.height)
  const playerX = world.width * clamp(position.x, 0, 100) / 100
  const playerY = world.height * clamp(position.y, 0, 100) / 100

  return {
    x: overflowX === 0
      ? 0
      : Math.round(clamp(viewport.width * clamp(anchor.x, 0, 1) - playerX, -overflowX, 0)),
    y: overflowY === 0
      ? 0
      : Math.round(clamp(viewport.height * clamp(anchor.y, 0, 1) - playerY, -overflowY, 0)),
  }
}
