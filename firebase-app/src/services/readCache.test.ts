import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cachedRead,
  clearReadCache,
  invalidateReadCache,
  invalidateReadCachePrefix,
  CONTENT_TTL_MS,
  DIRECTORY_TTL_MS,
  PROGRESS_TTL_MS,
} from './readCache'

describe('readCache', () => {
  beforeEach(() => {
    clearReadCache()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    clearReadCache()
  })

  it('returns the cached value without calling the loader again within the TTL', async () => {
    const loader = vi.fn(async () => 'first')
    expect(await cachedRead('k', 1000, loader)).toBe('first')
    // A second read inside the TTL is served from memory.
    loader.mockResolvedValueOnce('second')
    expect(await cachedRead('k', 1000, loader)).toBe('first')
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('re-runs the loader once the TTL has elapsed', async () => {
    const loader = vi.fn(async () => 'a')
    await cachedRead('k', 1000, loader)
    loader.mockResolvedValueOnce('b')
    vi.advanceTimersByTime(1001)
    expect(await cachedRead('k', 1000, loader)).toBe('b')
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('de-duplicates concurrent readers into a single loader call', async () => {
    let resolve!: (value: string) => void
    const loader = vi.fn(() => new Promise<string>((r) => { resolve = r }))
    const a = cachedRead('k', 1000, loader)
    const b = cachedRead('k', 1000, loader)
    expect(loader).toHaveBeenCalledTimes(1)
    resolve('shared')
    expect(await a).toBe('shared')
    expect(await b).toBe('shared')
  })

  it('does not cache or poison the key when the loader rejects', async () => {
    const loader = vi.fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce('recovered')
    await expect(cachedRead('k', 1000, loader)).rejects.toThrow('network')
    // The failure is not cached: the next call retries and succeeds.
    expect(await cachedRead('k', 1000, loader)).toBe('recovered')
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('invalidates a single key so the next read reloads', async () => {
    const loader = vi.fn(async () => 'x')
    await cachedRead('k', 10_000, loader)
    invalidateReadCache('k')
    loader.mockResolvedValueOnce('y')
    expect(await cachedRead('k', 10_000, loader)).toBe('y')
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('invalidates every key sharing a prefix', async () => {
    const l1 = vi.fn(async () => '1')
    const l2 = vi.fn(async () => '2')
    const other = vi.fn(async () => 'o')
    await cachedRead('questions:L1', 10_000, l1)
    await cachedRead('questions:L2', 10_000, l2)
    await cachedRead('lessons:content', 10_000, other)

    invalidateReadCachePrefix('questions:')

    await cachedRead('questions:L1', 10_000, l1)
    await cachedRead('questions:L2', 10_000, l2)
    await cachedRead('lessons:content', 10_000, other)

    expect(l1).toHaveBeenCalledTimes(2)
    expect(l2).toHaveBeenCalledTimes(2)
    // The unrelated key is untouched.
    expect(other).toHaveBeenCalledTimes(1)
  })

  it('clearReadCache empties every entry (e.g. on a new login)', async () => {
    const loader = vi.fn(async () => 'v')
    await cachedRead('progress:userA', 10_000, loader)
    clearReadCache()
    await cachedRead('progress:userA', 10_000, loader)
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('exposes tunable TTL constants for the three data classes', () => {
    expect(DIRECTORY_TTL_MS).toBeGreaterThan(0)
    expect(CONTENT_TTL_MS).toBeGreaterThanOrEqual(DIRECTORY_TTL_MS)
    expect(PROGRESS_TTL_MS).toBeGreaterThan(0)
  })
})
