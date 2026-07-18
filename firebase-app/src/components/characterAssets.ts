import { COSMETIC_DEFAULTS, cosmeticsState, type CosmeticSlot } from '../services/gameLogic'
import baseHero from '../assets/character/base-hero.png'
import studentMale from '../assets/character/student-male.png'
import studentFemale from '../assets/character/student-female.png'

// LPC paper-doll sheets composed onto the exact grid of the original
// test-character-spritesheet.png (walk rows 8-11; attack = the middle cell of
// each oversized-slash frame). Every layer therefore shares one background-size
// and background-position, so a full outfit renders as a single stacked-
// background div. Art: Universal LPC Spritesheet Generator (CC-BY-SA 3.0 /
// GPL 3.0) — see src/assets/character/CREDITS.md.
export const CHARACTER_BASE_LAYER: string = baseHero

// Gendered student bases picked at registration (composed onto the same grid
// by scripts/compose-character-sheet.mjs, uniform + hair baked in). Users from
// before the gender choice keep the legacy hero base.
export const GENDER_BASE_LAYERS: Record<'male' | 'female', string> = {
  male: studentMale,
  female: studentFemale,
}

export function characterBaseLayer(gender?: unknown): string {
  return gender === 'male' || gender === 'female' ? GENDER_BASE_LAYERS[gender] : CHARACTER_BASE_LAYER
}

// Every hair/outfit/hat/weapon/accessory layer — plus its 96px shop icon and
// the "-bg" behind-slice a weapon may ship — is discovered by filename rather
// than hand-listed, so a new tier recolor dropped in by
// scripts/recolor-cosmetic.mjs (or a future asset) needs zero code changes
// here; only the id has to exist in gameLogic.COSMETIC_CATALOG to be sellable.
const layerModules = import.meta.glob('../assets/character/*.png', { eager: true, import: 'default' }) as Record<string, string>
const iconModules = import.meta.glob('../assets/character/icons/*.png', { eager: true, import: 'default' }) as Record<string, string>

const idFromPath = (path: string) => path.split('/').pop()!.replace(/\.png$/, '')

// The three base-body sheets live in the same folder but aren't cosmetics.
const BASE_LAYER_IDS = new Set(['base-hero', 'student-male', 'student-female'])

const cosmeticLayers: Record<string, string> = {}
const weaponBehindLayers: Record<string, string> = {}
for (const [path, url] of Object.entries(layerModules)) {
  const id = idFromPath(path)
  if (BASE_LAYER_IDS.has(id)) continue
  if (id.endsWith('-bg')) weaponBehindLayers[id.slice(0, -'-bg'.length)] = url
  else cosmeticLayers[id] = url
}

export const COSMETIC_LAYERS: Record<string, string> = cosmeticLayers

export const COSMETIC_ICONS: Record<string, string> = Object.fromEntries(
  Object.entries(iconModules).map(([path, url]) => [idFromPath(path), url]),
)

// LPC weapons come in two z-slices: the in-front slice and a "behind" slice for
// the pixels hidden behind the body when facing up/sideways.
export const WEAPON_BEHIND_LAYERS: Record<string, string> = weaponBehindLayers

// CSS multi-background draw order: FIRST url paints on TOP. Plumage sits above
// hats, weapons above everything, base body underneath it all, and the weapon's
// behind-slice underneath even the body.
const LAYER_ORDER: CosmeticSlot[] = ['weapon', 'accessory', 'hat', 'hair', 'outfit']

export function characterLayerImages(rawInventory: unknown, gender?: unknown): string {
  const { equipped } = cosmeticsState(rawInventory, gender)
  const urls: string[] = []
  for (const slot of LAYER_ORDER) {
    const itemId = equipped[slot]
    if (itemId && COSMETIC_LAYERS[itemId]) urls.push(`url(${COSMETIC_LAYERS[itemId]})`)
  }
  urls.push(`url(${characterBaseLayer(gender)})`)
  if (equipped.weapon && WEAPON_BEHIND_LAYERS[equipped.weapon]) urls.push(`url(${WEAPON_BEHIND_LAYERS[equipped.weapon]})`)
  return urls.join(', ')
}

// The default look (starter hair + outfit on the base body, or the baked
// school look for gendered students) for logged-out or inventory-less renders.
export function defaultCharacterLayerImages(gender?: unknown): string {
  return characterLayerImages({}, gender)
}

export { COSMETIC_DEFAULTS }
