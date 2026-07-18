import { useEffect, useState } from 'react'
import App from './App'
import { LoadingScreen } from './components/LoadingScreen'
import { useCriticalResourcePreload } from './useCriticalResourcePreload'

// Matches the CSS transition duration on .app-loading-screen-fading in index.css.
const FADE_OUT_MS = 400

// The real app mounts immediately underneath (so its own resource fetching —
// Firestore data, other pages' assets — starts right away and isn't delayed).
// This overlay just covers that boot-up with a branded screen until the
// landing page's own critical resources are ready, then fades out.
export default function AppLoadingGate() {
  const { progress, ready } = useCriticalResourcePreload()
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    if (!ready) return
    const timer = window.setTimeout(() => setHidden(true), FADE_OUT_MS)
    return () => window.clearTimeout(timer)
  }, [ready])

  return (
    <>
      <App />
      {!hidden && <LoadingScreen progress={progress} fading={ready} />}
    </>
  )
}
