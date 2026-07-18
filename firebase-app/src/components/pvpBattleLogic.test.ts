import { describe, expect, it } from 'vitest'
import { applyPvpAnswer, pvpOutcome, validPrivatePin } from './pvpBattleLogic'

describe('PVP battle rules', () => {
  it('keeps HP on correct answers and loses twenty on wrong or timeout answers', () => {
    expect(applyPvpAnswer(100, true)).toBe(100)
    expect(applyPvpAnswer(100, false)).toBe(80)
    expect(applyPvpAnswer(10, false)).toBe(0)
  })

  it('declares win, lose, or an honest draw from both perspectives', () => {
    expect(pvpOutcome('Player1', { p1Hp: 80, p2Hp: 60 })).toBe('win')
    expect(pvpOutcome('Player2', { p1Hp: 80, p2Hp: 60 })).toBe('lose')
    expect(pvpOutcome('Player1', { p1Hp: 80, p2Hp: 80 })).toBe('draw')
    expect(pvpOutcome('Player2', { p1Hp: 80, p2Hp: 80 })).toBe('draw')
  })

  it('accepts only a four-digit private room PIN', () => {
    expect(validPrivatePin('1234')).toBe(true)
    expect(validPrivatePin('12A4')).toBe(false)
    expect(validPrivatePin('123')).toBe(false)
  })
})
