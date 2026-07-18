import type { LootKind } from './lessonWorldLogic'
import chestClosed from '../assets/ui/chest-closed.png'
import chestLegendary from '../assets/ui/chest-legendary.png'
import chestOpen from '../assets/ui/chest-open.png'
import iconFireball from '../assets/ui/icon-fireball.png'
import itemCoins from '../assets/ui/item-coins.png'
import itemCrown from '../assets/ui/item-crown.png'
import itemKey from '../assets/ui/item-key.png'
import itemMap from '../assets/ui/item-map.png'
import itemPotionRed from '../assets/ui/item-potion-red.png'
import itemRune from '../assets/ui/item-rune.png'
import itemScroll from '../assets/ui/item-scroll.png'
import itemSword from '../assets/ui/item-sword.png'
import swordRoundButton from '../assets/ui/ui-btn-sword-round.png'
import badgeHp from '../assets/ui/badge-hp.png'
import badgeSp from '../assets/ui/badge-sp.png'
import badgeXp from '../assets/ui/badge-xp.png'

// Painted RPG icon set cropped from the 2D/ asset sheets (see 2D/UI, 2D/item-drop,
// 2D/treasure chest). Pure presentation: LOOT_INFO in lessonWorldLogic stays the
// gameplay source of truth; these only map each kind to its drop/bag artwork.
export const LESSON_LOOT_IMAGES: Record<LootKind, string> = {
  coin: itemCoins,
  potion: itemPotionRed,
  card: itemRune,
}

export const LESSON_HOTBAR_IMAGES = {
  attack: swordRoundButton,
  skill: iconFireball,
  potion: itemPotionRed,
  card: itemRune,
} as const

export const LESSON_STAT_IMAGES = {
  attack: itemSword,
  coin: itemCoins,
} as const

export const LESSON_CHEST_IMAGES = {
  closed: chestClosed,
  open: chestOpen,
  legendary: chestLegendary,
} as const

export const LESSON_SCROLL_IMAGE = itemScroll

// Painted roundel badges for the HP/SP/XP status bars, placed next to the
// existing bar (which keeps its exact CSS percentage-width fill logic
// untouched) rather than replacing the bar's own background — a full painted
// "mostly-full" bar image behind a thin accurate fill would visually lie
// about the real HP/SP/XP percentage at low values.
export const LESSON_BAR_BADGE_IMAGES = {
  hp: badgeHp,
  sp: badgeSp,
  xp: badgeXp,
} as const

// Small icon replacements for a few fixed (non-admin-configurable) emoji
// glyphs in the adventure map — lesson.icon itself stays admin-editable text.
export const LESSON_MAP_ICON_IMAGES = {
  locked: itemKey,
  reward: itemCrown,
} as const

export const LESSON_DEATH_PANEL_IMAGES = {
  map: itemMap,
} as const
