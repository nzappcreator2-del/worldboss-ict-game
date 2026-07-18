import { describe, expect, it, vi } from 'vitest'
import { clampProgress, progressFromStates, withTimeout } from './loadingScreenLogic'

describe('progressFromStates', () => {
  it('treats an empty resource list as fully loaded', () => {
    expect(progressFromStates([])).toBe(100)
  })

  it('reports 0 while every resource is still pending', () => {
    expect(progressFromStates(['pending', 'pending'])).toBe(0)
  })

  it('rounds the settled fraction as resources resolve', () => {
    expect(progressFromStates(['loaded', 'pending', 'pending'])).toBe(33)
    expect(progressFromStates(['loaded', 'loaded', 'pending'])).toBe(67)
  })

  it('counts a failed resource as settled, not stuck', () => {
    expect(progressFromStates(['loaded', 'failed'])).toBe(100)
  })
})

describe('clampProgress', () => {
  it('clamps below 0 and above 100', () => {
    expect(clampProgress(-20)).toBe(0)
    expect(clampProgress(140)).toBe(100)
  })

  it('passes values already in range through unchanged', () => {
    expect(clampProgress(42)).toBe(42)
  })

  it('treats NaN as 0 instead of propagating it to the UI', () => {
    expect(clampProgress(Number.NaN)).toBe(0)
  })
})

describe('withTimeout', () => {
  it('resolves once the wrapped promise resolves before the timeout', async () => {
    vi.useFakeTimers()
    let resolved = false
    const task = withTimeout(Promise.resolve(), 5000).then(() => { resolved = true })
    await vi.runAllTimersAsync()
    await task
    expect(resolved).toBe(true)
    vi.useRealTimers()
  })

  it('resolves anyway once the timeout elapses, even if the promise never settles', async () => {
    vi.useFakeTimers()
    let resolved = false
    const never = new Promise<void>(() => {})
    const task = withTimeout(never, 4000).then(() => { resolved = true })
    await vi.advanceTimersByTimeAsync(4000)
    await task
    expect(resolved).toBe(true)
    vi.useRealTimers()
  })
})
