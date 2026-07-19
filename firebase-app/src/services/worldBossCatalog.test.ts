import { describe, expect, it } from 'vitest'
import { WORLD_BOSS_CATALOG, findWorldBoss } from './worldBossCatalog'

describe('WORLD_BOSS_CATALOG', () => {
  it('lists the eight playable mini-game stages with unique ids', () => {
    expect(WORLD_BOSS_CATALOG).toHaveLength(8)
    const ids = WORLD_BOSS_CATALOG.map((boss) => boss.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain('WB001')
    expect(ids).toContain('WB002_SPEEDRUN')
  })

  it('keeps every reward under the Firestore ±1000 per-write delta cap', () => {
    for (const boss of WORLD_BOSS_CATALOG) {
      // submitWorldBossScore adds rewardCoins + up to 200 bonus in one write.
      expect(boss.rewardCoins + 200).toBeLessThanOrEqual(1000)
      expect(boss.rewardXp).toBeLessThanOrEqual(1000)
      expect(boss.targetReps).toBeGreaterThan(0)
      expect(boss.name.length).toBeGreaterThan(0)
      expect(boss.poseType.length).toBeGreaterThan(0)
    }
  })

  it('resolves lobby stages and the hidden neck-quiz entry by id', () => {
    expect(findWorldBoss('WB002_10')?.name).toContain('10 วินาที')
    expect(findWorldBoss('WB003')?.poseType).toBe('neck_quiz')
    expect(findWorldBoss('WB999')).toBeNull()
    expect(findWorldBoss('')).toBeNull()
  })
})
