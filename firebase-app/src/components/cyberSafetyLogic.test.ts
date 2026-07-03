import { describe, expect, it } from 'vitest'
import { applyCyberChoice, cyberReward } from './cyberSafetyLogic'

describe('cyber safety rules', () => {
  it('damages the shield and records an attempt for a wrong choice', () => {
    expect(applyCyberChoice({ shield: 100, coins: 0, xp: 0, attempts: 0 }, false)).toEqual({ shield: 75, coins: 0, xp: 0, attempts: 1 })
    expect(applyCyberChoice({ shield: 0, coins: 0, xp: 0, attempts: 3 }, false).shield).toBe(0)
  })

  it('awards twenty on first try and five after a retry', () => {
    expect(cyberReward(0)).toEqual({ coins: 20, xp: 20 })
    expect(cyberReward(1)).toEqual({ coins: 5, xp: 5 })
    expect(applyCyberChoice({ shield: 75, coins: 0, xp: 0, attempts: 1 }, true)).toEqual({ shield: 75, coins: 5, xp: 5, attempts: 1 })
  })
})
