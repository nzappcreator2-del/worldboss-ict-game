import { describe, expect, it } from 'vitest'
import { applyBattleAnswer, battleOutcome, healPlayer, matchingAnswerIsCorrect, starsForScore } from './quizLogic'

describe('battle rules', () => {
  it('damages the boss and grows combo for a correct answer', () => {
    expect(applyBattleAnswer({ bossHp: 100, playerHp: 100, score: 0, combo: 1 }, true, 5)).toEqual({
      bossHp: 80, playerHp: 100, score: 1, combo: 1.2,
    })
  })

  it('damages the player and resets combo for a wrong answer', () => {
    expect(applyBattleAnswer({ bossHp: 80, playerHp: 100, score: 1, combo: 1.4 }, false, 5)).toEqual({
      bossHp: 80, playerHp: 100 - (100 / 3), score: 1, combo: 1,
    })
  })

  it('requires at least sixty percent even when every question was reached', () => {
    expect(battleOutcome(true, 2, 4)).toEqual({ passed: false, percent: 50 })
    expect(battleOutcome(true, 3, 5)).toEqual({ passed: true, percent: 60 })
    expect(battleOutcome(false, 5, 5).passed).toBe(false)
  })

  it('calculates stars and caps potion healing at full HP', () => {
    expect(starsForScore(3, 5)).toBe(2)
    expect(starsForScore(4, 5)).toBe(3)
    expect(healPlayer(80)).toBe(100)
    expect(healPlayer(40)).toBe(70)
  })

  it('accepts matching only when every configured pair is correct', () => {
    const pairs = [{ left: '1+1', right: '2' }, { left: '2+2', right: '4' }]
    expect(matchingAnswerIsCorrect(pairs, { '1+1': '2', '2+2': '4' })).toBe(true)
    expect(matchingAnswerIsCorrect(pairs, { '1+1': '4', '2+2': '2' })).toBe(false)
    expect(matchingAnswerIsCorrect(pairs, { '1+1': '2' })).toBe(false)
  })
})
