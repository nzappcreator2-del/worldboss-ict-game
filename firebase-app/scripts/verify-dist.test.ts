import { describe, expect, it } from 'vitest'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { verifyDistribution, MAX_JS_CHUNK_BYTES } from './verify-dist.mjs'

function withDistFixture(run: (distRoot: string) => void) {
  const distRoot = join(tmpdir(), `nextgen-play-dist-${crypto.randomUUID()}`)

  try {
    mkdirSync(join(distRoot, 'world-boss', 'mario-game'), { recursive: true })
    mkdirSync(join(distRoot, 'assets'), { recursive: true })
    writeFileSync(join(distRoot, 'index.html'), '<link rel="stylesheet" href="/assets/index.css"><div id="root"></div>')
    writeFileSync(join(distRoot, 'world-boss', 'fitness.html'), '<!doctype html>')
    writeFileSync(join(distRoot, 'world-boss', 'neck_quiz.html'), '<!doctype html>')
    writeFileSync(join(distRoot, 'world-boss', 'mario-game', 'index.html'), '<!doctype html>')
    writeFileSync(join(distRoot, 'assets', 'index.js'), 'console.log("ok")')
    writeFileSync(join(distRoot, 'assets', 'index.css'), '.flex{display:flex}')
    writeFileSync(join(distRoot, 'sw.js'), 'self.addEventListener("fetch", () => {})')
    writeFileSync(join(distRoot, 'asset-warmup.json'), '{"version":1,"assets":[]}')
    run(distRoot)
  } finally {
    rmSync(distRoot, { recursive: true, force: true })
  }
}

describe('verifyDistribution', () => {
  it('accepts a valid Firebase Hosting distribution fixture', () => {
    withDistFixture((distRoot) => {
      expect(verifyDistribution(distRoot).issues).toEqual([])
    })
  })

  it('rejects forbidden legacy/server patterns in text artifacts', () => {
    withDistFixture((distRoot) => {
      writeFileSync(join(distRoot, 'assets', 'index.js'), 'google.script.run.withSuccessHandler(done)')

      expect(verifyDistribution(distRoot).issues).toContain(
        'Forbidden legacy/server pattern /google\\.script\\.run/ found in assets\\index.js',
      )
    })
  })

  it('rejects JavaScript chunks above the deploy size budget', () => {
    withDistFixture((distRoot) => {
      writeFileSync(join(distRoot, 'assets', 'too-large.js'), 'x'.repeat(MAX_JS_CHUNK_BYTES + 1))

      expect(verifyDistribution(distRoot).issues).toContain('JavaScript chunk exceeds 500 KiB: assets\\too-large.js')
    })
  })

  it('rejects a distribution that still loads Tailwind from the runtime CDN', () => {
    withDistFixture((distRoot) => {
      writeFileSync(join(distRoot, 'index.html'), '<script src="https://cdn.tailwindcss.com"></script><div id="root"></div>')

      expect(verifyDistribution(distRoot).issues).toContain(
        'Production index.html must use the local CSS bundle instead of cdn.tailwindcss.com.',
      )
    })
  })

  it('rejects a distribution missing the service worker or warm-up manifest', () => {
    withDistFixture((distRoot) => {
      rmSync(join(distRoot, 'sw.js'))
      rmSync(join(distRoot, 'asset-warmup.json'))

      expect(verifyDistribution(distRoot).issues).toEqual(expect.arrayContaining([
        'Missing required build artifact: sw.js',
        'Missing required build artifact: asset-warmup.json',
      ]))
    })
  })

  it('rejects a distribution without a local stylesheet bundle', () => {
    withDistFixture((distRoot) => {
      writeFileSync(join(distRoot, 'index.html'), '<div id="root"></div>')

      expect(verifyDistribution(distRoot).issues).toContain(
        'Production index.html does not reference a local CSS bundle.',
      )
    })
  })
})
