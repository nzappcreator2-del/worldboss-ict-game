import { useEffect, useState } from 'react'
import { PAGE_TRANSITION_EVENTS, PAGE_TRANSITION_VISIBLE_MS } from './pageTransitionLogic'

// A slim top-of-screen bar that flashes briefly whenever the player
// navigates to a different page or dashboard tab — a lightweight "something
// is loading" cue without needing every page to report its own fetch state.
export function PageTransitionIndicator() {
  const [active, setActive] = useState(false)

  useEffect(() => {
    let hideTimer: number | undefined
    const trigger = () => {
      window.clearTimeout(hideTimer)
      setActive(true)
      hideTimer = window.setTimeout(() => setActive(false), PAGE_TRANSITION_VISIBLE_MS)
    }
    for (const name of PAGE_TRANSITION_EVENTS) window.addEventListener(name, trigger)
    return () => {
      window.clearTimeout(hideTimer)
      for (const name of PAGE_TRANSITION_EVENTS) window.removeEventListener(name, trigger)
    }
  }, [])

  return (
    <div
      className={`page-transition-bar${active ? ' page-transition-bar-active' : ''}`}
      role="status"
      aria-hidden={!active}
      data-testid="page-transition-bar"
    >
      <span className="page-transition-bar-fill" />
    </div>
  )
}
