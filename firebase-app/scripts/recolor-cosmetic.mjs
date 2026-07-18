// Generates "tier" recolors of the existing hat/weapon/accessory shop items
// via HSL hue/saturation/lightness remapping — a standard palette-swap
// technique (WoW transmog dyes, Diablo item tints) that produces genuinely
// distinct, professionally-shaded new items without new hand-drawn art.
//
// Usage: node scripts/recolor-cosmetic.mjs
// Regenerates every `${baseId}-${tier.id}.png` (+ icon, + `-bg` for weapons)
// for the hat/weapon/accessory catalog bases listed in CATEGORY_BASE_IDS.
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { decodePng, encodePng } from './compose-character-sheet.mjs'

const ASSET_DIR = join('src', 'assets', 'character')
const ICON_DIR = join(ASSET_DIR, 'icons')
const ICON_SIZE = 96
const ICON_SOURCE_CELL = { col: 0, row: 10 } // walk-down idle frame, matches the hand-authored icons

// Ten equipment tiers, ordered common -> legendary. `hue` is an absolute
// target hue (0-360) the recolor snaps every non-gray pixel to; `satMult`/
// `lightMult` scale the pixel's own saturation/lightness so shading detail
// (highlights, shadows, steel-gray metal parts) survives the recolor.
export const TIER_PALETTE = [
  { id: 'bronze', name: 'บรอนซ์', hue: 28, satMult: 1.05, lightMult: 0.88, priceBonus: 50, flavor: 'ประกายบรอนซ์คลาสสิก' },
  { id: 'iron', name: 'เหล็กกล้า', hue: 210, satMult: 0.22, lightMult: 0.8, priceBonus: 80, flavor: 'แข็งแกร่งดุจเหล็กกล้า' },
  { id: 'silver', name: 'เงิน', hue: 210, satMult: 0.08, lightMult: 1.2, priceBonus: 120, flavor: 'เงางามสไตล์นักรบเงิน' },
  { id: 'gold', name: 'ทองคำ', hue: 45, satMult: 1.1, lightMult: 1.05, priceBonus: 180, flavor: 'หรูหราด้วยประกายทองคำ' },
  { id: 'sapphire', name: 'แซฟไฟร์', hue: 212, satMult: 1.15, lightMult: 0.92, priceBonus: 220, flavor: 'ประดับพลอยแซฟไฟร์สีน้ำเงินลึก' },
  { id: 'emerald', name: 'มรกต', hue: 142, satMult: 1.1, lightMult: 0.9, priceBonus: 220, flavor: 'อัญมณีมรกตสดใส' },
  { id: 'ruby', name: 'ทับทิม', hue: 350, satMult: 1.15, lightMult: 0.85, priceBonus: 260, flavor: 'ทับทิมแดงเข้มทรงพลัง' },
  { id: 'amethyst', name: 'อเมทิสต์', hue: 272, satMult: 1.0, lightMult: 0.92, priceBonus: 260, flavor: 'อเมทิสต์ม่วงลึกลับ' },
  { id: 'obsidian', name: 'ออบซิเดียน', hue: 262, satMult: 0.4, lightMult: 0.4, priceBonus: 300, flavor: 'หินออบซิเดียนดำสนิท' },
  { id: 'radiant', name: 'รังสีทอง', hue: 48, satMult: 0.55, lightMult: 1.3, priceBonus: 350, flavor: 'เปล่งประกายรังสีทองระยิบระยับ' },
]

// Every base item gets exactly 2 of the 10 tiers (round-robin), so 5 base
// items -> 10 new catalog entries per category with every tier used once.
export function assignTiers(baseIds) {
  return baseIds.flatMap((baseId, index) => [
    { baseId, tier: TIER_PALETTE[(index * 2) % TIER_PALETTE.length] },
    { baseId, tier: TIER_PALETTE[(index * 2 + 1) % TIER_PALETTE.length] },
  ])
}

export function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b); const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return [h * 60, s, l]
}

function hueToRgbChannel(p, q, t) {
  if (t < 0) t += 1
  if (t > 1) t -= 1
  if (t < 1 / 6) return p + (q - p) * 6 * t
  if (t < 1 / 2) return q
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
  return p
}

export function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360
  if (s === 0) {
    const v = Math.round(l * 255)
    return [v, v, v]
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  return [
    Math.round(hueToRgbChannel(p, q, h + 1 / 3) * 255),
    Math.round(hueToRgbChannel(p, q, h) * 255),
    Math.round(hueToRgbChannel(p, q, h - 1 / 3) * 255),
  ]
}

