// Per-client read-through cache that collapses the repeated Firestore reads the
// app used to fire on every in-app navigation. NextGen Play is a single-page
// app that mounts once (see App.tsx), so an in-memory cache survives every
// map/rank/home/lesson switch within a session — which is where the read
// explosion came from. It is deliberately memory-only: a full page reload
// starts fresh, and clearReadCache() wipes it on login so a shared classroom
// device never serves one student's cached data to the next.
//
// Only "shared or slow-changing" collection reads are cached here (lessons,
// questions, directory/leaderboard, news, settings, quests, per-user progress).
// A student's own live user document is never cached, so coins/XP/HUD stay
// instant. This mirrors the existing invalidateAiConfigCache() pattern in
// aiApi.ts, generalized so every hot read can share it.

// Tunable freshness windows (one place to adjust). Chosen with the teacher:
// leaderboard/name lists may lag ~1.5 min; admin-edited content within ~5 min.
export const DIRECTORY_TTL_MS = 90_000
export const CONTENT_TTL_MS = 300_000
export const PROGRESS_TTL_MS = 60_000

type Entry = { value: unknown; expiresAt: number }

const memory = new Map<string, Entry>()
const inflight = new Map<string, Promise<unknown>>()

/**
 * Return the cached value for `key` if it is still fresh; otherwise run
 * `loader`, cache its result for `ttlMs`, and return it. Concurrent callers for
 * the same key share a single in-flight loader call, and a rejected loader is
 * never cached (the next call retries).
 */
export async function cachedRead<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const hit = memory.get(key)
  if (hit && hit.expiresAt > Date.now()) return hit.value as T

  const pending = inflight.get(key)
  if (pending) return pending as Promise<T>

  const task = (async () => {
    const value = await loader()
    memory.set(key, { value, expiresAt: Date.now() + ttlMs })
    return value
  })()
  inflight.set(key, task)
  try {
    return await task
  } finally {
    inflight.delete(key)
  }
}

/** Drop a single cached key so the next read reloads from Firestore. */
export function invalidateReadCache(key: string): void {
  memory.delete(key)
}

/** Drop every cached key beginning with `prefix` (e.g. all `questions:` reads). */
export function invalidateReadCachePrefix(prefix: string): void {
  for (const key of memory.keys()) {
    if (key.startsWith(prefix)) memory.delete(key)
  }
}

/** Wipe the whole cache — used on login/logout to isolate students on a shared device. */
export function clearReadCache(): void {
  memory.clear()
  inflight.clear()
}
