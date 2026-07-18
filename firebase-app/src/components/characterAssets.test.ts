import { describe, expect, it } from 'vitest'
import { COSMETIC_CATALOG } from '../services/gameLogic'
import {
  CHARACTER_BASE_LAYER,
  COSMETIC_ICONS,
  COSMETIC_LAYERS,
  GENDER_BASE_LAYERS,
  WEAPON_BEHIND_LAYERS,
  characterBaseLayer,
  characterLayerImages,
} from './characterAssets'

describe('characterBaseLayer', () => {
  it('picks the gendered student sheet and falls back to the legacy hero', () => {
    expect(characterBaseLayer('male')).toBe(GENDER_BASE_LAYERS.male)
    expect(characterBaseLayer('female')).toBe(GENDER_BASE_LAYERS.female)
    expect(characterBaseLayer(undefined)).toBe(CHARACTER_BASE_LAYER)
    expect(characterBaseLayer('')).toBe(CHARACTER_BASE_LAYER)
    expect(characterBaseLayer('hacker')).toBe(CHARACTER_BASE_LAYER)
    expect(GENDER_BASE_LAYERS.male).not.toBe(GENDER_BASE_LAYERS.female)
  })
})

describe('characterLayerImages', () => {
  it('keeps the legacy default look for users without a gender', () => {
    const layers = characterLayerImages({})
    expect(layers).toContain(`url(${CHARACTER_BASE_LAYER})`)
    expect(layers).toContain(`url(${COSMETIC_LAYERS['hair-bangs']})`)
    expect(layers).toContain(`url(${COSMETIC_LAYERS['outfit-tshirt']})`)
  })

  it('renders gendered students on their own base without the starter gear', () => {
    const layers = characterLayerImages({}, 'male')
    expect(layers).toBe(`url(${GENDER_BASE_LAYERS.male})`)
    expect(characterLayerImages({}, 'female')).toBe(`url(${GENDER_BASE_LAYERS.female})`)
  })

  it('stacks explicitly equipped cosmetics above a gendered base', () => {
    const inventory = {
      cosmetics: {
        owned: ['hat-feather'],
        equipped: { hat: 'hat-feather' },
      },
    }
    const layers = characterLayerImages(inventory, 'female')
    expect(layers).toBe(`url(${COSMETIC_LAYERS['hat-feather']}), url(${GENDER_BASE_LAYERS.female})`)
  })
})

describe('catalog asset integrity', () => {
  it('resolves a real layer image and a real shop icon for every catalog id (glob-discovered, no manual import can go stale)', () => {
    for (const id of Object.keys(COSMETIC_CATALOG)) {
      expect(COSMETIC_LAYERS[id], `missing layer for ${id}`).toBeTruthy()
      expect(COSMETIC_ICONS[id], `missing icon for ${id}`).toBeTruthy()
    }
  })

  it('gives every weapon catalog item a behind-the-body slice', () => {
    for (const item of Object.values(COSMETIC_CATALOG)) {
      if (item.slot !== 'weapon') continue
      expect(WEAPON_BEHIND_LAYERS[item.id], `missing -bg layer for ${item.id}`).toBeTruthy()
    }
  })
})
