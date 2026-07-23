import { describe, expect, it } from 'vitest'
import {
  orderWarmupAssets,
  parseWarmupManifest,
  shouldWarmup,
  warmupSequentially,
} from './assetWarmupLogic'

describe('parseWarmupManifest', () => {
  it('accepts a valid manifest and returns its asset paths', () => {
    const manifest = { version: 1, assets: ['/assets/a-x1.png', '/assets/b-x2.ogg'] }
    expect(parseWarmupManifest(manifest)).toEqual(['/assets/a-x1.png', '/assets/b-x2.ogg'])
  })

  it('drops entries that are not same-origin /assets/ paths', () => {
    const manifest = {
      version: 1,
      assets: [
        '/assets/ok-x1.png',
        'https://evil.example/steal.png',
        '/other/file.png',
        '//protocol-relative.example/x.png',
        42,
        null,
      ],
    }
    expect(parseWarmupManifest(manifest)).toEqual(['/assets/ok-x1.png'])
  })

  it('dedupes repeated paths', () => {
    const manifest = { version: 1, assets: ['/assets/a-x1.png', '/assets/a-x1.png'] }
    expect(parseWarmupManifest(manifest)).toEqual(['/assets/a-x1.png'])
  })

  it('returns an empty list for malformed manifests', () => {
    expect(parseWarmupManifest(null)).toEqual([])
    expect(parseWarmupManifest('not-an-object')).toEqual([])
    expect(parseWarmupManifest({ version: 1 })).toEqual([])
    expect(parseWarmupManifest({ version: 1, assets: 'nope' })).toEqual([])
  })
})

describe('orderWarmupAssets', () => {
  it('warms images first, then fonts, then audio, keeping order stable within groups', () => {
    const ordered = orderWarmupAssets([
      '/assets/music-a.ogg',
      '/assets/sprite-a.png',
      '/assets/font-a.woff2',
      '/assets/click.wav',
      '/assets/sprite-b.webp',
      '/assets/photo.jpg',
    ])
    expect(ordered).toEqual([
      '/assets/sprite-a.png',
      '/assets/sprite-b.webp',
      '/assets/photo.jpg',
      '/assets/font-a.woff2',
      '/assets/music-a.ogg',
      '/assets/click.wav',
    ])
  })
})

describe('shouldWarmup', () => {
  it('allows warmup on a normal connection', () => {
    expect(shouldWarmup({})).toBe(true)
    expect(shouldWarmup({ effectiveType: '4g' })).toBe(true)
    expect(shouldWarmup(undefined)).toBe(true)
  })

  it('skips warmup when the user asked to save data', () => {
    expect(shouldWarmup({ saveData: true })).toBe(false)
  })

  it('skips warmup on very slow connections', () => {
    expect(shouldWarmup({ effectiveType: '2g' })).toBe(false)
    expect(shouldWarmup({ effectiveType: 'slow-2g' })).toBe(false)
  })
})

describe('warmupSequentially', () => {
  it('fetches every asset one at a time, in order', async () => {
    const seen: string[] = []
    let inFlight = 0
    let maxInFlight = 0
    const result = await warmupSequentially(['/assets/a.png', '/assets/b.png'], async (path) => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      seen.push(path)
      await Promise.resolve()
      inFlight -= 1
    })

    expect(seen).toEqual(['/assets/a.png', '/assets/b.png'])
    expect(maxInFlight).toBe(1)
    expect(result).toEqual({ ok: 2, failed: 0 })
  })

  it('keeps going when a single asset fails', async () => {
    const result = await warmupSequentially(
      ['/assets/a.png', '/assets/broken.png', '/assets/c.png'],
      async (path) => {
        if (path.includes('broken')) throw new Error('network down')
      },
    )

    expect(result).toEqual({ ok: 2, failed: 1 })
  })

  it('resolves immediately for an empty list', async () => {
    expect(await warmupSequentially([], async () => {})).toEqual({ ok: 0, failed: 0 })
  })
})
