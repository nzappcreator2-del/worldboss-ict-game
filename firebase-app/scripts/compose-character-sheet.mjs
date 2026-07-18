// Composes a gendered student base spritesheet onto the project's LPC full
// grid (18x66 cells of 64px — the same layout as base-hero.png) from the
// per-animation sheets exported by the LPC generator (walk.png + slash.png).
//
// Usage: node scripts/compose-character-sheet.mjs <lpc-standard-dir> <out.png>
// The app only samples the walk cells (rows 8-11, 9 frames) and the middle
// cell of each oversized-slash frame (rows 55/58/61/64, columns 1,4,7,10,13,16)
// — see dashboardCharacter.ts and the attackRows in LessonPage/BossBattle.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import zlib from 'node:zlib'

export const CELL_SIZE = 64
export const SHEET_COLUMNS = 18
export const SHEET_ROWS = 66

const WALK_FRAMES = 9
const WALK_DEST_FIRST_ROW = 8
const ATTACK_FRAMES = 6
const ATTACK_DEST_ROWS = [55, 58, 61, 64]
const ATTACK_DEST_COLUMN = (frame) => 1 + frame * 3
const DIRECTION_COUNT = 4 // LPC row order: up, left, down, right

export function walkPlacements() {
  const placements = []
  for (let direction = 0; direction < DIRECTION_COUNT; direction++) {
    for (let frame = 0; frame < WALK_FRAMES; frame++) {
      placements.push({ srcCol: frame, srcRow: direction, destCol: frame, destRow: WALK_DEST_FIRST_ROW + direction })
    }
  }
  return placements
}

export function attackPlacements() {
  const placements = []
  for (let direction = 0; direction < DIRECTION_COUNT; direction++) {
    for (let frame = 0; frame < ATTACK_FRAMES; frame++) {
      placements.push({ srcCol: frame, srcRow: direction, destCol: ATTACK_DEST_COLUMN(frame), destRow: ATTACK_DEST_ROWS[direction] })
    }
  }
  return placements
}

export function blitCell(dest, src, { srcCol, srcRow, destCol, destRow }) {
  for (let y = 0; y < CELL_SIZE; y++) {
    const srcOffset = ((srcRow * CELL_SIZE + y) * src.width + srcCol * CELL_SIZE) * 4
    const destOffset = ((destRow * CELL_SIZE + y) * dest.width + destCol * CELL_SIZE) * 4
    src.pixels.copy(dest.pixels, destOffset, srcOffset, srcOffset + CELL_SIZE * 4)
  }
}

// --- Minimal PNG codec (8-bit RGBA, non-interlaced — what the LPC generator emits) ---

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

export function decodePng(path) {
  const file = readFileSync(path)
  if (!file.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error(`${path}: not a PNG file`)
  let position = 8
  let width = 0
  let height = 0
  const idatChunks = []
  while (position < file.length) {
    const length = file.readUInt32BE(position)
    const type = file.toString('ascii', position + 4, position + 8)
    const data = file.subarray(position + 8, position + 8 + length)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      if (data[8] !== 8 || data[9] !== 6 || data[12] !== 0) {
        throw new Error(`${path}: expected 8-bit RGBA non-interlaced PNG (bitDepth=${data[8]} colorType=${data[9]} interlace=${data[12]})`)
      }
    } else if (type === 'IDAT') {
      idatChunks.push(data)
    } else if (type === 'IEND') {
      break
    }
    position += 12 + length
  }
  const raw = zlib.inflateSync(Buffer.concat(idatChunks))
  const stride = width * 4
  const pixels = Buffer.alloc(height * stride)
  const paeth = (a, b, c) => {
    const p = a + b - c
    const pa = Math.abs(p - a)
    const pb = Math.abs(p - b)
    const pc = Math.abs(p - c)
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
  }
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    const out = pixels.subarray(y * stride, (y + 1) * stride)
    const prev = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : null
    for (let x = 0; x < stride; x++) {
      const left = x >= 4 ? out[x - 4] : 0
      const above = prev ? prev[x] : 0
      const aboveLeft = x >= 4 && prev ? prev[x - 4] : 0
      let value = line[x]
      if (filter === 1) value += left
      else if (filter === 2) value += above
      else if (filter === 3) value += (left + above) >> 1
      else if (filter === 4) value += paeth(left, above, aboveLeft)
      else if (filter !== 0) throw new Error(`${path}: unsupported PNG filter ${filter}`)
      out[x] = value & 0xff
    }
  }
  return { width, height, pixels }
}

let crcTable = null
function crc32(buffer) {
  if (!crcTable) {
    crcTable = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      crcTable[n] = c >>> 0
    }
  }
  let crc = 0xffffffff
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'ascii')
  data.copy(out, 8)
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
  return out
}

export function encodePng(path, { width, height, pixels }) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  const stride = width * 4
  const raw = Buffer.alloc(height * (stride + 1))
  for (let y = 0; y < height; y++) {
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  const idat = zlib.deflateSync(raw, { level: 9 })
  writeFileSync(path, Buffer.concat([PNG_SIGNATURE, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0))]))
}

export function composeSheet(standardDir) {
  const walk = decodePng(join(standardDir, 'walk.png'))
  const slash = decodePng(join(standardDir, 'slash.png'))
  if (walk.width !== WALK_FRAMES * CELL_SIZE || walk.height !== DIRECTION_COUNT * CELL_SIZE) {
    throw new Error(`walk.png must be ${WALK_FRAMES}x${DIRECTION_COUNT} cells, got ${walk.width}x${walk.height}`)
  }
  if (slash.width !== ATTACK_FRAMES * CELL_SIZE || slash.height !== DIRECTION_COUNT * CELL_SIZE) {
    throw new Error(`slash.png must be ${ATTACK_FRAMES}x${DIRECTION_COUNT} cells, got ${slash.width}x${slash.height}`)
  }
  const sheet = {
    width: SHEET_COLUMNS * CELL_SIZE,
    height: SHEET_ROWS * CELL_SIZE,
    pixels: Buffer.alloc(SHEET_COLUMNS * CELL_SIZE * SHEET_ROWS * CELL_SIZE * 4),
  }
  for (const placement of walkPlacements()) blitCell(sheet, walk, placement)
  for (const placement of attackPlacements()) blitCell(sheet, slash, placement)
  return sheet
}

const invokedDirectly = process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href
if (invokedDirectly) {
  const [standardDir, outPath] = process.argv.slice(2)
  if (!standardDir || !outPath) {
    console.error('Usage: node scripts/compose-character-sheet.mjs <lpc-standard-dir> <out.png>')
    process.exit(1)
  }
  encodePng(outPath, composeSheet(standardDir))
  console.log(`Composed ${outPath} from ${standardDir}`)
}
