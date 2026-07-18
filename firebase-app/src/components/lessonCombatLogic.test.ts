import { describe, expect, it } from 'vitest'
import {
  LESSON_MONSTER_SPECIES,
  advanceCombo,
  createLessonEnemy,
  killXpReward,
  respawnLessonEnemy,
  rollPlayerStrike,
  selectEnemyInAttackRange,
  stepLessonBoss,
  stepLessonEnemy,
} from './lessonCombatLogic'

describe('lesson RPG combat loop', () => {
  it('patrols near its spawn point while the player is out of sight', () => {
    const enemy = createLessonEnemy(1, { x: 30, y: 50 })
    const result = stepLessonEnemy(enemy, { x: 80, y: 80 }, 500, Math.PI / 2)

    expect(result.enemy.mode).toBe('patrol')
    expect(Math.hypot(result.enemy.x - enemy.homeX, result.enemy.y - enemy.homeY)).toBeLessThanOrEqual(7)
    expect(result.playerDamage).toBe(0)
  })

  it('detects and chases a player inside the aggro radius', () => {
    const enemy = createLessonEnemy(1, { x: 30, y: 50 })
    const before = Math.hypot(42 - enemy.x, 50 - enemy.y)
    const result = stepLessonEnemy(enemy, { x: 42, y: 50 }, 500, 0)

    expect(result.enemy.mode).toBe('chase')
    expect(Math.hypot(42 - result.enemy.x, 50 - result.enemy.y)).toBeLessThan(before)
    expect(result.enemy.direction).toBe('right')
  })

  it('telegraphs with a wind-up before the strike lands, then respects its cooldown', () => {
    let current = createLessonEnemy(1, { x: 30, y: 50 })
    const first = stepLessonEnemy(current, { x: 33, y: 50 }, 100, 0)
    expect(first.enemy.mode).toBe('windup')
    expect(first.playerDamage).toBe(0)

    current = first.enemy
    let dealt = 0
    for (let tick = 0; tick < 6 && dealt === 0; tick += 1) {
      const step = stepLessonEnemy(current, { x: 33, y: 50 }, 100, 0)
      dealt = step.playerDamage
      current = step.enemy
    }
    expect(dealt).toBe(12)
    expect(current.mode).toBe('attack')

    const onCooldown = stepLessonEnemy(current, { x: 33, y: 50 }, 100, 0)
    expect(onCooldown.playerDamage).toBe(0)
  })

  it('cancels the wind-up when the player escapes the melee range', () => {
    const enemy = createLessonEnemy(1, { x: 30, y: 50 })
    const winding = stepLessonEnemy(enemy, { x: 33, y: 50 }, 100, 0)
    const escaped = stepLessonEnemy(winding.enemy, { x: 45, y: 50 }, 100, 0)

    expect(escaped.enemy.mode).toBe('chase')
    expect(escaped.enemy.windupMs).toBe(0)
    expect(escaped.playerDamage).toBe(0)
  })

  it('selects only the nearest living enemy inside player attack range', () => {
    const near = createLessonEnemy(1, { x: 54, y: 50 })
    const far = createLessonEnemy(2, { x: 75, y: 50 })
    expect(selectEnemyInAttackRange([far, near], { x: 50, y: 50 }, 9)?.id).toBe(1)
    expect(selectEnemyInAttackRange([far], { x: 50, y: 50 }, 9)).toBeNull()
    expect(selectEnemyInAttackRange([{ ...near, hp: 0, mode: 'dead' }], { x: 50, y: 50 }, 9)).toBeNull()
  })
})

