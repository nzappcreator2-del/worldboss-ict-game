import {
  directionTowardTarget,
  moveTowardTarget,
  type CharacterPosition,
  type WalkDirection,
} from './dashboardCharacter'

export type BossAction = 'idle' | 'walk' | 'attack'

export interface BossStepResult {
  action: BossAction
  position: CharacterPosition
  direction: WalkDirection
}

export function updateBossCombatStep(
  bossPosition: CharacterPosition,
  playerPosition: CharacterPosition,
  attackRange: number,
  movementStep: number,
): BossStepResult {
  const deltaX = playerPosition.x - bossPosition.x
  const deltaY = playerPosition.y - bossPosition.y
  const distance = Math.hypot(deltaX, deltaY)

  if (distance <= attackRange) {
    const direction = directionTowardTarget(bossPosition, playerPosition)
    return {
      action: 'attack',
      position: bossPosition,
      direction,
    }
  }

  const result = moveTowardTarget(bossPosition, playerPosition, movementStep)
  const direction = directionTowardTarget(bossPosition, playerPosition)

  return {
    action: 'walk',
    position: result.position,
    direction,
  }
}
