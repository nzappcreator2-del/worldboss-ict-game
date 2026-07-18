import type { CharacterPosition } from './dashboardCharacter'

// MMORPG-style auto-battle brain for the lesson adventure. Pure decision
// logic only: the component (LessonPage) feeds a snapshot of the run each
// tick and executes whatever single action comes back through its existing
// handlers (attackActionRef / skillActionRef / potionActionRef / movement),
// so auto mode can never do anything a player couldn't do by hand.

export const AUTO_POTION_HP_PERCENT = 40
export const AUTO_ATTACK_COOLDOWN_MS = 600
// 16ms = the same 60Hz cadence as manual held-move/chase stepping. The first
// version ticked at 50ms and auto-walking visibly stuttered (20fps position
// updates) compared to walking by hand; per-tick work is tiny, so decisions
// simply run at the movement rate and attacks stay paced by the cooldown.
export const AUTO_TICK_MS = 16
export const AUTO_MOVE_SPEED = 18

export type AutoBattleTarget = { id: number; hp: number; x: number; y: number }
export type AutoBattleDropTarget = { id: number; x: number; y: number }

export type AutoBattleContext = {
  zone: 1 | 2 | 3
  bossPhase: string
  playerDead: boolean
  paused: boolean
  uiBlocked: boolean
  /** Player is actively steering (held key / joystick / click-chase): auto keeps healing but yields movement. */
  manualControl: boolean
  player: CharacterPosition
  playerHp: number
  playerMaxHp: number
  potions: number
  sp: number
  skillSpCost: number
  /** Attack cooldown elapsed (paced so auto swings like a human, not per tick). */
  attackReady: boolean
  enemies: readonly AutoBattleTarget[]
  bossPosition: CharacterPosition
  /** Walk-up (contact) distance before swinging — chest to chest, not sword-tip reach. */
  engageRange: number
  bossEngageRange: number
  /** Uncollected ground drops; the bot loot-runs to them once nothing is left to fight. */
  drops: readonly AutoBattleDropTarget[]
  /** Radius the world tick already auto-collects from (no need to walk inside it). */
  pickupRange: number
}

export type AutoBattleDecision =
  | { action: 'idle' }
  | { action: 'potion' }
  | { action: 'attack' }
  | { action: 'skill' }
  | { action: 'boss-attack' }
  | { action: 'move'; target: CharacterPosition }

const distanceBetween = (a: CharacterPosition, b: CharacterPosition) => Math.hypot(b.x - a.x, b.y - a.y)

export function nearestLivingEnemy(
  enemies: readonly AutoBattleTarget[],
  player: CharacterPosition,
): AutoBattleTarget | null {
  let best: AutoBattleTarget | null = null
  let bestDistance = Infinity
  for (const enemy of enemies) {
    if (enemy.hp <= 0) continue
    const distance = distanceBetween(player, enemy)
    if (distance < bestDistance) {
      best = enemy
      bestDistance = distance
    }
  }
  return best
}

export function decideAutoBattle(context: AutoBattleContext): AutoBattleDecision {
  if (context.playerDead || context.paused || context.uiBlocked) return { action: 'idle' }

  // Survival first: quaff a potion under the HP threshold — but only when a
  // potion actually exists in the bag ("ยาหมดก็ไม่ต้องเติม").
  const hpPercent = context.playerMaxHp > 0 ? (context.playerHp / context.playerMaxHp) * 100 : 0
  if (context.playerHp > 0 && hpPercent < AUTO_POTION_HP_PERCENT && context.potions > 0) {
    return { action: 'potion' }
  }

  if (context.zone === 3) {
    // Boss quiz/result phases are the player's job; auto only fights the
    // skirmish and never auto-starts the encounter.
    if (context.bossPhase !== 'skirmish') return { action: 'idle' }
    const bossDistance = distanceBetween(context.player, context.bossPosition)
    if (bossDistance <= context.bossEngageRange) {
      return context.attackReady ? { action: 'boss-attack' } : { action: 'idle' }
    }
    if (context.manualControl) return { action: 'idle' }
    return { action: 'move', target: context.bossPosition }
  }

  const target = nearestLivingEnemy(context.enemies, context.player)
  if (target) {
    // Close to CONTACT before swinging (melee heroes fight chest to chest);
    // kills then drop their loot inside the auto-pickup radius.
    const targetDistance = distanceBetween(context.player, target)
    if (targetDistance <= context.engageRange) {
      if (!context.attackReady) return { action: 'idle' }
      return context.sp >= context.skillSpCost ? { action: 'skill' } : { action: 'attack' }
    }
    if (context.manualControl) return { action: 'idle' }
    return { action: 'move', target: { x: target.x, y: target.y } }
  }

  // Nothing left to fight: loot-run to any drop the world tick can't already
  // reach (drops normally land at the player's feet, but a monster that died
  // mid-chase can leave loot behind).
  let looseDrop: AutoBattleDropTarget | null = null
  let looseDistance = Infinity
  for (const drop of context.drops) {
    const dropDistance = distanceBetween(context.player, drop)
    if (dropDistance > context.pickupRange && dropDistance < looseDistance) {
      looseDrop = drop
      looseDistance = dropDistance
    }
  }
  if (looseDrop && !context.manualControl) return { action: 'move', target: { x: looseDrop.x, y: looseDrop.y } }
  return { action: 'idle' }
}
