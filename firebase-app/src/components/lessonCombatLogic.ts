import type { CharacterPosition, WalkDirection } from './dashboardCharacter'
import type { LessonMonsterSkinKey } from './lessonMapSets'

export type LessonEnemyMode = 'patrol' | 'chase' | 'windup' | 'attack' | 'hurt' | 'dead'

// 'lpc-archer' renders the original LPC spritesheet; the rest render hand-drawn SVG pixel art
// (see LessonMonsterSprites.tsx) — no licensed Ragnarok/Gravity assets involved.
export type LessonMonsterBody = 'lpc-archer' | 'slime' | 'mushroom' | 'bat' | 'tome'
export type LessonMonsterSpeciesKey = 'shadow-keeper' | 'archive-guard' | 'gel-slime' | 'spore-cap' | 'gloom-bat' | 'grimoire'

export type LessonMonsterSpecies = {
  key: LessonMonsterSpeciesKey
  name: string
  level: number
  maxHp: number
  strikeDamage: number
  lootTier: 1 | 2
  body: LessonMonsterBody
  xpReward: number
}

export const LESSON_MONSTER_SPECIES: Record<LessonMonsterSpeciesKey, LessonMonsterSpecies> = {
  'shadow-keeper': { key: 'shadow-keeper', name: 'ผู้พิทักษ์เงา', level: 2, maxHp: 100, strikeDamage: 12, lootTier: 1, body: 'lpc-archer', xpReward: 15 },
  'archive-guard': { key: 'archive-guard', name: 'ยามเฝ้าหอ', level: 4, maxHp: 130, strikeDamage: 16, lootTier: 2, body: 'lpc-archer', xpReward: 22 },
  'gel-slime': { key: 'gel-slime', name: 'สไลม์เจล', level: 1, maxHp: 40, strikeDamage: 6, lootTier: 1, body: 'slime', xpReward: 8 },
  'spore-cap': { key: 'spore-cap', name: 'เห็ดสปอร์', level: 3, maxHp: 80, strikeDamage: 10, lootTier: 1, body: 'mushroom', xpReward: 12 },
  'gloom-bat': { key: 'gloom-bat', name: 'ค้างคาวเงา', level: 3, maxHp: 70, strikeDamage: 12, lootTier: 2, body: 'bat', xpReward: 14 },
  'grimoire': { key: 'grimoire', name: 'ตำราผีสิง', level: 5, maxHp: 110, strikeDamage: 16, lootTier: 2, body: 'tome', xpReward: 26 },
}

// Kill XP with a small combo sweetener: +10% per chain step beyond the first,
// capped at +50% so keeping the rhythm matters but cannot inflate rewards.
export const KILL_COMBO_XP_BONUS_PER_STEP = 0.1
export const KILL_COMBO_XP_BONUS_CAP = 0.5

export function killXpReward(baseXp: number, comboCount: number): number {
  const base = Math.max(0, Number(baseXp) || 0)
  const steps = Math.max(0, Math.floor(Number(comboCount) || 0) - 1)
  const bonus = Math.min(KILL_COMBO_XP_BONUS_CAP, steps * KILL_COMBO_XP_BONUS_PER_STEP)
  return Math.round(base * (1 + bonus))
}

export type LessonEnemy = {
  id: number
  x: number
  y: number
  homeX: number
  homeY: number
  hp: number
  mode: LessonEnemyMode
  direction: WalkDirection
  frame: number
  attackCooldownMs: number
  windupMs: number
  species: LessonMonsterSpecies
  skin?: LessonMonsterSkinKey
}

export const LESSON_ENEMY_AGGRO_RANGE = 22
export const LESSON_ENEMY_ATTACK_RANGE = 4.5
// Distances are % of the lesson WORLD, which is 1.8x the viewport wide — so
// even "6" reads as a ~200px gap on a desktop screen. Split the melee feel in
// two numbers: ENGAGE is how close a fighter *walks* before swinging (~one
// 104px sprite body — chest to chest, so kills drop loot at the player's
// feet), while the ATTACK ranges are the swing's hit registration, kept a
// little longer so a strike still lands when the target shuffles mid-windup.
export const LESSON_MELEE_ENGAGE_RANGE = 2.6
export const LESSON_PLAYER_ATTACK_RANGE = 4
export const LESSON_SKILL_ATTACK_RANGE = 5.5
export const LESSON_ENEMY_WINDUP_MS = 350
export const LESSON_ENEMY_STRIKE_DAMAGE = 12
export const LESSON_ENEMY_DEATH_TICKS = 6
// Dead monsters keep their corpse slot until this many 100ms ticks pass, then respawn at home.
export const LESSON_ENEMY_RESPAWN_TICKS = 80

