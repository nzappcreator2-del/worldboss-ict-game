import { describe, expect, it } from 'vitest'
import { LOOT_INFO, type LootKind } from './lessonWorldLogic'
import {
  LESSON_BAR_BADGE_IMAGES,
  LESSON_CHEST_IMAGES,
  LESSON_DEATH_PANEL_IMAGES,
  LESSON_HOTBAR_IMAGES,
  LESSON_LOOT_IMAGES,
  LESSON_MAP_ICON_IMAGES,
  LESSON_SCROLL_IMAGE,
} from './lessonUiAssets'

describe('lessonUiAssets', () => {
  it('maps every loot kind to a bundled image', () => {
    for (const kind of Object.keys(LOOT_INFO) as LootKind[]) {
      expect(LESSON_LOOT_IMAGES[kind], `missing loot image for ${kind}`).toBeTruthy()
      expect(typeof LESSON_LOOT_IMAGES[kind]).toBe('string')
    }
  })

  it('provides hotbar action icons for attack, skill, potion and card', () => {
    expect(LESSON_HOTBAR_IMAGES.attack).toBeTruthy()
    expect(LESSON_HOTBAR_IMAGES.skill).toBeTruthy()
    expect(LESSON_HOTBAR_IMAGES.potion).toBeTruthy()
    expect(LESSON_HOTBAR_IMAGES.card).toBeTruthy()
  })

  it('provides treasure chest art for the bag button and boss reward', () => {
    expect(LESSON_CHEST_IMAGES.closed).toBeTruthy()
    expect(LESSON_CHEST_IMAGES.open).toBeTruthy()
    expect(LESSON_CHEST_IMAGES.legendary).toBeTruthy()
    expect(LESSON_SCROLL_IMAGE).toBeTruthy()
  })

  it('keeps hotbar potion/card icons consistent with the loot drop icons', () => {
    expect(LESSON_HOTBAR_IMAGES.potion).toBe(LESSON_LOOT_IMAGES.potion)
    expect(LESSON_HOTBAR_IMAGES.card).toBe(LESSON_LOOT_IMAGES.card)
  })

  it('provides a painted badge for every status bar', () => {
    expect(LESSON_BAR_BADGE_IMAGES.hp).toBeTruthy()
    expect(LESSON_BAR_BADGE_IMAGES.sp).toBeTruthy()
    expect(LESSON_BAR_BADGE_IMAGES.xp).toBeTruthy()
  })

  it('provides the locked-node and reward-tag map icons', () => {
    expect(LESSON_MAP_ICON_IMAGES.locked).toBeTruthy()
    expect(LESSON_MAP_ICON_IMAGES.reward).toBeTruthy()
  })

  it('provides the death-panel leave-map icon', () => {
    expect(LESSON_DEATH_PANEL_IMAGES.map).toBeTruthy()
  })
})
