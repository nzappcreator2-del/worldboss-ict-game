export type ResourceState = 'pending' | 'loaded' | 'failed'

// Percentage of resources that have settled (loaded or failed) — a failed
// resource still counts as "done" so one flaky asset can't stall the bar.
export function progressFromStates(states: ResourceState[]): number {
  if (states.length === 0) return 100
  const settled = states.filter((state) => state !== 'pending').length
  return Math.round((settled / states.length) * 100)
}

export function clampProgress(value: number): number {
  if (Number.isNaN(value)) return 0
  return Math.min(100, Math.max(0, value))
}

// Races a resource-loading promise against a timeout so a slow/broken asset
// never blocks the loading screen from finishing.
export function withTimeout(promise: Promise<void>, ms: number): Promise<void> {
  return Promise.race([
    promise,
    new Promise<void>((resolve) => setTimeout(resolve, ms)),
  ])
}
