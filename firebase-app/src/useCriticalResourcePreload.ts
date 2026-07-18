import { useEffect, useState } from 'react'
import backgroundUrl from './assets/nextgen-adventure-background.png'
import { progressFromStates, withTimeout, type ResourceState } from './components/loadingScreenLogic'

// A slow/broken asset must never lock a student out of the login screen —
// each resource gets this long to settle before it's counted as done anyway.
const RESOURCE_TIMEOUT_MS = 4000
const PROMPT_FONT_PROBE = '700 16px Prompt'

function preloadImage(src: string): Promise<void> {
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => resolve()
    image.onerror = () => resolve()
    image.src = src
  })
}

function waitForFonts(): Promise<void> {
  const fonts = document.fonts
  if (!fonts) return Promise.resolve()
  const load = typeof fonts.load === 'function'
    ? fonts.load(PROMPT_FONT_PROBE).then(() => undefined).catch(() => undefined)
    : Promise.resolve()
  return Promise.all([fonts.ready.then(() => undefined), load]).then(() => undefined)
}

// Blocks the first paint only on what the landing page actually needs: the
// adventure background image and the Prompt font it's set in. Everything
// else (Firestore data, other pages' assets) loads on its own afterwards.
export function useCriticalResourcePreload() {
  const [states, setStates] = useState<ResourceState[]>(['pending', 'pending'])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    const settle = (index: number) => {
      if (cancelled) return
      setStates((current) => current.map((state, i) => (i === index ? 'loaded' : state)))
    }

    Promise.all([
      withTimeout(preloadImage(backgroundUrl), RESOURCE_TIMEOUT_MS).then(() => settle(0)),
      withTimeout(waitForFonts(), RESOURCE_TIMEOUT_MS).then(() => settle(1)),
    ]).then(() => {
      if (!cancelled) setReady(true)
    })

    return () => { cancelled = true }
  }, [])

  return { progress: progressFromStates(states), ready }
}
