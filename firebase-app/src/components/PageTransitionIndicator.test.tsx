// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PageTransitionIndicator } from './PageTransitionIndicator'
import { PAGE_TRANSITION_VISIBLE_MS } from './pageTransitionLogic'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('PageTransitionIndicator', () => {
  it('stays inactive until a tracked navigation event fires', () => {
    render(<PageTransitionIndicator />)
    expect(screen.getByTestId('page-transition-bar').className).not.toContain('page-transition-bar-active')
  })

  it('activates on a tracked navigation event and auto-hides after the brief window', async () => {
    vi.useFakeTimers()
    render(<PageTransitionIndicator />)

    act(() => { window.dispatchEvent(new Event('nextgen:dashboard-tab')) })
    expect(screen.getByTestId('page-transition-bar').className).toContain('page-transition-bar-active')

    await act(async () => { await vi.advanceTimersByTimeAsync(PAGE_TRANSITION_VISIBLE_MS) })
    expect(screen.getByTestId('page-transition-bar').className).not.toContain('page-transition-bar-active')
  })

  it('ignores events outside the tracked navigation list', () => {
    render(<PageTransitionIndicator />)
    act(() => { window.dispatchEvent(new Event('nextgen:user-updated')) })
    expect(screen.getByTestId('page-transition-bar').className).not.toContain('page-transition-bar-active')
  })

  it('restarts the hide timer instead of stacking it when events fire back-to-back', async () => {
    vi.useFakeTimers()
    render(<PageTransitionIndicator />)

    act(() => { window.dispatchEvent(new Event('nextgen:open-lesson')) })
    await act(async () => { await vi.advanceTimersByTimeAsync(PAGE_TRANSITION_VISIBLE_MS - 100) })
    act(() => { window.dispatchEvent(new Event('nextgen:start-battle')) })
    await act(async () => { await vi.advanceTimersByTimeAsync(200) })

    // Still active: the second event should have pushed the hide deadline out.
    expect(screen.getByTestId('page-transition-bar').className).toContain('page-transition-bar-active')
  })
})
