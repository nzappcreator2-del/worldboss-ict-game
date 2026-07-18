// Generic marketing-sheet slicer: given a PNG with real alpha transparency
// around each element (icon, button, panel, ...), auto-detects each element
// as a connected region of non-transparent pixels and crops it out. Used to
// pull new pieces out of 2D/item-drop/item1.png and 2D/UI/1.png the same way
// scripts/recolor-cosmetic.mjs pulls tier variants out of the cosmetic
// catalog — no manual pixel-coordinate guessing.
//
// Usage: node scripts/slice-ui-sheet.mjs <source.png> <outDir> [--dilate=1] [--min-area=24] [--padding=4]
// Writes outDir/region-000.png..region-NNN.png, outDir/contact-sheet.png
// (uniform grid, one cell per region, in reading order) and
// outDir/manifest.json ([{index,x,y,width,height}]) for reviewing what's
// what before naming anything.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { decodePng, encodePng } from './compose-character-sheet.mjs'

const DEFAULT_ALPHA_THRESHOLD = 16
const DEFAULT_DILATE_RADIUS = 1
const DEFAULT_MIN_AREA = 24
const DEFAULT_PADDING = 4
const DEFAULT_ROW_BAND = 24

function buildOpaqueMask(img, alphaThreshold) {
  const { width, height, pixels } = img
  const mask = new Uint8Array(width * height)
  for (let i = 0; i < width * height; i++) mask[i] = pixels[i * 4 + 3] >= alphaThreshold ? 1 : 0
  return mask
}

// Separable box dilation: O(width*height*radius) instead of O(*radius^2).
function dilateMask(mask, width, height, radius) {
  if (radius <= 0) return mask
  const horizontal = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    const row = y * width
    for (let x = 0; x < width; x++) {
      let hit = 0
      for (let dx = -radius; dx <= radius && !hit; dx++) {
        const nx = x + dx
        if (nx >= 0 && nx < width && mask[row + nx]) hit = 1
      }
      horizontal[row + x] = hit
    }
  }
  const out = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let hit = 0
      for (let dy = -radius; dy <= radius && !hit; dy++) {
        const ny = y + dy
        if (ny >= 0 && ny < height && horizontal[ny * width + x]) hit = 1
      }
      out[y * width + x] = hit
    }
  }
  return out
}

// 4-connected flood fill using a preallocated array as an iterative queue
// (avoids recursion depth issues on large sheets).
function labelComponents(mask, width, height) {
  const labels = new Int32Array(width * height).fill(-1)
  const queue = new Int32Array(width * height)
  let nextLabel = 0
  for (let start = 0; start < width * height; start++) {
    if (!mask[start] || labels[start] !== -1) continue
    const label = nextLabel++
    let head = 0; let tail = 0
    queue[tail++] = start
    labels[start] = label
    while (head < tail) {
      const idx = queue[head++]
      const x = idx % width; const y = (idx / width) | 0
      if (x > 0 && mask[idx - 1] && labels[idx - 1] === -1) { labels[idx - 1] = label; queue[tail++] = idx - 1 }
      if (x < width - 1 && mask[idx + 1] && labels[idx + 1] === -1) { labels[idx + 1] = label; queue[tail++] = idx + 1 }
      if (y > 0 && mask[idx - width] && labels[idx - width] === -1) { labels[idx - width] = label; queue[tail++] = idx - width }
      if (y < height - 1 && mask[idx + width] && labels[idx + width] === -1) { labels[idx + width] = label; queue[tail++] = idx + width }
    }
  }
  return { labels, count: nextLabel }
}