describe('player strike rolls', () => {
  it('deals base damage without a crit on a low roll', () => {
    expect(rollPlayerStrike(() => 0)).toEqual({ damage: 45, crit: false })
  })

  it('adds variance and doubles the damage on a critical roll', () => {
    expect(rollPlayerStrike(() => 0.95)).toEqual({ damage: (45 + 6) * 2, crit: true })
  })

  it('applies bonus attack from sealed monster cards', () => {
    expect(rollPlayerStrike(() => 0, 8)).toEqual({ damage: 53, crit: false })
  })

  it('raises the variance floor from DEX stat mods without changing the default roll', () => {
    expect(rollPlayerStrike(() => 0, 0, { varianceFloor: 2 })).toEqual({ damage: 47, crit: false })
    expect(rollPlayerStrike(() => 0)).toEqual({ damage: 45, crit: false })
  })

  it('lowers the crit threshold from LUK stat mods', () => {
    expect(rollPlayerStrike(() => 0.86, 0, { critThreshold: 0.85 })).toEqual({ damage: (45 + 6) * 2, crit: true })
    expect(rollPlayerStrike(() => 0.86)).toEqual({ damage: 45 + 6, crit: false })
  })
})

describe('monster species and respawn', () => {
  it('spawns archive guards tougher and harder-hitting than shadow keepers', () => {
    const guard = createLessonEnemy(1, { x: 10, y: 40 }, LESSON_MONSTER_SPECIES['archive-guard'])
    expect(guard.hp).toBe(130)
    expect(guard.species.strikeDamage).toBe(16)
    expect(guard.species.lootTier).toBe(2)
    expect(createLessonEnemy(1, { x: 10, y: 40 }).hp).toBe(100)
  })

  it('deals species strike damage when the hit lands', () => {
    let current = createLessonEnemy(1, { x: 30, y: 50 }, LESSON_MONSTER_SPECIES['archive-guard'])
    let dealt = 0
    for (let tick = 0; tick < 8 && dealt === 0; tick += 1) {
      const step = stepLessonEnemy(current, { x: 33, y: 50 }, 100, 0)
      dealt = step.playerDamage
      current = step.enemy
    }
    expect(dealt).toBe(16)
  })

  it('respawns a defeated enemy at home with full hp and patrol mode', () => {
    const fallen = { ...createLessonEnemy(2, { x: 30, y: 40 }), hp: 0, mode: 'dead' as const, x: 55, y: 60, frame: 99 }
    expect(respawnLessonEnemy(fallen)).toMatchObject({ id: 2, x: 30, y: 40, hp: 100, mode: 'patrol' })
  })
})

describe('field monster roster', () => {
  it('tags the original LPC-sprite species with the lpc-archer body', () => {
    expect(LESSON_MONSTER_SPECIES['shadow-keeper']).toMatchObject({ body: 'lpc-archer', maxHp: 100, strikeDamage: 12, lootTier: 1 })
    expect(LESSON_MONSTER_SPECIES['archive-guard']).toMatchObject({ body: 'lpc-archer', maxHp: 130, strikeDamage: 16, lootTier: 2 })
  })

  it('adds four SVG pixel-art field monsters with distinct bodies and stats', () => {
    expect(LESSON_MONSTER_SPECIES['gel-slime']).toMatchObject({ name: 'สไลม์เจล', level: 1, maxHp: 40, strikeDamage: 6, lootTier: 1, body: 'slime' })
    expect(LESSON_MONSTER_SPECIES['spore-cap']).toMatchObject({ name: 'เห็ดสปอร์', level: 3, maxHp: 80, strikeDamage: 10, lootTier: 1, body: 'mushroom' })
    expect(LESSON_MONSTER_SPECIES['gloom-bat']).toMatchObject({ name: 'ค้างคาวเงา', level: 3, maxHp: 70, strikeDamage: 12, lootTier: 2, body: 'bat' })
    expect(LESSON_MONSTER_SPECIES['grimoire']).toMatchObject({ name: 'ตำราผีสิง', level: 5, maxHp: 110, strikeDamage: 16, lootTier: 2, body: 'tome' })
  })

  it('spawns new species at their declared max hp through createLessonEnemy', () => {
    const slime = createLessonEnemy(9, { x: 40, y: 40 }, LESSON_MONSTER_SPECIES['gel-slime'])
    expect(slime.hp).toBe(40)
    expect(slime.species.body).toBe('slime')
  })
})

