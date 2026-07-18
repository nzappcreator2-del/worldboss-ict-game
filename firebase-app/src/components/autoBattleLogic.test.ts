import { describe, expect, it } from 'vitest'
import {
  AUTO_POTION_HP_PERCENT,
  decideAutoBattle,
  nearestLivingEnemy,
  type AutoBattleContext,
} from './autoBattleLogic'

const baseContext = (overrides: Partial<AutoBattleContext> = {}): AutoBattleContext => ({
  zone: 1,
  bossPhase: 'idle',
  playerDead: false,
  paused: false,
  uiBlocked: false,
  manualControl: false,
  player: { x: 50, y: 50 },
  playerHp: 90,
  playerMaxHp: 100,
  potions: 2,
  sp: 100,
  skillSpCost: 25,
  attackReady: true,
  enemies: [],
  bossPosition: { x: 50, y: 43 },
  engageRange: 2.6,
  bossEngageRange: 4.5,
  drops: [],
  pickupRange: 6,
  ...overrides,
})

describe('nearestLivingEnemy', () => {
  it('picks the closest enemy that is still alive', () => {
    const target = nearestLivingEnemy([
      { id: 1, hp: 0, x: 51, y: 50 },
      { id: 2, hp: 10, x: 70, y: 50 },
      { id: 3, hp: 10, x: 58, y: 50 },
    ], { x: 50, y: 50 })
    expect(target?.id).toBe(3)
  })

  it('returns null when everything is dead', () => {
    expect(nearestLivingEnemy([{ id: 1, hp: 0, x: 51, y: 50 }], { x: 50, y: 50 })).toBeNull()
  })
})

describe('decideAutoBattle (field zones)', () => {
  it('stays idle while dead, paused, or blocked by an open panel', () => {
    expect(decideAutoBattle(baseContext({ playerDead: true })).action).toBe('idle')
    expect(decideAutoBattle(baseContext({ paused: true })).action).toBe('idle')
    expect(decideAutoBattle(baseContext({ uiBlocked: true })).action).toBe('idle')
  })

  it('drinks a potion below the HP threshold but only when one is in the bag', () => {
    const hurt = { playerHp: AUTO_POTION_HP_PERCENT - 5, playerMaxHp: 100 }
    expect(decideAutoBattle(baseContext({ ...hurt, potions: 1 })).action).toBe('potion')
    expect(decideAutoBattle(baseContext({ ...hurt, potions: 0 })).action).not.toBe('potion')
  })

  it('keeps walking until it stands at contact distance, even inside sword reach', () => {
    // 5 units away = still outside the 2.6 engage ring → close in, never poke from afar.
    const decision = decideAutoBattle(baseContext({
      enemies: [{ id: 7, hp: 12, x: 55, y: 50 }],
    }))
    expect(decision).toEqual({ action: 'move', target: { x: 55, y: 50 } })
  })

  it('attacks only at contact distance, preferring the heavy skill while SP lasts', () => {
    const enemies = [{ id: 7, hp: 12, x: 52, y: 51 }]
    expect(decideAutoBattle(baseContext({ enemies, sp: 100 })).action).toBe('skill')
    expect(decideAutoBattle(baseContext({ enemies, sp: 10 })).action).toBe('attack')
  })

  it('respects the attack cooldown and waits without spamming', () => {
    const enemies = [{ id: 7, hp: 12, x: 52, y: 51 }]
    expect(decideAutoBattle(baseContext({ enemies, attackReady: false })).action).toBe('idle')
  })

  it('yields movement to the player but keeps auto-healing during manual control', () => {
    const farEnemy = [{ id: 7, hp: 12, x: 80, y: 60 }]
    expect(decideAutoBattle(baseContext({ enemies: farEnemy, manualControl: true })).action).toBe('idle')
    expect(decideAutoBattle(baseContext({
      enemies: farEnemy, manualControl: true, playerHp: 20, potions: 1,
    })).action).toBe('potion')
  })

  it('loot-runs to leftover drops once nothing is alive, skipping drops already at its feet', () => {
    const cleared = { enemies: [{ id: 1, hp: 0, x: 51, y: 50 }] }
    expect(decideAutoBattle(baseContext({
      ...cleared,
      drops: [{ id: 9, x: 70, y: 50 }, { id: 10, x: 60, y: 50 }],
    }))).toEqual({ action: 'move', target: { x: 60, y: 50 } })

    expect(decideAutoBattle(baseContext({
      ...cleared,
      drops: [{ id: 9, x: 52, y: 50 }],
    })).action).toBe('idle')

    expect(decideAutoBattle(baseContext({
      ...cleared,
      manualControl: true,
      drops: [{ id: 9, x: 70, y: 50 }],
    })).action).toBe('idle')
  })

  it('idles when no monsters are alive and no loot is left', () => {
    expect(decideAutoBattle(baseContext({ enemies: [{ id: 1, hp: 0, x: 51, y: 50 }] })).action).toBe('idle')
  })
})

describe('decideAutoBattle (boss zone)', () => {
  it('never auto-starts the boss and pauses during question and result phases', () => {
    for (const bossPhase of ['idle', 'loading', 'question', 'result', 'error']) {
      expect(decideAutoBattle(baseContext({ zone: 3, bossPhase })).action).toBe('idle')
    }
  })

  it('closes to hugging distance during the skirmish, then attacks', () => {
    const far = decideAutoBattle(baseContext({
      zone: 3, bossPhase: 'skirmish', bossPosition: { x: 50, y: 20 },
    }))
    expect(far).toEqual({ action: 'move', target: { x: 50, y: 20 } })

    // 6 units away = inside the old sword-sniping range but outside engage → keep walking.
    const near = decideAutoBattle(baseContext({
      zone: 3, bossPhase: 'skirmish', bossPosition: { x: 50, y: 44 }, player: { x: 50, y: 50 },
    }))
    expect(near.action).toBe('move')

    const contact = decideAutoBattle(baseContext({
      zone: 3, bossPhase: 'skirmish', bossPosition: { x: 50, y: 46 }, player: { x: 50, y: 50 },
    }))
    expect(contact.action).toBe('boss-attack')
  })

  it('still heals first during the boss skirmish', () => {
    const decision = decideAutoBattle(baseContext({
      zone: 3, bossPhase: 'skirmish', playerHp: 30, playerMaxHp: 100, potions: 1,
    }))
    expect(decision.action).toBe('potion')
  })
})
