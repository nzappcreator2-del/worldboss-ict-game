// Pure logic for the background asset warm-up: after the app boots, every
// bundled media file is fetched once (sequentially, at idle) so the service
// worker / HTTP cache is fully primed — returning students load nothing.

const AUDIO_PATTERN = /\.(ogg|wav|mp3)$/i
const FONT_PATTERN = /\.(woff2?)$/i

export type ConnectionHints = {
  saveData?: boolean
  effectiveType?: string
}

// The manifest is produced by the asset-warmup-manifest plugin in
// vite.config.ts. Only same-origin /assets/ paths are ever fetched — anything
// else in a (corrupted) manifest is discarded.
export function parseWarmupManifest(manifest: unknown): string[] {
  if (typeof manifest !== 'object' || manifest === null) return []
  const assets = (manifest as { assets?: unknown }).assets
  if (!Array.isArray(assets)) return []
  const paths = assets.filter(
    (entry): entry is string => typeof entry === 'string' && entry.startsWith('/assets/'),
  )
  return [...new Set(paths)]
}

// Sprites and backgrounds are what students see first; music is the largest
// and least urgent, so it downloads last.
export function orderWarmupAssets(paths: string[]): string[] {
  const images: string[] = []
  const fonts: string[] = []
  const audio: string[] = []
  for (const path of paths) {
    if (AUDIO_PATTERN.test(path)) audio.push(path)
    else if (FONT_PATTERN.test(path)) fonts.push(path)
    else images.push(path)
  }
  return [...images, ...fonts, ...audio]
}

// Respect Data Saver and very slow connections — warming ~40 MB of media on
// a 2G link would starve the actual gameplay requests.
export function shouldWarmup(connection: ConnectionHints | undefined): boolean {
  if (!connection) return true
  if (connection.saveData) return false
  const effectiveType = connection.effectiveType ?? ''
  if (effectiveType === '2g' || effectiveType === 'slow-2g') return false
  return true
}

// One request at a time keeps the warm-up from competing with real gameplay
// traffic; a failed asset is skipped, never retried, and never throws.
export async function warmupSequentially(
  paths: string[],
  fetchAsset: (path: string) => Promise<unknown>,
): Promise<{ ok: number; failed: number }> {
  let ok = 0
  let failed = 0
  for (const path of paths) {
    try {
      await fetchAsset(path)
      ok += 1
    } catch {
      failed += 1
    }
  }
  return { ok, failed }
}
