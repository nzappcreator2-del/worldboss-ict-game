import { describe, expect, it } from 'vitest'
import {
  BLINK_DELAY_MAX_MS,
  BLINK_DELAY_MIN_MS,
  BLINK_HOLD_MS,
  CELEBRATE_OVERLAY_FRAME,
  DOUBLE_BLINK_CHANCE,
  IDLE_BASE_FRAME,
  IDLE_BLINK_FRAME,
  NPC_RENDER_SCALE,
  isDoubleBlink,
  nextBlinkDelay,
  npcPortraitStyle,
  npcSpriteStyle,
} from './teacherNpcSprite'
import { TEACHER_SHEET } from './teacherNpcSheet.generated'

describe('natural blink pacing', () => {
  it('keeps the base and blink frames on distinct idle-row cells', () => {
    expect(IDLE_BASE_FRAME).not.toBe(IDLE_BLINK_FRAME)
    expect(IDLE_BASE_FRAME).toBeGreaterThanOrEqual(0)
    expect(IDLE_BLINK_FRAME).toBeLessThan(TEACHER_SHEET.columns)
  })

  it('waits a calm randomized pause between blinks — never machine-gun looping', () => {
    expect(nextBlinkDelay(0)).toBe(BLINK_DELAY_MIN_MS)
    expect(nextBlinkDelay(1)).toBe(BLINK_DELAY_MAX_MS)
    expect(nextBlinkDelay(0.5)).toBeGreaterThan(BLINK_DELAY_MIN_MS)
    expect(nextBlinkDelay(0.5)).toBeLessThan(BLINK_DELAY_MAX_MS)
    // A human at-rest blink cadence: seconds apart, held only briefly.
    expect(BLINK_DELAY_MIN_MS).toBeGreaterThanOrEqual(2000)
    expect(BLINK_HOLD_MS).toBeLessThanOrEqual(200)
  })

  it('occasionally double-blinks, driven by the provided randomness', () => {
    expect(isDoubleBlink(0)).toBe(true)
    expect(isDoubleBlink(DOUBLE_BLINK_CHANCE + 0.01)).toBe(false)
    expect(DOUBLE_BLINK_CHANCE).toBeLessThan(0.5)
  })
})

describe('npcSpriteStyle', () => {
  it('crops the exact cell for a row and frame at render scale', () => {
    const width = TEACHER_SHEET.frameWidth * NPC_RENDER_SCALE
    const height = TEACHER_SHEET.frameHeight * NPC_RENDER_SCALE
    const style = npcSpriteStyle('idle', IDLE_BLINK_FRAME)
    expect(style.width).toBe(`${width}px`)
    expect(style.height).toBe(`${height}px`)
    expect(style.backgroundSize).toBe(`${TEACHER_SHEET.columns * width}px ${Object.keys(TEACHER_SHEET.rows).length * height}px`)
    expect(style.backgroundPosition).toBe(`${-IDLE_BLINK_FRAME * width}px ${-TEACHER_SHEET.rows.idle * height}px`)
    expect(style.backgroundImage).toContain('url(')
  })

  it('selects the static celebrate frame for the quest-complete overlay', () => {
    const style = npcSpriteStyle('celebrate', CELEBRATE_OVERLAY_FRAME, 0.62)
    const width = TEACHER_SHEET.frameWidth * 0.62
    const height = TEACHER_SHEET.frameHeight * 0.62
    expect(style.backgroundPosition).toBe(`${-CELEBRATE_OVERLAY_FRAME * width}px ${-TEACHER_SHEET.rows.celebrate * height}px`)
  })

  it('renders close to the previous placeholder footprint so the hall layout holds', () => {
    const width = TEACHER_SHEET.frameWidth * NPC_RENDER_SCALE
    const height = TEACHER_SHEET.frameHeight * NPC_RENDER_SCALE
    expect(width).toBeGreaterThan(78)
    expect(width).toBeLessThan(112)
    expect(height).toBeGreaterThan(110)
    expect(height).toBeLessThan(150)
  })
})

describe('npcPortraitStyle', () => {
  it('zooms on the idle head frame inside the requested portrait box', () => {
    const style = npcPortraitStyle(52, 66)
    expect(style.width).toBe('52px')
    expect(style.height).toBe('66px')
    expect(style.backgroundImage).toContain('url(')
    const backgroundWidth = Number.parseFloat(String(style.backgroundSize).split(' ')[0])
    expect(backgroundWidth).toBeGreaterThan(TEACHER_SHEET.columns * 52)
    expect(Number.parseFloat(String(style.backgroundPosition).split(' ')[0])).toBeLessThan(0)
  })
})