describe('combo chain', () => {
  it('extends the chain inside the window and resets outside it', () => {
    const first = advanceCombo({ count: 0, lastHitAt: 0 }, 1000)
    const second = advanceCombo(first, 1500)
    expect(first.count).toBe(1)
    expect(second.count).toBe(2)
    expect(advanceCombo(second, 1500 + 2000).count).toBe(1)
  })
})

describe('monster xp rewards', () => {
  it('gives every species an xp reward that scales with its level', () => {
    for (const species of Object.values(LESSON_MONSTER_SPECIES)) {
      expect(species.xpReward).toBeGreaterThan(0)
    }
    expect(LESSON_MONSTER_SPECIES['gel-slime'].xpReward).toBeLessThan(LESSON_MONSTER_SPECIES['shadow-keeper'].xpReward)
    expect(LESSON_MONSTER_SPECIES['shadow-keeper'].xpReward).toBeLessThan(LESSON_MONSTER_SPECIES['archive-guard'].xpReward)
    expect(LESSON_MONSTER_SPECIES['archive-guard'].xpReward).toBeLessThan(LESSON_MONSTER_SPECIES['grimoire'].xpReward)
  })

  it('pays a combo bonus of 10% per extra chain step capped at +50%', () => {
    expect(killXpReward(20, 0)).toBe(20)
    expect(killXpReward(20, 1)).toBe(20)
    expect(killXpReward(20, 2)).toBe(22)
    expect(killXpReward(20, 6)).toBe(30)
    expect(killXpReward(20, 99)).toBe(30)
  })

  it('rounds the bonus and refuses junk input', () => {
    expect(killXpReward(15, 2)).toBe(17)
    expect(killXpReward(Number.NaN, 3)).toBe(0)
    expect(killXpReward(-10, 2)).toBe(0)
  })
})

describe('lesson boss movement', () => {
  it('walks toward the player while outside its attack range', () => {
    const boss = { x: 50, y: 43 }
    const before = Math.hypot(20 - boss.x, 43 - boss.y)
    const result = stepLessonBoss(boss, { x: 20, y: 43 }, 500, 13)

    expect(result.mode).toBe('walk')
    expect(result.direction).toBe('left')
    expect(Math.hypot(20 - result.x, 43 - result.y)).toBeLessThan(before)
  })

  it('stops moving and switches to attack once within range', () => {
    const boss = { x: 50, y: 43 }
    const result = stepLessonBoss(boss, { x: 55, y: 43 }, 500, 13)

    expect(result.mode).toBe('attack')
    expect(result.direction).toBe('right')
    expect(result.x).toBe(boss.x)
    expect(result.y).toBe(boss.y)
  })

  it('never overshoots the player position in a single step', () => {
    const boss = { x: 50, y: 43 }
    const result = stepLessonBoss(boss, { x: 50.5, y: 43 }, 5000, 0.1, 'walk', 8)

    expect(result.x).toBeCloseTo(50.5, 5)
  })

  it('keeps attacking past the release margin once already engaged, to avoid flicker at the boundary', () => {
    const boss = { x: 50, y: 43 }
    const stillAttacking = stepLessonBoss(boss, { x: 65, y: 43 }, 500, 13, 'attack')
    expect(stillAttacking.mode).toBe('attack')

    const releases = stepLessonBoss(boss, { x: 70, y: 43 }, 500, 13, 'attack')
    expect(releases.mode).toBe('walk')
  })

  it('does not start attacking again just past attack range while already walking', () => {
    const boss = { x: 50, y: 43 }
    const result = stepLessonBoss(boss, { x: 64, y: 43 }, 500, 13, 'walk')
    expect(result.mode).toBe('walk')
  })
})