export function createLessonEnemy(id: number, home: CharacterPosition, species: LessonMonsterSpecies = LESSON_MONSTER_SPECIES['shadow-keeper'], skin?: LessonMonsterSkinKey): LessonEnemy {
  return { id, x: home.x, y: home.y, homeX: home.x, homeY: home.y, hp: species.maxHp, mode: 'patrol', direction: 'down', frame: 0, attackCooldownMs: 0, windupMs: 0, species, skin }
}

export function respawnLessonEnemy(enemy: LessonEnemy): LessonEnemy {
  return createLessonEnemy(enemy.id, { x: enemy.homeX, y: enemy.homeY }, enemy.species, enemy.skin)
}

// Player strike: base damage plus a small variance roll, doubled on a lucky critical roll.
export const LESSON_PLAYER_BASE_DAMAGE = 45
export const LESSON_STRIKE_VARIANCE = 7
export const LESSON_CRIT_THRESHOLD = 0.9
export const LESSON_CRIT_MULTIPLIER = 2
export const LESSON_SKILL_MULTIPLIER = 2

export type LessonStrike = { damage: number; crit: boolean }
// DEX raises the minimum variance roll (varianceFloor); LUK lowers the crit threshold. Both
// default to the unmodified legacy behavior so callers without hero stats see no change.
export type StrikeMods = { critThreshold?: number; varianceFloor?: number }

function safeRoll(random: () => number) {
  return Math.min(0.999, Math.max(0, Number(random()) || 0))
}

export function rollPlayerStrike(random: () => number = Math.random, bonusAttack = 0, mods: StrikeMods = {}): LessonStrike {
  const rolledVariance = Math.floor(safeRoll(random) * LESSON_STRIKE_VARIANCE)
  const variance = Math.max(Math.max(0, Math.floor(mods.varianceFloor ?? 0)), rolledVariance)
  const crit = safeRoll(random) > (mods.critThreshold ?? LESSON_CRIT_THRESHOLD)
  const damage = (LESSON_PLAYER_BASE_DAMAGE + Math.max(0, bonusAttack) + variance) * (crit ? LESSON_CRIT_MULTIPLIER : 1)
  return { damage, crit }
}

// Ragnarok-style hit chain: consecutive hits inside the window keep the combo alive.
export const LESSON_COMBO_WINDOW_MS = 1800

export type LessonCombo = { count: number; lastHitAt: number }

export function advanceCombo(combo: LessonCombo, now: number): LessonCombo {
  if (combo.count > 0 && now - combo.lastHitAt <= LESSON_COMBO_WINDOW_MS) {
    return { count: combo.count + 1, lastHitAt: now }
  }
  return { count: 1, lastHitAt: now }
}

function directionToward(deltaX: number, deltaY: number): WalkDirection {
  if (Math.abs(deltaX) >= Math.abs(deltaY)) return deltaX < 0 ? 'left' : 'right'
  return deltaY < 0 ? 'up' : 'down'
}

function moveToward(enemy: LessonEnemy, target: CharacterPosition, distance: number) {
  const dx = target.x - enemy.x
  const dy = target.y - enemy.y
  const length = Math.hypot(dx, dy) || 1
  return {
    x: Math.min(92, Math.max(8, enemy.x + (dx / length) * Math.min(distance, length))),
    y: Math.min(84, Math.max(28, enemy.y + (dy / length) * Math.min(distance, length))),
    direction: directionToward(dx, dy),
  }
}