export function detectRegions(img, options = {}) {
  const {
    alphaThreshold = DEFAULT_ALPHA_THRESHOLD,
    dilateRadius = DEFAULT_DILATE_RADIUS,
    minArea = DEFAULT_MIN_AREA,
    padding = DEFAULT_PADDING,
    rowBand = DEFAULT_ROW_BAND,
  } = options
  const { width, height } = img
  const originalMask = buildOpaqueMask(img, alphaThreshold)
  const dilated = dilateMask(originalMask, width, height, dilateRadius)
  const { labels, count } = labelComponents(dilated, width, height)

  const boxes = Array.from({ length: count }, () => ({ minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity, area: 0 }))
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      if (!originalMask[idx]) continue
      const label = labels[idx]
      if (label < 0) continue
      const box = boxes[label]
      if (x < box.minX) box.minX = x
      if (x > box.maxX) box.maxX = x
      if (y < box.minY) box.minY = y
      if (y > box.maxY) box.maxY = y
      box.area++
    }
  }

  const regions = boxes
    .filter((box) => box.area >= minArea)
    .map((box) => {
      const x = Math.max(0, box.minX - padding)
      const y = Math.max(0, box.minY - padding)
      const x1 = Math.min(width - 1, box.maxX + padding)
      const y1 = Math.min(height - 1, box.maxY + padding)
      return { x, y, width: x1 - x + 1, height: y1 - y + 1, area: box.area }
    })

  regions.sort((a, b) => {
    const bandA = Math.round((a.y + a.height / 2) / rowBand)
    const bandB = Math.round((b.y + b.height / 2) / rowBand)
    if (bandA !== bandB) return bandA - bandB
    return a.x - b.x
  })

  return regions.map((region, index) => ({ index, ...region }))
}

// The source marketing sheets (2D/item-drop/item1.png, 2D/UI/1.png) are
// flattened PNGs with alpha=255 everywhere — "transparency" is drawn as a
// baked checkerboard pattern, not a real alpha channel (see
// src/assets/character/CREDITS.md-style provenance notes; confirmed by
// sampling: min/max alpha both 255 across the whole file). This does a
// "magic wand" style removal: flood-fill inward from the image border,
// clearing any pixel within `tolerance` of one of the given checkerboard
// `colors`. Because it only follows a path connected to the border, a
// background-colored pixel trapped inside an icon's outline (a highlight,
// a gem facet) is left alone. `feather` softens the resulting hard cutout
// edge by halving alpha on opaque pixels touching a cleared pixel, `feather`
// times, so the icon doesn't get a razor-sharp/aliased silhouette.
export function matteCheckerboard(img, { colors, tolerance = 10, feather = 1, minLightness, maxSpread } = {}) {
  const { width, height, pixels } = img
  // Some sheets bake a soft shadow/vignette under each icon, so the
  // checkerboard isn't exactly two fixed colors everywhere — pass
  // minLightness/maxSpread instead of (or in addition to) `colors` to match
  // by "light and nearly neutral gray" rather than an exact RGB triplet.
  const matchesBackground = (offset) => {
    const r = pixels[offset]; const g = pixels[offset + 1]; const b = pixels[offset + 2]
    if (colors && colors.some(([cr, cg, cb]) => Math.abs(r - cr) <= tolerance && Math.abs(g - cg) <= tolerance && Math.abs(b - cb) <= tolerance)) return true
    if (minLightness !== undefined && maxSpread !== undefined) {
      const lightness = (r + g + b) / 3
      const spread = Math.max(r, g, b) - Math.min(r, g, b)
      return lightness >= minLightness && spread <= maxSpread
    }
    return false
  }
  const removed = new Uint8Array(width * height)
  const queue = new Int32Array(width * height)
  let head = 0; let tail = 0
  const tryPush = (x, y) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return
    const p = y * width + x
    if (removed[p]) return
    if (!matchesBackground(p * 4)) return
    removed[p] = 1
    queue[tail++] = p
  }
  for (let x = 0; x < width; x++) { tryPush(x, 0); tryPush(x, height - 1) }
  for (let y = 0; y < height; y++) { tryPush(0, y); tryPush(width - 1, y) }
  while (head < tail) {
    const p = queue[head++]
    const x = p % width; const y = (p / width) | 0
    tryPush(x - 1, y); tryPush(x + 1, y); tryPush(x, y - 1); tryPush(x, y + 1)
  }

  const outPixels = Buffer.from(pixels)
  for (let p = 0; p < width * height; p++) { if (removed[p]) outPixels[p * 4 + 3] = 0 }

  for (let pass = 0; pass < feather; pass++) {
    const snapshot = Buffer.from(outPixels)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const offset = (y * width + x) * 4
        if (snapshot[offset + 3] === 0) continue
        const touchesRemoved = (x > 0 && snapshot[offset - 4 + 3] === 0)
          || (x < width - 1 && snapshot[offset + 4 + 3] === 0)
          || (y > 0 && snapshot[offset - width * 4 + 3] === 0)
          || (y < height - 1 && snapshot[offset + width * 4 + 3] === 0)
        if (touchesRemoved) outPixels[offset + 3] = Math.round(snapshot[offset + 3] * 0.5)
      }
    }
  }
  return { width, height, pixels: outPixels }
}

