import { describe, expect, it } from 'vitest'
import { applyPvpAnswer, isPvpWinner, validPrivatePin } from './pvpBattleLogic'

describe('PVP battle rules', () => {
  it('keeps HP on correct answers and loses twenty on wrong or timeout answers', () => {
    expect(applyPvpAnswer(100, true)).toBe(100)
    expect(applyPvpAnswer(100, false)).toBe(80)
    expect(applyPvpAnswer(10, false)).toBe(0)
  })

  it('treats a draw as a win like the original UX', () => {
    expect(isPvpWinner('Player1', { p1Hp: 80, p2Hp: 60 })).toBe(true)
    expect(isPvpWinner('Player2', { p1Hp: 80, p2Hp: 80 })).toBe(true)
    expect(isPvpWinner('Player2', { p1Hp: 80, p2Hp: 60 })).toBe(false)
  })

  it('accepts only a four-digit private room PIN', () => {
    expect(validPrivatePin('1234')).toBe(true)
    expect(validPrivatePin('12A4')).toBe(false)
    expect(validPrivatePin('123')).toBe(false)
  })
})
