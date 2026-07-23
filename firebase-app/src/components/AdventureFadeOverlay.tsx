import { useEffect, useRef, useState } from 'react'
import {
  ADVENTURE_FADE_COVER_MS,
  ADVENTURE_FADE_HOLD_MS,
  shouldFadeForDashboardTab,
  shouldFadeForPageChange,
} from './adventureFadeLogic'

// A full-viewport cover that flashes in and fades back out whenever the
// player crosses a scene boundary inside the Adventure Lesson flow (map,
// lesson, pretest, boss battle, worksheet, back to the hub). Legacy
// showPage() already swaps the underlying DOM synchronously before either
// listener below ever runs (see adventureFadeLogic.ts), so this never delays
// or reorders real navigation — it only smooths over the cut with a brief
// RPG-style scene-load flash. Purely decorative: pointer-events stay off so
// a mistimed frame can never eat a click.
export function AdventureFadeOverlay() {
  const [covering, setCovering] = useState(false)
  const previousTab = useRef<string | null>(null)
  const holdTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    const trigger = () => {
      window.clearTimeout(holdTimer.current)
      setCovering(true)
      holdTimer.current = window.setTimeout(
        () => setCovering(false),
        ADVENTURE_FADE_COVER_MS + ADVENTURE_FADE_HOLD_MS,
      )
    }

    const onPageChanged = (event: Event) => {
      const pageId = (event as CustomEvent<string>).detail
      if (shouldFadeForPageChange(pageId)) trigger()
    }

    const onDashboardTab = (event: Event) => {
      const tab = (event as CustomEvent<string>).detail
      if (shouldFadeForDashboardTab(tab, previousTab.current)) trigger()
      previousTab.current = tab
    }

    window.addEventListener('nextgen:page-changed', onPageChanged)
    window.addEventListener('nextgen:dashboard-tab', onDashboardTab)
    return () => {
      window.clearTimeout(holdTimer.current)
      window.removeEventListener('nextgen:page-changed', onPageChanged)
      window.removeEventListener('nextgen:dashboard-tab', onDashboardTab)
    }
  }, [])

  return (
    <div
      className={`adventure-fade-overlay${covering ? ' adventure-fade-overlay-active' : ''}`}
      aria-hidden="true"
      data-testid="adventure-fade-overlay"
    />
  )
}
