import { describe, expect, it } from 'vitest'
import { gameFileForBoss, motionArcadeBosses, normalizeWorldBosses, scorePresentation, validWorldBossResult } from './worldBossLogic'

describe('World Boss migration logic', () => {
  it('adds the neck quiz and groups every WB002 variant into one lobby card', () => {
    const bosses = normalizeWorldBosses([
      { id: 'WB001', name: 'Mario', poseType: 'mario_fitness', targetReps: 10, maxHp: 100, rewardCoins: 100, rewardXp: 120 },
      { id: 'WB002_10', name: 'Ten', poseType: 'speed_runner', targetReps: 10, maxHp: 100, rewardCoins: 100, rewardXp: 100 },
      { id: 'WB002_20', name: 'Twenty', poseType: 'speed_runner', targetReps: 20, maxHp: 100, rewardCoins: 200, rewardXp: 200 },
    ])

    expect(bosses.map((boss) => boss.id)).toEqual(['WB001', 'WB002', 'WB003'])
    expect(bosses[1]).toMatchObject({ name: 'สมรภูมิยอดนักวิ่งลมกรด (Speed Runner)', rewardCoins: 200, rewardXp: 200 })
  })

  it('does not duplicate an existing neck quiz', () => {
    expect(normalizeWorldBosses([{ id: 'WB003', name: 'Quiz', poseType: 'neck_quiz', targetReps: 20, maxHp: 100, rewardCoins: 300, rewardXp: 300 }]))
      .toHaveLength(1)
  })

  it('selects the Vite-hosted standalone game and formats score semantics', () => {
    expect(gameFileForBoss({ id: 'WB003', poseType: 'neck_quiz' })).toBe('neck_quiz.html')
    expect(gameFileForBoss({ id: 'WB001', poseType: 'mario_fitness' })).toBe('fitness.html')
    expect(scorePresentation('WB002_10', 7)).toEqual({ value: '7', unit: 'ข้อ' })
    expect(scorePresentation('WB002_SPEEDRUN', 12.345)).toEqual({ value: '12.35', unit: 'วินาที' })
    expect(scorePresentation('WB003', 9)).toEqual({ value: '9', unit: 'ข้อ' })
  })

  it('lists only camera/motion games in the Motion & AR zone, excluding the external Mario card', () => {
    const bosses = normalizeWorldBosses([
      { id: 'WB001', name: 'Mario', poseType: 'mario_fitness', targetReps: 10, maxHp: 100, rewardCoins: 100, rewardXp: 120 },
      { id: 'WB002_10', name: 'Safety', poseType: 'speed_runner', targetReps: 10, maxHp: 100, rewardCoins: 100, rewardXp: 100 },
    ])

    expect(motionArcadeBosses(bosses).map((boss) => boss.id)).toEqual(['WB002', 'WB003'])
  })

  it('accepts only finite results with the expected session', () => {
    const event = { type: 'nextgen:world-boss-result', session: 's1', payload: { bossId: 'WB001', score: 12.5, bonusCoins: 5 } }
    expect(validWorldBossResult(event, 's1')).toEqual(event)
    expect(validWorldBossResult(event, 'other')).toBeNull()
    expect(validWorldBossResult({ ...event, payload: { ...event.payload, score: Number.NaN } }, 's1')).toBeNull()
    expect(validWorldBossResult({ ...event, payload: { ...event.payload, score: -1 } }, 's1')).toBeNull()
  })
})
