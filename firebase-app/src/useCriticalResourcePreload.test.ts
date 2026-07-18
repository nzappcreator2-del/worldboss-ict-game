// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCriticalResourcePreload } from './useCriticalResourcePreload'

type Listener = () => void

class FakeImage {
  onload: Listener | null = null
  onerror: Listener | null = null
  private currentSrc = ''

  get src() { return this.currentSrc }
  set src(value: string) {
    this.currentSrc = value
    FakeImage.instances.push(this)
  }

  static instances: FakeImage[] = []
}

describe('useCriticalResourcePreload', () => {
  const originalImage = globalThis.Image
  const originalFonts = document.fonts

  beforeEach(() => {
    FakeImage.instances = []
    vi.stubGlobal('Image', FakeImage as unknown as typeof Image)
  })

  afterEach(() => {
    vi.stubGlobal('Image', originalImage)
    Object.defineProperty(document, 'fonts', { value: originalFonts, configurable: true })
    vi.useRealTimers()
  })

  it('starts not ready and reaches 100% only once both the image and the font resolve', async () => {
    let resolveFontsReady: () => void = () => {}
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: {
        ready: new Promise<void>((resolve) => { resolveFontsReady = resolve }),
        load: vi.fn().mockResolvedValue(undefined),
      },
    })

    const { result } = renderHook(() => useCriticalResourcePreload())
    expect(result.current.ready).toBe(false)
    expect(result.current.progress).toBe(0)

    await act(async () => {
      FakeImage.instances[0].onload?.()
      await Promise.resolve()
    })
    expect(result.current.ready).toBe(false)
    expect(result.current.progress).toBe(50)

    await act(async () => {
      resolveFontsReady()
      await Promise.resolve()
    })

    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current.progress).toBe(100)
  })

  it('still becomes ready when the background image fails to load', async () => {
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { ready: Promise.resolve(), load: vi.fn().mockResolvedValue(undefined) },
    })

    const { result } = renderHook(() => useCriticalResourcePreload())

    await act(async () => {
      FakeImage.instances[0].onerror?.()
      await Promise.resolve()
    })

    await waitFor(() => expect(result.current.ready).toBe(true))
  })

  it('falls back to ready after the timeout even if a resource never settles', async () => {
    vi.useFakeTimers()
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { ready: new Promise<void>(() => {}), load: vi.fn().mockResolvedValue(undefined) },
    })

    const { result } = renderHook(() => useCriticalResourcePreload())

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000)
    })

    expect(result.current.ready).toBe(true)
  })
})
