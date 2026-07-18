import { describe, expect, it } from 'vitest'
import { updateBossCombatStep } from './bossCombatLogic'

describe('bossCombatLogic', () => {
  const BOSS_ATTACK_RANGE = 13

  it('when distance is greater than BOSS_ATTACK_RANGE, action should be walk and direction should point toward player', () => {
    // Boss at {x: 68, y: 62}, Player at {x: 36, y: 70}
    // distance = hypot(32, -8) = hypot(32, 8) = sqrt(1024 + 64) = sqrt(1088) ≈ 32.98 > 13
    const bossPos = { x: 68, y: 62 }
    const playerPos = { x: 36, y: 70 }
    const step = 2

    const result = updateBossCombatStep(bossPos, playerPos, BOSS_ATTACK_RANGE, step)
    expect(result.action).toBe('walk')
    expect(result.direction).toBe('left') // deltaX = -32, deltaY = 8, absolute of deltaX (32) > absolute of deltaY (8), x < 0 -> left
    expect(result.position).not.toEqual(bossPos)
  })

  it('when distance is less than or equal to BOSS_ATTACK_RANGE, action should be attack and position should not change', () => {
    // Boss at {x: 68, y: 62}, Player at {x: 60, y: 62}
    // distance = 8 <= 13
    const bossPos = { x: 68, y: 62 }
    const playerPos = { x: 60, y: 62 }
    const step = 2

    const result = updateBossCombatStep(bossPos, playerPos, BOSS_ATTACK_RANGE, step)
    expect(result.action).toBe('attack')
    expect(result.direction).toBe('left')
    expect(result.position).toEqual(bossPos)
  })

  it('when boss moves to exactly BOSS_ATTACK_RANGE, it should switch to attack and not overshoot', () => {
    // Boss at {x: 68, y: 62}, Player at {x: 55, y: 62}
    // distance = 13 (exactly BOSS_ATTACK_RANGE)
    const bossPos = { x: 68, y: 62 }
    const playerPos = { x: 55, y: 62 }
    const step = 2

    const result = updateBossCombatStep(bossPos, playerPos, BOSS_ATTACK_RANGE, step)
    expect(result.action).toBe('attack')
    expect(result.position).toEqual(bossPos)
  })

  it('when player changes position, boss direction should adapt to the new position', () => {
    const bossPos = { x: 68, y: 62 }
    const playerPos1 = { x: 36, y: 70 } // direction left
    const playerPos2 = { x: 68, y: 80 } // direction down

    const result1 = updateBossCombatStep(bossPos, playerPos1, BOSS_ATTACK_RANGE, 2)
    expect(result1.direction).toBe('left')

    const result2 = updateBossCombatStep(bossPos, playerPos2, BOSS_ATTACK_RANGE, 2)
    expect(result2.direction).toBe('down')
  })
})
