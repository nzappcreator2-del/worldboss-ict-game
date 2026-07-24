import { describe, expect, it } from 'vitest'
import { mobileCameraOffset } from './mobileCameraLogic'

describe('mobileCameraLogic', () => {
  const viewport = { width: 390, height: 844 }
  const world = { width: 1500, height: 844 }

  it('centers the player while there is world space available', () => {
    expect(mobileCameraOffset({ x: 50, y: 50 }, viewport, world)).toEqual({
      x: -555,
      y: 0,
    })
  })

  it('clamps the camera at every world edge', () => {
    expect(mobileCameraOffset({ x: 0, y: 0 }, viewport, world)).toEqual({ x: 0, y: 0 })
    expect(mobileCameraOffset({ x: 100, y: 100 }, viewport, world)).toEqual({ x: -1110, y: 0 })

    const tallWorld = { width: 390, height: 1200 }
    expect(mobileCameraOffset({ x: 50, y: 100 }, viewport, tallWorld)).toEqual({ x: 0, y: -356 })
  })

  it('keeps a desktop-sized world stationary and handles invalid measurements safely', () => {
    expect(mobileCameraOffset({ x: 75, y: 75 }, viewport, viewport)).toEqual({ x: 0, y: 0 })
    expect(mobileCameraOffset({ x: 50, y: 50 }, { width: 0, height: 0 }, world)).toEqual({ x: 0, y: 0 })
  })
})