const clamp01 = (value) => Math.min(1, Math.max(0, value))

export function recolorImage(img, { hue, satMult, lightMult }) {
  const pixels = Buffer.alloc(img.pixels.length)
  for (let i = 0; i < img.pixels.length; i += 4) {
    const alpha = img.pixels[i + 3]
    if (alpha === 0) {
      pixels[i] = img.pixels[i]; pixels[i + 1] = img.pixels[i + 1]; pixels[i + 2] = img.pixels[i + 2]; pixels[i + 3] = 0
      continue
    }
    const [, s, l] = rgbToHsl(img.pixels[i], img.pixels[i + 1], img.pixels[i + 2])
    const [r2, g2, b2] = hslToRgb(hue, clamp01(s * satMult), clamp01(l * lightMult))
    pixels[i] = r2; pixels[i + 1] = g2; pixels[i + 2] = b2; pixels[i + 3] = alpha
  }
  return { width: img.width, height: img.height, pixels }
}

function cropIcon(sheet, cell = 64) {
  const crop = Buffer.alloc(cell * cell * 4)
  for (let y = 0; y < cell; y++) {
    const srcOff = ((ICON_SOURCE_CELL.row * cell + y) * sheet.width + ICON_SOURCE_CELL.col * cell) * 4
    sheet.pixels.copy(crop, y * cell * 4, srcOff, srcOff + cell * 4)
  }
  const scale = ICON_SIZE / cell
  const up = Buffer.alloc(ICON_SIZE * ICON_SIZE * 4)
  for (let y = 0; y < ICON_SIZE; y++) {
    const sy = Math.floor(y / scale)
    for (let x = 0; x < ICON_SIZE; x++) {
      const sx = Math.floor(x / scale)
      const srcOff = (sy * cell + sx) * 4
      const dstOff = (y * ICON_SIZE + x) * 4
      crop.copy(up, dstOff, srcOff, srcOff + 4)
    }
  }
  return { width: ICON_SIZE, height: ICON_SIZE, pixels: up }
}

// [category prefix, base ids in catalog order] — the round-robin tier
// assignment walks this order, so keep it stable once shipped.
const CATEGORIES = [
  { prefix: 'hat', baseIds: ['hat-bandana', 'hat-feather', 'hat-wizard', 'hat-helmet', 'hat-crown'], hasBehindLayer: false },
  { prefix: 'weapon', baseIds: ['weapon-dagger', 'weapon-saber', 'weapon-mace', 'weapon-longsword', 'weapon-waraxe'], hasBehindLayer: true },
  { prefix: 'acc', baseIds: ['acc-scarf', 'acc-cravat', 'acc-necklace', 'acc-plumage', 'acc-gemnecklace'], hasBehindLayer: false },
]

export function generateVariants() {
  const generated = []
  for (const category of CATEGORIES) {
    for (const { baseId, tier } of assignTiers(category.baseIds)) {
      const variantId = `${baseId}-${tier.id}`
      const sourcePath = join(ASSET_DIR, `${baseId}.png`)
      if (!existsSync(sourcePath)) throw new Error(`Missing base layer: ${sourcePath}`)
      const sheet = decodePng(sourcePath)
      const recolored = recolorImage(sheet, tier)
      encodePng(join(ASSET_DIR, `${variantId}.png`), recolored)

      const iconPath = join(ICON_DIR, `${baseId}.png`)
      const icon = existsSync(iconPath) ? recolorImage(decodePng(iconPath), tier) : cropIcon(recolored)
      encodePng(join(ICON_DIR, `${variantId}.png`), icon)

      if (category.hasBehindLayer) {
        const behindPath = join(ASSET_DIR, `${baseId}-bg.png`)
        if (existsSync(behindPath)) {
          encodePng(join(ASSET_DIR, `${variantId}-bg.png`), recolorImage(decodePng(behindPath), tier))
        }
      }
      generated.push({ baseId, variantId, tier })
    }
  }
  return generated
}

const invokedDirectly = process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href
if (invokedDirectly) {
  const generated = generateVariants()
  for (const item of generated) console.log(`Generated ${item.variantId}.png (${item.tier.name})`)
  console.log(`\n${generated.length} tier variants generated across ${CATEGORIES.length} categories.`)
}
