import { orderWarmupAssets, parseWarmupManifest, shouldWarmup, warmupSequentially } from './assetWarmupLogic'

// Waits well past the loading screen (and the login screen's own fetches)
// before touching the network, so the warm-up never competes with boot-up.
const WARMUP_START_DELAY_MS = 8000
const MANIFEST_URL = '/asset-warmup.json'

type NavigatorWithConnection = Navigator & {
  connection?: { saveData?: boolean; effectiveType?: string }
}

function scheduleIdle(run: () => void): void {
  window.setTimeout(() => {
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(() => run(), { timeout: 10_000 })
    } else {
      run()
    }
  }, WARMUP_START_DELAY_MS)
}

async function runWarmup(): Promise<void> {
  try {
    const response = await fetch(MANIFEST_URL)
    if (!response.ok) return
    const manifest: unknown = await response.json()
    const paths = orderWarmupAssets(parseWarmupManifest(manifest))
    // Each fetch flows through the service worker's CacheFirst route (or the
    // immutable HTTP cache), so already-warm assets cost no network at all.
    await warmupSequentially(paths, (path) => fetch(path, { credentials: 'same-origin' }))
  } catch {
    // Warm-up is purely opportunistic — a failure must never surface.
  }
}

// Fire-and-forget: primes the cache with every bundled game asset so the next
// visit (or the next lesson/boss this session) loads instantly. No-op in dev,
// on Data Saver, and on very slow connections.
export function startAssetWarmup(): void {
  if (!import.meta.env.PROD) return
  const connection = (navigator as NavigatorWithConnection).connection
  if (!shouldWarmup(connection)) return
  scheduleIdle(() => { void runWarmup() })
}
