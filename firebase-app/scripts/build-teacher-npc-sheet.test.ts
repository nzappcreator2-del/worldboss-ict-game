import { describe, expect, it } from 'vitest'
import {
  atlasGeometry,
  clusterRegionsToFrames,
  feetAnchor,
  frameBounds,
  placeFrame,
} from './build-teacher-npc-sheet.mjs'

type Region = { x: number; y: number; width: number; height: number; area: number }

const region = (x: number, y: number, width: number, height: number, area = width * height): Region =>
  ({ x, y, width, height, area })

// Tiny synthetic image helper: opaque rectangles on a transparent canvas.
function imageWith(width: number, height: number, rects: Array<{ x: number; y: number; w: number; h: number }>) {
  const pixels = Buffer.alloc(width * height * 4)
  for (const { x, y, w, h } of rects) {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        const offset = (yy * width + xx) * 4
        pixels[offset] = 200
        pixels[offset + 3] = 255
      }
    }
  }
  return { width, height, pixels }
}

describe('clusterRegionsToFrames', () => {
  it('keeps the N largest regions as bodies in left-to-right order', () => {
    const bodies = [region(10, 50, 60, 140), region(120, 50, 62, 140), region(240, 50, 61, 140)]
    const frames = clusterRegionsToFrames([bodies[2], bodies[0], bodies[1]], 3)
    expect(frames.map((frame) => frame.body.x)).toEqual([10, 120, 240])
    expect(frames.every((frame) => frame.parts.length === 1)).toBe(true)
  })

  it('attaches floating effects (sparkles) to the frame with the nearest body center', () => {
    const bodyA = region(10, 60, 60, 140)
    const bodyB = region(130, 60, 60, 140)
    const starNearA = region(30, 20, 24, 24)
    const starNearB = region(150, 18, 22, 25)
    const frames = clusterRegionsToFrames([starNearB, bodyB, starNearA, bodyA], 2)
    expect(frames[0].parts).toContain(starNearA)
    expect(frames[0].parts).not.toContain(starNearB)
    expect(frames[1].parts).toContain(starNearB)
  })

  it('throws when fewer regions than requested frames were detected', () => {
    expect(() => clusterRegionsToFrames([region(0, 0, 10, 10)], 8)).toThrow(/frame/i)
  })
})

describe('frameBounds', () => {
  it('unions the body with its attached parts', () => {
    const body = region(100, 60, 50, 120)
    const star = region(110, 20, 24, 24)
    expect(frameBounds({ body, parts: [body, star] })).toEqual({ minX: 100, minY: 20, maxX: 149, maxY: 179 })
  })
})

describe('feetAnchor', () => {
  it('anchors on the centroid of the bottom band so raised arms cannot cause sway', () => {
    // Feet block centered at x 14..25 (centroid 19.5); an arm juts far right
    // above the feet band and must not shift the anchor.
    const img = imageWith(60, 60, [
      { x: 14, y: 46, w: 12, h: 12 },
      { x: 30, y: 10, w: 24, h: 8 },
    ])
    const body = region(14, 10, 40, 48)
    const anchor = feetAnchor(img, body, 12)
    expect(anchor).toBeGreaterThan(19)
    expect(anchor).toBeLessThan(20.5)
  })
})

describe('atlasGeometry', () => {
  it('sizes uniform cells with the anchor centered and a shared baseline', () => {
    const frames = [
      { anchorX: 50, baselineY: 200, minX: 20, maxX: 70, minY: 60, maxY: 200 },
      { anchorX: 150, baselineY: 210, minX: 130, maxX: 195, minY: 80, maxY: 212 },
    ]
    const geometry = atlasGeometry(frames, 6)
    // Frame 2 reaches 45 right of its anchor; frame 1 reaches 30 left.
    // Half-width must cover the widest side (45) plus padding.
    expect(geometry.cellWidth).toBe(2 * (45 + 6))
    expect(geometry.anchorCol).toBe(geometry.cellWidth / 2)
    // Tallest above-baseline span is 140 (frame 1); deepest below is 2.
    expect(geometry.baselineRow).toBe(6 + 140)
    expect(geometry.cellHeight).toBe(6 + 140 + 2 + 6)
  })
})

describe('placeFrame', () => {
  it('blits a frame so its anchor lands exactly on the cell anchor point', () => {
    const source = imageWith(40, 40, [{ x: 10, y: 20, w: 6, h: 10 }])
    const frame = {
      body: region(10, 20, 6, 10),
      parts: [region(10, 20, 6, 10)],
      anchorX: 13,
      baselineY: 29,
    }
    const geometry = { cellWidth: 20, cellHeight: 20, anchorCol: 10, baselineRow: 15 }
    const atlas = { width: 40, height: 20, pixels: Buffer.alloc(40 * 20 * 4) }
    placeFrame(atlas, source, frame, geometry, 1, 0)

    // Feet-bottom pixel (source 13,29) must land at cell 1's anchor (col 20+10, row 15).
    const offset = ((geometry.baselineRow) * atlas.width + (20 + geometry.anchorCol)) * 4
    expect(atlas.pixels[offset + 3]).toBe(255)
    // Nothing may bleed into the neighbouring cell 0.
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 20; x++) {
        expect(atlas.pixels[(y * atlas.width + x) * 4 + 3]).toBe(0)
      }
    }
  })
})