// For sheets that are a clean, uniform N-column x M-row icon grid (confirmed
// by eye first) — simpler and more reliable than shape detection when the
// layout is already known, e.g. 2D/item-drop/item1.png's 10x5 icon grid
// below its title bar.
export function gridRegions(img, { cols, rows, top = 0, bottom = 0, left = 0, right = 0 }) {
  const usableWidth = img.width - left - right
  const usableHeight = img.height - top - bottom
  const cellWidth = usableWidth / cols
  const cellHeight = usableHeight / rows
  const regions = []
  let index = 0
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = Math.round(left + col * cellWidth)
      const y = Math.round(top + row * cellHeight)
      const x1 = Math.round(left + (col + 1) * cellWidth)
      const y1 = Math.round(top + (row + 1) * cellHeight)
      regions.push({ index: index++, x, y, width: x1 - x, height: y1 - y })
    }
  }
  return regions
}

export function cropRegion(img, region) {
  const { width: w, height: h, x: x0, y: y0 } = region
  const pixels = Buffer.alloc(w * h * 4)
  for (let y = 0; y < h; y++) {
    const srcOff = ((y0 + y) * img.width + x0) * 4
    img.pixels.copy(pixels, y * w * 4, srcOff, srcOff + w * 4)
  }
  return { width: w, height: h, pixels }
}

export function buildContactSheet(img, regions, { cellSize = 128, cols = 8 } = {}) {
  const rows = Math.max(1, Math.ceil(regions.length / cols))
  const sheet = { width: cols * cellSize, height: rows * cellSize, pixels: Buffer.alloc(cols * cellSize * rows * cellSize * 4) }
  regions.forEach((region, i) => {
    const crop = cropRegion(img, region)
    const scale = Math.min(cellSize / crop.width, cellSize / crop.height, 1)
    const drawW = Math.max(1, Math.round(crop.width * scale))
    const drawH = Math.max(1, Math.round(crop.height * scale))
    const cellX = (i % cols) * cellSize + Math.floor((cellSize - drawW) / 2)
    const cellY = Math.floor(i / cols) * cellSize + Math.floor((cellSize - drawH) / 2)
    for (let y = 0; y < drawH; y++) {
      const srcY = Math.min(crop.height - 1, Math.floor(y / scale))
      for (let x = 0; x < drawW; x++) {
        const srcX = Math.min(crop.width - 1, Math.floor(x / scale))
        const srcOff = (srcY * crop.width + srcX) * 4
        const alpha = crop.pixels[srcOff + 3]
        if (alpha === 0) continue
        const dstOff = ((cellY + y) * sheet.width + (cellX + x)) * 4
        sheet.pixels[dstOff] = crop.pixels[srcOff]
        sheet.pixels[dstOff + 1] = crop.pixels[srcOff + 1]
        sheet.pixels[dstOff + 2] = crop.pixels[srcOff + 2]
        sheet.pixels[dstOff + 3] = alpha
      }
    }
  })
  return sheet
}

const invokedDirectly = process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href
if (invokedDirectly) {
  const args = process.argv.slice(2)
  const positional = args.filter((a) => !a.startsWith('--'))
  const flag = (name, fallback) => {
    const match = args.find((a) => a.startsWith(`--${name}=`))
    return match ? Number(match.split('=')[1]) : fallback
  }
  const [sourcePath, outDir] = positional
  if (!sourcePath || !outDir) {
    console.error('Usage: node scripts/slice-ui-sheet.mjs <source.png> <outDir> [--dilate=1] [--min-area=24] [--padding=4]')
    process.exit(1)
  }
  const img = decodePng(sourcePath)
  const regions = detectRegions(img, {
    dilateRadius: flag('dilate', DEFAULT_DILATE_RADIUS),
    minArea: flag('min-area', DEFAULT_MIN_AREA),
    padding: flag('padding', DEFAULT_PADDING),
  })
  mkdirSync(outDir, { recursive: true })
  for (const region of regions) {
    encodePng(join(outDir, `region-${String(region.index).padStart(3, '0')}.png`), cropRegion(img, region))
  }
  encodePng(join(outDir, 'contact-sheet.png'), buildContactSheet(img, regions))
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(regions, null, 2))
  console.log(`Detected ${regions.length} regions from ${sourcePath} -> ${outDir}`)
}