export function stepLessonEnemy(enemy: LessonEnemy, player: CharacterPosition, elapsedMs: number, patrolPhase: number) {
  if (enemy.mode === 'dead' || enemy.hp <= 0) return { enemy: { ...enemy, mode: 'dead' as const, frame: enemy.frame + 1 }, playerDamage: 0 }
  const safeElapsed = Math.min(100, Math.max(0, elapsedMs))
  const cooldown = Math.max(0, enemy.attackCooldownMs - safeElapsed)
  const dx = player.x - enemy.x
  const dy = player.y - enemy.y
  const distance = Math.hypot(dx, dy)
  const frame = (enemy.frame + 1) % 13

  if (distance <= LESSON_ENEMY_ATTACK_RANGE) {
    const direction = directionToward(dx, dy)
    if (cooldown > 0) {
      return { enemy: { ...enemy, mode: 'attack' as const, direction, frame, attackCooldownMs: cooldown, windupMs: 0 }, playerDamage: 0 }
    }
    if (enemy.windupMs <= 0) {
      return { enemy: { ...enemy, mode: 'windup' as const, direction, frame: 0, attackCooldownMs: 0, windupMs: LESSON_ENEMY_WINDUP_MS }, playerDamage: 0 }
    }
    const windup = enemy.windupMs - safeElapsed
    if (windup > 0) {
      return { enemy: { ...enemy, mode: 'windup' as const, direction, frame, attackCooldownMs: 0, windupMs: windup }, playerDamage: 0 }
    }
    return { enemy: { ...enemy, mode: 'attack' as const, direction, frame: 0, attackCooldownMs: 900, windupMs: 0 }, playerDamage: enemy.species.strikeDamage }
  }

  if (distance <= LESSON_ENEMY_AGGRO_RANGE) {
    const moved = moveToward(enemy, player, (safeElapsed / 1000) * 8)
    return { enemy: { ...enemy, ...moved, mode: 'chase' as const, frame, attackCooldownMs: cooldown, windupMs: 0 }, playerDamage: 0 }
  }

  const patrolTarget = { x: enemy.homeX + Math.cos(patrolPhase + enemy.id) * 6, y: enemy.homeY + Math.sin(patrolPhase + enemy.id) * 4 }
  const moved = moveToward(enemy, patrolTarget, (safeElapsed / 1000) * 2.2)
  return { enemy: { ...enemy, ...moved, mode: 'patrol' as const, frame: frame % 9, attackCooldownMs: cooldown, windupMs: 0 }, playerDamage: 0 }
}

export type LessonBossMode = 'walk' | 'attack'
export type LessonBossStep = { x: number; y: number; mode: LessonBossMode; direction: WalkDirection }

const LESSON_BOSS_ATTACK_RELEASE_MARGIN = 3

export function stepLessonBoss(
  boss: CharacterPosition,
  player: CharacterPosition,
  elapsedMs: number,
  attackRange: number,
  currentMode: LessonBossMode = 'walk',
  chaseSpeed = 14,
): LessonBossStep {
  const dx = player.x - boss.x
  const dy = player.y - boss.y
  const distance = Math.hypot(dx, dy)
  const direction = directionToward(dx, dy)
  const releaseRange = attackRange + LESSON_BOSS_ATTACK_RELEASE_MARGIN
  const staysInAttack = currentMode === 'attack' && distance <= releaseRange
  if (distance <= attackRange || staysInAttack) return { x: boss.x, y: boss.y, mode: 'attack', direction }
  const safeElapsed = Math.min(100, Math.max(0, elapsedMs))
  const step = Math.min(distance, (safeElapsed / 1000) * chaseSpeed)
  const ratio = step / (distance || 1)
  return {
    x: Math.min(92, Math.max(8, boss.x + dx * ratio)),
    y: Math.min(84, Math.max(20, boss.y + dy * ratio)),
    mode: 'walk',
    direction,
  }
}

export function selectEnemyInAttackRange(enemies: LessonEnemy[], player: CharacterPosition, range = LESSON_PLAYER_ATTACK_RANGE) {
  let selected: LessonEnemy | null = null
  let selectedDistance = Infinity
  for (const enemy of enemies) {
    if (enemy.hp <= 0 || enemy.mode === 'dead') continue
    const distance = Math.hypot(enemy.x - player.x, enemy.y - player.y)
    if (distance <= range && distance < selectedDistance) {
      selected = enemy
      selectedDistance = distance
    }
  }
  return selected
}
