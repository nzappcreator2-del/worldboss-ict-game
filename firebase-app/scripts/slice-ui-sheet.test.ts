import { describe, expect, it } from 'vitest'
import { buildContactSheet, cropRegion, detectRegions, gridRegions, matteCheckerboard } from './slice-ui-sheet.mjs'

// Builds a small RGBA test image from an ASCII map: '.' = transparent,
// any other non-space char = opaque (alpha 255) with a distinct-ish color.
function imageFromMap(rows: string[]) {
  const height = rows.length
  const width = rows[0].length
  const pixels = Buffer.alloc(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ch = rows[y][x]
      const offset = (y * width + x) * 4
      if (ch !== '.') {
        pixels[offset] = 200; pixels[offset + 1] = 100; pixels[offset + 2] = 50; pixels[offset + 3] = 255
      }
    }
  }
  return { width, height, pixels }
}

describe('detectRegions', () => {
  it('finds two well-separated blobs with correct bounding boxes, in reading order', () => {
    const img = imageFromMap([
      '..........',
      '.AA....BB.',
      '.AA....BB.',
      '..........',
    ])
    const regions = detectRegions(img, { padding: 0, minArea: 1 })
    expect(regions).toHaveLength(2)
    expect(regions[0]).toMatchObject({ x: 1, y: 1, width: 2, height: 2 })
    expect(regions[1]).toMatchObject({ x: 7, y: 1, width: 2, height: 2 })
  })

  it('does not split one blob that has a thin transparent hole inside it', () => {
    const img = imageFromMap([
      '.......',
      '.AAAAA.',
      '.AA.AA.',
      '.AAAAA.',
      '.......',
    ])
    const regions = detectRegions(img, { padding: 0, minArea: 1, dilateRadius: 0 })
    expect(regions).toHaveLength(1)
    expect(regions[0]).toMatchObject({ x: 1, y: 1, width: 5, height: 3 })
  })

  it('keeps a 2px gap as two regions by default, but merges it when dilateRadius covers the gap', () => {
    const img = imageFromMap([
      '..........',
      '.AA..BB...',
      '.AA..BB...',
      '..........',
    ])
    const separate = detectRegions(img, { padding: 0, minArea: 1, dilateRadius: 0 })
    expect(separate).toHaveLength(2)

    const merged = detectRegions(img, { padding: 0, minArea: 1, dilateRadius: 2 })
    expect(merged).toHaveLength(1)
    // The merged bounding box spans both original blobs.
    expect(merged[0]).toMatchObject({ x: 1, y: 1, width: 6, height: 2 })
  })

  it('drops specks smaller than minArea', () => {
    const img = imageFromMap([
      '..........',
      '.AAAA..B..',
      '.AAAA.....',
      '..........',
    ])
    const regions = detectRegions(img, { padding: 0, minArea: 3, dilateRadius: 0 })
    expect(regions).toHaveLength(1)
    expect(regions[0]).toMatchObject({ x: 1, y: 1, width: 4, height: 2 })
  })

  it('expands by padding but clamps to image bounds at the edges', () => {
    const img = imageFromMap([
      'AA........',
      'AA........',
      '..........',
    ])
    const regions = detectRegions(img, { padding: 5, minArea: 1 })
    expect(regions).toHaveLength(1)
    // Blob sits at the top-left corner; padding must not push x/y negative.
    expect(regions[0]).toMatchObject({ x: 0, y: 0 })
    expect(regions[0].width).toBeGreaterThanOrEqual(2)
    expect(regions[0].height).toBeGreaterThanOrEqual(2)
  })
})

// Builds a fully-opaque RGB test image (no alpha) from a map of chars to
// [r,g,b] colors — mirrors the baked-checkerboard source sheets, which have
// alpha=255 everywhere and encode "background" purely as pixel color.
function opaqueImageFromColorMap(rows: string[], palette: Record<string, [number, number, number]>) {
  const height = rows.length
  const width = rows[0].length
  const pixels = Buffer.alloc(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = palette[rows[y][x]]
      const offset = (y * width + x) * 4
      pixels[offset] = r; pixels[offset + 1] = g; pixels[offset + 2] = b; pixels[offset + 3] = 255
    }
  }
  return { width, height, pixels }
}

