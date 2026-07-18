import { describe, expect, it } from 'vitest'
import {
  TIER_PALETTE,
  assignTiers,
  hslToRgb,
  recolorImage,
  rgbToHsl,
} from './recolor-cosmetic.mjs'

describe('rgbToHsl / hslToRgb round trip', () => {
  it('round-trips primary and gray colors within rounding error', () => {
    for (const [r, g, b] of [[255, 0, 0], [0, 255, 0], [0, 0, 255], [128, 128, 128], [255, 255, 255], [0, 0, 0]]) {
      const [h, s, l] = rgbToHsl(r, g, b)
      const [r2, g2, b2] = hslToRgb(h, s, l)
      expect(Math.abs(r2 - r)).toBeLessThanOrEqual(1)
      expect(Math.abs(g2 - g)).toBeLessThanOrEqual(1)
      expect(Math.abs(b2 - b)).toBeLessThanOrEqual(1)
    }
  })
})

describe('recolorImage', () => {
  const cell = (r: number, g: number, b: number, a = 255) => ({ width: 1, height: 1, pixels: Buffer.from([r, g, b, a]) })

  it('leaves fully transparent pixels untouched', () => {
    const img = cell(10, 20, 30, 0)
    const out = recolorImage(img, { hue: 200, satMult: 1, lightMult: 1 })
    expect([...out.pixels]).toEqual([10, 20, 30, 0])
  })

  it('never mutates the source pixel buffer', () => {
    const img = cell(200, 30, 30, 255)
    const original = [...img.pixels]
    recolorImage(img, { hue: 200, satMult: 1, lightMult: 1 })
    expect([...img.pixels]).toEqual(original)
  })

  it('keeps a fully desaturated (gray) pixel gray regardless of target hue', () => {
    const img = cell(128, 128, 128, 255)
    const out = recolorImage(img, { hue: 30, satMult: 1, lightMult: 1 })
    expect(out.pixels[0]).toBe(out.pixels[1])
    expect(out.pixels[1]).toBe(out.pixels[2])
  })

  it('preserves alpha exactly while recoloring an opaque saturated pixel', () => {
    const img = cell(220, 40, 40, 180)
    const out = recolorImage(img, { hue: 210, satMult: 1, lightMult: 1 })
    expect(out.pixels[3]).toBe(180)
    const [h] = rgbToHsl(out.pixels[0], out.pixels[1], out.pixels[2])
    expect(Math.round(h)).toBeGreaterThanOrEqual(205)
    expect(Math.round(h)).toBeLessThanOrEqual(215)
  })

  it('scales saturation and lightness relative to the source pixel', () => {
    const bright = cell(230, 60, 60, 255)
    const dim = cell(120, 30, 30, 255)
    const outBright = recolorImage(bright, { hue: 40, satMult: 1, lightMult: 1 })
    const outDim = recolorImage(dim, { hue: 40, satMult: 1, lightMult: 1 })
    const [, , lBright] = rgbToHsl(outBright.pixels[0], outBright.pixels[1], outBright.pixels[2])
    const [, , lDim] = rgbToHsl(outDim.pixels[0], outDim.pixels[1], outDim.pixels[2])
    // Shading detail (highlight vs shadow) must survive the recolor.
    expect(lBright).toBeGreaterThan(lDim)
  })
})

describe('TIER_PALETTE', () => {
  it('ships exactly 10 distinct, Thai-named tiers all priced within the coin delta cap', () => {
    expect(TIER_PALETTE).toHaveLength(10)
    const ids = new Set(TIER_PALETTE.map((tier) => tier.id))
    expect(ids.size).toBe(10)
    for (const tier of TIER_PALETTE) {
      expect(tier.name.length).toBeGreaterThan(0)
      expect(tier.priceBonus).toBeGreaterThanOrEqual(0)
      expect(tier.priceBonus).toBeLessThanOrEqual(950)
    }
  })
})

describe('assignTiers', () => {
  it('gives each of 5 base items exactly 2 tiers, covering all 10 tiers exactly once', () => {
    const baseIds = ['a', 'b', 'c', 'd', 'e']
    const assignments = assignTiers(baseIds)
    expect(assignments).toHaveLength(10)
    for (const baseId of baseIds) {
      expect(assignments.filter((item) => item.baseId === baseId)).toHaveLength(2)
    }
    const usedTierIds = assignments.map((item) => item.tier.id)
    expect(new Set(usedTierIds).size).toBe(10)
  })

  it('is deterministic across calls', () => {
    const baseIds = ['x', 'y', 'z', 'w', 'v']
    expect(assignTiers(baseIds)).toEqual(assignTiers(baseIds))
  })
})
