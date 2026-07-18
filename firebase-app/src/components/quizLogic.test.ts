import { describe, expect, it } from 'vitest'
import { applyBattleAnswer, applySkirmishExchange, battleOutcome, bossDamagePerCorrect, bossSkillDelayMs, healPlayer, matchingAnswerIsCorrect, playerDamagePerWrong, selectBossSkillQuestionIndex, starsForScore } from './quizLogic'

describe('battle rules', () => {
  it('scales heavy boss and player damage from the configured question count', () => {
    expect(bossDamagePerCorrect(5)).toBe(20)
    expect(bossDamagePerCorrect(10)).toBe(10)
    expect(playerDamagePerWrong(2)).toBe(50)
    expect(playerDamagePerWrong(8)).toBeCloseTo(100 / 3)
  })

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

  it('randomizes the boss skill timing and question pick within safe bounds', () => {
    expect(bossSkillDelayMs(() => 0)).toBe(2200)
    expect(bossSkillDelayMs(() => 1)).toBe(4000)
    expect(selectBossSkillQuestionIndex([2, 5, 9], () => 0)).toBe(2)
    expect(selectBossSkillQuestionIndex([2, 5, 9], () => 0.66)).toBe(5)
    expect(selectBossSkillQuestionIndex([], () => 0.5)).toBe(-1)
  })

  it('chips both combatants during normal boss skirmish without killing the boss before pending questions', () => {
    expect(applySkirmishExchange({ bossHp: 100, playerHp: 100, score: 0, combo: 1 }, 5, 5)).toEqual({
      bossHp: 99, playerHp: 98, score: 0, combo: 1,
    })
    expect(applySkirmishExchange({ bossHp: 81, playerHp: 4, score: 0, combo: 1 }, 5, 5)).toEqual({
      bossHp: 81, playerHp: 2, score: 0, combo: 1,
    })
    expect(applySkirmishExchange({ bossHp: 80, playerHp: 1, score: 0, combo: 1 }, 5, 4)).toEqual({
      bossHp: 79, playerHp: 1, score: 0, combo: 1,
    })
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