describe('matteCheckerboard', () => {
  const palette = { A: [220, 220, 220], B: [235, 235, 235], I: [200, 30, 30] } as const

  it('removes checkerboard-colored pixels connected to the border, keeps the icon opaque', () => {
    const img = opaqueImageFromColorMap([
      'AABBAA',
      'ABIIBA',
      'BAIIAB',
      'AABBAA',
    ], palette)
    const matted = matteCheckerboard(img, { colors: [palette.A, palette.B], tolerance: 0, feather: 0 })
    // Border checkerboard pixels are gone.
    expect(matted.pixels[3]).toBe(0) // (0,0) = 'A'
    // The icon block (rows 1-2, cols 2-3) survives untouched.
    const iconOffset = (1 * img.width + 2) * 4
    expect(matted.pixels[iconOffset + 3]).toBe(255)
    expect(matted.pixels[iconOffset]).toBe(200)
  })

  it('does not remove a background-colored pixel fully enclosed by icon pixels (not reachable from the border)', () => {
    const img = opaqueImageFromColorMap([
      'BBBBB',
      'BIIIB',
      'BIAIB',
      'BIIIB',
      'BBBBB',
    ], palette)
    const matted = matteCheckerboard(img, { colors: [palette.A, palette.B], tolerance: 0, feather: 0 })
    const enclosedOffset = (2 * img.width + 2) * 4 // the 'A'-colored pixel walled in by 'I'
    expect(matted.pixels[enclosedOffset + 3]).toBe(255)
    const borderOffset = 3
    expect(matted.pixels[borderOffset]).toBe(0)
  })

  it('softens the cut edge with a partial-alpha feather pass', () => {
    const img = opaqueImageFromColorMap([
      'BBBBB',
      'BIIIB',
      'BIIIB',
      'BBBBB',
    ], palette)
    const matted = matteCheckerboard(img, { colors: [palette.A, palette.B], tolerance: 0, feather: 1 })
    const edgeOffset = (1 * img.width + 1) * 4 // icon pixel touching the removed background
    expect(matted.pixels[edgeOffset + 3]).toBeGreaterThan(0)
    expect(matted.pixels[edgeOffset + 3]).toBeLessThan(255)
  })
})

describe('matteCheckerboard with the lightness/spread heuristic', () => {
  // Simulates a vignetted checkerboard: border tiles are pale gray-blue,
  // shading darker toward the icon, but always "light and nearly neutral".
  const palette = { L: [219, 218, 223], D: [189, 192, 197], I: [200, 30, 30], M: [120, 120, 126] } as const

  it('removes both the light and the vignette-darkened background tones, keeps the vivid icon', () => {
    const img = opaqueImageFromColorMap([
      'LLDDLL',
      'LDIIDL',
      'DLIILD',
      'LLDDLL',
    ], palette)
    const matted = matteCheckerboard(img, { minLightness: 165, maxSpread: 20, feather: 0 })
    expect(matted.pixels[3]).toBe(0) // 'L' corner
    const dOffset = (0 * img.width + 2) * 4 // a 'D' pixel
    expect(matted.pixels[dOffset + 3]).toBe(0)
    const iconOffset = (1 * img.width + 2) * 4 // an 'I' pixel
    expect(matted.pixels[iconOffset + 3]).toBe(255)
  })

  it('keeps a near-neutral mid-gray icon pixel that is darker than the lightness floor', () => {
    const img = opaqueImageFromColorMap([
      'LLLLL',
      'LMMML',
      'LMMML',
      'LLLLL',
    ], palette)
    const matted = matteCheckerboard(img, { minLightness: 165, maxSpread: 20, feather: 0 })
    const metalOffset = (1 * img.width + 1) * 4 // 'M' (120,120,126), lightness ~122 — below the floor, must survive
    expect(matted.pixels[metalOffset + 3]).toBe(255)
  })
})

describe('gridRegions', () => {
  it('slices a uniform NxM grid after trimming header/footer margins', () => {
    const img = { width: 100, height: 60, pixels: Buffer.alloc(100 * 60 * 4) }
    const regions = gridRegions(img, { cols: 5, rows: 2, top: 10, bottom: 10 })
    expect(regions).toHaveLength(10)
    expect(regions[0]).toMatchObject({ index: 0, x: 0, y: 10, width: 20, height: 20 })
    expect(regions[4]).toMatchObject({ index: 4, x: 80, y: 10, width: 20, height: 20 })
    expect(regions[9]).toMatchObject({ index: 9, x: 80, y: 30, width: 20, height: 20 })
  })
})

describe('cropRegion', () => {
  it('extracts exactly the pixels inside the region box', () => {
    const img = imageFromMap([
      '......',
      '.AABB.',
      '.AABB.',
      '......',
    ])
    const [region] = detectRegions(img, { padding: 0, minArea: 1, dilateRadius: 3 })
    const crop = cropRegion(img, region)
    expect(crop.width).toBe(region.width)
    expect(crop.height).toBe(region.height)
    // Every pixel in the crop should be opaque (the region tightly bounds the blob).
    for (let i = 3; i < crop.pixels.length; i += 4) expect(crop.pixels[i]).toBe(255)
  })
})

describe('buildContactSheet', () => {
  it('lays out N region crops into an N-cell grid at the requested cell size', () => {
    const img = imageFromMap([
      '..........',
      '.AA....BB.',
      '.AA....BB.',
      '..........',
    ])
    const regions = detectRegions(img, { padding: 0, minArea: 1 })
    const sheet = buildContactSheet(img, regions, { cellSize: 16, cols: 2 })
    expect(sheet.width).toBe(32)
    expect(sheet.height).toBe(16) // 2 regions, 2 cols -> 1 row
  })
})
