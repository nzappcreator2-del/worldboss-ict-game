// Runtime sprite math for the ครูวีรภัทร์ NPC atlas (built by
// scripts/build-teacher-npc-sheet.mjs — uniform cells, feet-anchored).
//
// The NPC deliberately acts CALM: he stands on the idle base frame and only
// blinks, on a randomized human cadence (a few seconds apart, held ~140ms,
// with the occasional double blink). No looping full-body animation — the
// earlier 8-frame idle loop read as fidgety. The quest-complete overlay uses
// one static celebrate frame from the second atlas row.
import type { CSSProperties } from 'react'
import { TEACHER_SHEET, type TeacherSheetRow } from './teacherNpcSheet.generated'
import teacherSheetUrl from '../assets/character/teacher-weeraphat-sheet.png'

// 106x162 cells at 0.8 ≈ the original placeholder footprint, so the hall
// layout, name plate and marker positions all keep working.
export const NPC_RENDER_SCALE = 0.8

// Idle row: frame 0 is the neutral stand, frame 4 closes the eyes in the
// same stance — swapping between just these two reads as a pure blink with
// zero body movement.
export const IDLE_BASE_FRAME = 0
export const IDLE_BLINK_FRAME = 4

// Human at-rest blink cadence: every ~3-5 seconds, eyelids down ~140ms,
// sometimes twice in quick succession.
export const BLINK_DELAY_MIN_MS = 2600
export const BLINK_DELAY_MAX_MS = 4800
export const BLINK_HOLD_MS = 140
export const BLINK_GAP_MS = 160
export const DOUBLE_BLINK_CHANCE = 0.2

// Celebrate row, arms raised with the ✓ bubble — the overlay's static cheer.
export const CELEBRATE_OVERLAY_FRAME = 3

const ROW_COUNT = Object.keys(TEACHER_SHEET.rows).length

export function nextBlinkDelay(random: number): number {
  return BLINK_DELAY_MIN_MS + random * (BLINK_DELAY_MAX_MS - BLINK_DELAY_MIN_MS)
}

export function isDoubleBlink(random: number): boolean {
  return random <= DOUBLE_BLINK_CHANCE
}

export function npcSpriteStyle(row: TeacherSheetRow, frame: number, scale: number = NPC_RENDER_SCALE): CSSProperties {
  const width = TEACHER_SHEET.frameWidth * scale
  const height = TEACHER_SHEET.frameHeight * scale
  return {
    width: `${width}px`,
    height: `${height}px`,
    backgroundImage: `url(${teacherSheetUrl})`,
    backgroundRepeat: 'no-repeat',
    backgroundSize: `${TEACHER_SHEET.columns * width}px ${ROW_COUNT * height}px`,
    backgroundPosition: `${-frame * width}px ${-TEACHER_SHEET.rows[row] * height}px`,
  }
}

// Dialogue portrait: the neutral idle frame, zoomed on the head and torso.
export function npcPortraitStyle(width = 52, height = 66): CSSProperties {
  const scale = (width / TEACHER_SHEET.frameWidth) * 1.55
  const cellWidth = TEACHER_SHEET.frameWidth * scale
  const cellHeight = TEACHER_SHEET.frameHeight * scale
  return {
    width: `${width}px`,
    height: `${height}px`,
    backgroundImage: `url(${teacherSheetUrl})`,
    backgroundRepeat: 'no-repeat',
    backgroundSize: `${TEACHER_SHEET.columns * cellWidth}px ${ROW_COUNT * cellHeight}px`,
    backgroundPosition: `${(width - cellWidth) / 2}px ${-TEACHER_SHEET.rows.idle * cellHeight}px`,
  }
}
