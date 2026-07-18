import { describe, expect, it } from 'vitest'
import {
  CELL_SIZE,
  SHEET_COLUMNS,
  SHEET_ROWS,
  attackPlacements,
  blitCell,
  walkPlacements,
} from './compose-character-sheet.mjs'

describe('character sheet placements', () => {
  it('lays the 9-frame walk cycle onto rows 8-11 in up/left/down/right order', () => {
    const placements = walkPlacements()
    expect(placements).toHaveLength(9 * 4)
    // Source walk sheets are 9 columns x 4 direction rows (up, left, down, right).
    expect(placements).toContainEqual({ srcCol: 0, srcRow: 0, destCol: 0, destRow: 8 })
    expect(placements).toContainEqual({ srcCol: 8, srcRow: 1, destCol: 8, destRow: 9 })
    expect(placements).toContainEqual({ srcCol: 4, srcRow: 2, destCol: 4, destRow: 10 })
    expect(placements).toContainEqual({ srcCol: 8, srcRow: 3, destCol: 8, destRow: 11 })
    for (const { destCol, destRow } of placements) {
      expect(destCol).toBeGreaterThanOrEqual(0)
      expect(destCol).toBeLessThan(SHEET_COLUMNS)
      expect(destRow).toBeGreaterThanOrEqual(8)
      expect(destRow).toBeLessThanOrEqual(11)
    }
  })

  it('lays the 6-frame slash cycle onto the oversized-attack middle cells', () => {
    const placements = attackPlacements()
    expect(placements).toHaveLength(6 * 4)
    // Middle cell of each oversized frame: columns 1,4,7,10,13,16 at rows 55/58/61/64.
    const upRow = placements.filter((item) => item.srcRow === 0)
    expect(upRow.map((item) => item.destCol)).toEqual([1, 4, 7, 10, 13, 16])
    expect(new Set(upRow.map((item) => item.destRow))).toEqual(new Set([55]))
    expect(new Set(placements.map((item) => item.destRow))).toEqual(new Set([55, 58, 61, 64]))
    for (const { destRow } of placements) expect(destRow).toBeLessThan(SHEET_ROWS)
  })

  it('blitCell copies one 64px cell between RGBA buffers', () => {
    const cell = CELL_SIZE
    const src = { width: cell * 2, height: cell, pixels: Buffer.alloc(cell * 2 * cell * 4) }
    // Mark the top-left pixel of the second source cell.
    src.pixels.set([1, 2, 3, 255], cell * 4)
    const dest = { width: cell * 3, height: cell * 2, pixels: Buffer.alloc(cell * 3 * cell * 2 * 4) }
    blitCell(dest, src, { srcCol: 1, srcRow: 0, destCol: 2, destRow: 1 })
    const offset = ((1 * cell) * dest.width + 2 * cell) * 4
    expect([...dest.pixels.subarray(offset, offset + 4)]).toEqual([1, 2, 3, 255])
    // Nothing outside the target cell was written.
    expect(dest.pixels.subarray(0, offset).every((byte) => byte === 0)).toBe(true)
  })
})
