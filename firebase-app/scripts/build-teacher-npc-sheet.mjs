// Builds the production texture atlas for the ครูวีรภัทร์ NPC from the raw
// animation sheets in 2D/ตัวละคร/ครู/ครูชาย/.
//
// The raw sheets are NOT registered on a uniform grid: frame pitch varies
// (83..120px), the feet baseline differs per animation (204..218), and the
// quest_offer / quest_complete sheets carry detached floating effects
// (sparkles, "!") as separate connected regions. Rendering them naively makes
// the character slide and hop when the pose changes. This script therefore:
//   1. detects the real sprites per sheet (connected components),
//   2. clusters detached effects onto the nearest body,
//   3. re-registers every frame on its FEET CENTROID (bottom band of the
//      body), so raised arms or floating stars never sway the standing pose,
//   4. composes one uniform 8-column atlas (one row per animation) with a
//      shared baseline, and
//   5. emits src/components/teacherNpcSheet.generated.ts with the cell
//      geometry the runtime needs.
//
// Usage: node scripts/build-teacher-npc-sheet.mjs
// Rerun whenever the source art in 2D/ตัวละคร/ครู/ครูชาย changes.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { decodePng, encodePng } from './compose-character-sheet.mjs'
import { detectRegions } from './slice-ui-sheet.mjs'

const SOURCE_DIR = join('2D', 'ตัวละคร', 'ครู', 'ครูชาย')
const ATLAS_PATH = join('src', 'assets', 'character', 'teacher-weeraphat-sheet.png')
const META_PATH = join('src', 'components', 'teacherNpcSheet.generated.ts')

const FRAMES_PER_ANIMATION = 8
const CELL_PADDING = 6
const FEET_BAND = 14

// Atlas row order — mirrored into the generated meta. The hall NPC currently
// acts calm on purpose (stand + natural blink from the idle row; one static
// celebrate frame in the quest-complete overlay), so only these two rows
// ship. More sheets exist in the source folder for when richer acting
// returns: wave, quest_offer, talk, read_clipboard, walk_{up,down,left,right}.
const ANIMATIONS = [
  { key: 'idle', file: 'npc_teacher_weeraphat_idle_front_8f.png' },
  { key: 'celebrate', file: 'npc_teacher_weeraphat_quest_complete_8f.png' },
]

// Split detected regions into exactly `frameCount` frames: the largest
// regions are the character bodies (left-to-right), every smaller region
// (floating sparkle/marker) attaches to the body whose horizontal center is
// nearest.
export function clusterRegionsToFrames(regions, frameCount) {
  if (regions.length < frameCount) {
    throw new Error(`expected at least ${frameCount} frame bodies, detected ${regions.length} regions`)
  }
  const byArea = [...regions].sort((a, b) => b.area - a.area)
  const bodies = byArea.slice(0, frameCount).sort((a, b) => a.x - b.x)
  const frames = bodies.map((body) => ({ body, parts: [body] }))
  for (const part of byArea.slice(frameCount)) {
    const center = part.x + part.width / 2
    let nearest = frames[0]
    let nearestDistance = Infinity
    for (const frame of frames) {
      const bodyCenter = frame.body.x + frame.body.width / 2
      const distance = Math.abs(center - bodyCenter)
      if (distance < nearestDistance) {
        nearestDistance = distance
        nearest = frame
      }
    }
    nearest.parts.push(part)
  }
  return frames
}

export function frameBounds(frame) {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity
  for (const part of frame.parts) {
    if (part.x < minX) minX = part.x
    if (part.y < minY) minY = part.y
    if (part.x + part.width - 1 > maxX) maxX = part.x + part.width - 1
    if (part.y + part.height - 1 > maxY) maxY = part.y + part.height - 1
  }
  return { minX, minY, maxX, maxY }
}

// Alpha-weighted centroid of the bottom `band` rows of the body region: the
// feet. Anchoring here (instead of the bbox center) keeps the standing pose
// perfectly planted even when an arm or effect extends far to one side.
export function feetAnchor(img, body, band = FEET_BAND) {
  const fromY = Math.max(body.y, body.y + body.height - band)
  const toY = body.y + body.height - 1
  let weight = 0
  let sum = 0
  for (let y = fromY; y <= toY; y++) {
    for (let x = body.x; x < body.x + body.width; x++) {
      const alpha = img.pixels[(y * img.width + x) * 4 + 3]
      if (alpha === 0) continue
      weight += alpha
      sum += alpha * x
    }
  }
  return weight > 0 ? sum / weight : body.x + body.width / 2
}

