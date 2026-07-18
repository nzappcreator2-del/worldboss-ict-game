// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mockPreload = vi.fn()
vi.mock('./useCriticalResourcePreload', () => ({
  useCriticalResourcePreload: () => mockPreload(),
}))
vi.mock('./App', () => ({
  default: () => <div data-testid="real-app">app</div>,
}))

const { default: AppLoadingGate } = await import('./AppLoadingGate')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('AppLoadingGate', () => {
  it('mounts the real app immediately and shows the loading screen on top while not ready', () => {
    mockPreload.mockReturnValue({ progress: 30, ready: false })
    render(<AppLoadingGate />)

    expect(screen.getByTestId('real-app')).toBeTruthy()
    expect(screen.getByText('30%')).toBeTruthy()
    expect(screen.getByRole('status').className).not.toContain('app-loading-screen-fading')
  })

  it('fades the loading screen out once resources are ready, then removes it from the DOM', async () => {
    vi.useFakeTimers()
    mockPreload.mockReturnValue({ progress: 100, ready: true })
    render(<AppLoadingGate />)

    expect(screen.getByRole('status').className).toContain('app-loading-screen-fading')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })

    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByTestId('real-app')).toBeTruthy()
  })
})
