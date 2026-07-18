import { clampProgress } from './loadingScreenLogic'

type Props = {
  progress: number
  fading?: boolean
}

// Half the knight's rendered width (see .app-loading-knight in index.css) so
// the sprite is centered on its position along the track instead of leading it.
const KNIGHT_HALF_WIDTH_PX = 36

export function LoadingScreen({ progress, fading = false }: Props) {
  const percent = clampProgress(progress)

  return (
    <div
      className={`app-loading-screen${fading ? ' app-loading-screen-fading' : ''}`}
      role="status"
      aria-live="polite"
      aria-busy={percent < 100}
    >
      <div className="app-loading-backdrop" aria-hidden="true" />
      <div className="app-loading-panel">
        <p className="app-loading-eyebrow">NextGen Play</p>
        <h1 className="app-loading-title">กำลังเตรียมการผจญภัย...</h1>
        <div className="app-loading-track" data-testid="loading-track">
          <div className="app-loading-fill" style={{ width: `${percent}%` }} />
          <div
            className="app-loading-knight"
            data-testid="loading-knight"
            style={{ left: `calc(${percent}% - ${KNIGHT_HALF_WIDTH_PX}px)` }}
          />
        </div>
        <p className="app-loading-percent">{percent}%</p>
      </div>
    </div>
  )
}