// Uniform cell geometry across every animation: anchor horizontally centered,
// baseline shared, everything padded so no frame ever clips.
export function atlasGeometry(frames, padding = CELL_PADDING) {
  let half = 0; let up = 0; let down = 0
  for (const frame of frames) {
    half = Math.max(half, frame.anchorX - frame.minX, frame.maxX - frame.anchorX)
    up = Math.max(up, frame.baselineY - frame.minY)
    down = Math.max(down, frame.maxY - frame.baselineY)
  }
  const halfWidth = Math.ceil(half) + padding
  return {
    cellWidth: 2 * halfWidth,
    cellHeight: padding + Math.ceil(up) + Math.ceil(down) + padding,
    anchorCol: halfWidth,
    baselineRow: padding + Math.ceil(up),
  }
}

// Blit one frame into atlas cell (col,row), feet anchor onto the cell anchor.
// Copies part rectangles only, so a neighbouring sprite that leaks into the
// union bbox can never bleed into this cell.
export function placeFrame(atlas, source, frame, geometry, col, row) {
  const offsetX = col * geometry.cellWidth + geometry.anchorCol - Math.round(frame.anchorX)
  const offsetY = row * geometry.cellHeight + geometry.baselineRow - frame.baselineY
  for (const part of frame.parts) {
    for (let y = part.y; y < part.y + part.height; y++) {
      const dstY = y + offsetY
      if (dstY < 0 || dstY >= atlas.height) continue
      for (let x = part.x; x < part.x + part.width; x++) {
        const srcOffset = (y * source.width + x) * 4
        if (source.pixels[srcOffset + 3] === 0) continue
        const dstX = x + offsetX
        if (dstX < 0 || dstX >= atlas.width) continue
        const dstOffset = (dstY * atlas.width + dstX) * 4
        source.pixels.copy(atlas.pixels, dstOffset, srcOffset, srcOffset + 4)
      }
    }
  }
}

function buildAnimationFrames(img) {
  const regions = detectRegions(img, { dilateRadius: 1, minArea: 100, padding: 0 })
  return clusterRegionsToFrames(regions, FRAMES_PER_ANIMATION).map((frame) => ({
    ...frame,
    ...frameBounds(frame),
    anchorX: feetAnchor(img, frame.body),
    baselineY: frame.body.y + frame.body.height - 1,
  }))
}

const invokedDirectly = process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href
if (invokedDirectly) {
  const sheets = ANIMATIONS.map((animation) => {
    const img = decodePng(join(SOURCE_DIR, animation.file))
    return { ...animation, img, frames: buildAnimationFrames(img) }
  })
  const geometry = atlasGeometry(sheets.flatMap((sheet) => sheet.frames))
  const atlas = {
    width: geometry.cellWidth * FRAMES_PER_ANIMATION,
    height: geometry.cellHeight * sheets.length,
    pixels: Buffer.alloc(geometry.cellWidth * FRAMES_PER_ANIMATION * geometry.cellHeight * sheets.length * 4),
  }
  sheets.forEach((sheet, row) => {
    sheet.frames.forEach((frame, col) => placeFrame(atlas, sheet.img, frame, geometry, col, row))
  })
  mkdirSync(join('src', 'assets', 'character'), { recursive: true })
  encodePng(ATLAS_PATH, atlas)

  const rows = Object.fromEntries(sheets.map((sheet, row) => [sheet.key, row]))
  writeFileSync(META_PATH, `// AUTO-GENERATED by scripts/build-teacher-npc-sheet.mjs — do not edit.
// Source art: 2D/ตัวละคร/ครู/ครูชาย/npc_teacher_weeraphat_*_8f.png
// Frames are re-registered on the feet centroid with a shared baseline, so
// every animation stands on the exact same spot.
export const TEACHER_SHEET = {
  columns: ${FRAMES_PER_ANIMATION},
  frameWidth: ${geometry.cellWidth},
  frameHeight: ${geometry.cellHeight},
  baselineRow: ${geometry.baselineRow},
  rows: ${JSON.stringify(rows).replace(/"/g, '').replace(/,/g, ', ').replace(/:/g, ': ').replace('{', '{ ').replace('}', ' }')},
} as const

export type TeacherSheetRow = keyof typeof TEACHER_SHEET.rows
`)
  console.log(`Atlas ${atlas.width}x${atlas.height} (cell ${geometry.cellWidth}x${geometry.cellHeight}) -> ${ATLAS_PATH}`)
  console.log(`Meta -> ${META_PATH}`)
}
