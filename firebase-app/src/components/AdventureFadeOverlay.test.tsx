// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdventureFadeOverlay } from './AdventureFadeOverlay'
import { ADVENTURE_FADE_COVER_MS, ADVENTURE_FADE_HOLD_MS } from './adventureFadeLogic'

const HOLD_MS = ADVENTURE_FADE_COVER_MS + ADVENTURE_FADE_HOLD_MS

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('AdventureFadeOverlay', () => {
  it('stays inactive until a tracked scene change fires', () => {
    render(<AdventureFadeOverlay />)
    expect(screen.getByTestId('adventure-fade-overlay').className).not.toContain('adventure-fade-overlay-active')
  })

  it('covers on an adventure/lesson page change and reveals again after the hold', async () => {
    vi.useFakeTimers()
    render(<AdventureFadeOverlay />)

    act(() => { window.dispatchEvent(new CustomEvent('nextgen:page-changed', { detail: 'lesson' })) })
    expect(screen.getByTestId('adventure-fade-overlay').className).toContain('adventure-fade-overlay-active')

    await act(async () => { await vi.advanceTimersByTimeAsync(HOLD_MS) })
    expect(screen.getByTestId('adventure-fade-overlay').className).not.toContain('adventure-fade-overlay-active')
  })

  it('ignores a page change outside the adventure/lesson flow', () => {
    render(<AdventureFadeOverlay />)
    act(() => { window.dispatchEvent(new CustomEvent('nextgen:page-changed', { detail: 'lobby' })) })
    expect(screen.getByTestId('adventure-fade-overlay').className).not.toContain('adventure-fade-overlay-active')
  })

  it('covers when entering the map dashboard tab', () => {
    render(<AdventureFadeOverlay />)
    act(() => { window.dispatchEvent(new CustomEvent('nextgen:dashboard-tab', { detail: 'map' })) })
    expect(screen.getByTestId('adventure-fade-overlay').className).toContain('adventure-fade-overlay-active')
  })

  it('ignores a dashboard tab change between two non-map tabs', () => {
    render(<AdventureFadeOverlay />)
    act(() => { window.dispatchEvent(new CustomEvent('nextgen:dashboard-tab', { detail: 'shop' })) })
    expect(screen.getByTestId('adventure-fade-overlay').className).not.toContain('adventure-fade-overlay-active')
  })

  it('restarts the reveal timer instead of stacking it when events fire back-to-back', async () => {
    vi.useFakeTimers()
    render(<AdventureFadeOverlay />)

    act(() => { window.dispatchEvent(new CustomEvent('nextgen:page-changed', { detail: 'map' })) })
    await act(async () => { await vi.advanceTimersByTimeAsync(HOLD_MS - 20) })
    act(() => { window.dispatchEvent(new CustomEvent('nextgen:page-changed', { detail: 'lesson' })) })
    await act(async () => { await vi.advanceTimersByTimeAsync(30) })

    // Still covering: the second event should have pushed the reveal deadline out.
    expect(screen.getByTestId('adventure-fade-overlay').className).toContain('adventure-fade-overlay-active')
  })
})
