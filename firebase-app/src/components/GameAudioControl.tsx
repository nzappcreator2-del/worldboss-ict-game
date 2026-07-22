import { useEffect, useState } from 'react'
import { gameAudio } from '../services/gameAudio'
import { isSoundMuted, setSoundMuted } from '../services/soundFx'

export function GameAudioControl() {
  const [muted, setMuted] = useState(isSoundMuted)
  const [page, setPage] = useState('landing')

  useEffect(() => {
    const onPageChanged = (event: Event) => setPage((event as CustomEvent<string>).detail || 'landing')
    window.addEventListener('nextgen:page-changed', onPageChanged)
    return () => window.removeEventListener('nextgen:page-changed', onPageChanged)
  }, [])

  const toggle = () => {
    const next = !muted
    setSoundMuted(next)
    gameAudio.setMuted(next)
    setMuted(next)
  }

  const label = muted ? 'เปิดเสียงเกม' : 'ปิดเสียงเกม'
  return (
    <button
      type="button"
      className={`game-audio-control${muted ? ' is-muted' : ''}`}
      data-page={page}
      aria-label={label}
      aria-pressed={muted}
      title={label}
      onClick={toggle}
    >
      <span className="game-audio-control-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M4 9.3v5.4h3.4l4.6 3.8v-13L7.4 9.3H4Z" />
          {muted ? (
            <path className="game-audio-control-wave" d="m16.2 9 4 4m0-4-4 4" />
          ) : (
            <path className="game-audio-control-wave" d="M15.3 8.2a5 5 0 0 1 0 7.6m2.3-10a8.3 8.3 0 0 1 0 12.4" />
          )}
        </svg>
      </span>
      <span className="game-audio-control-tooltip">{muted ? 'เสียงปิด' : 'เสียงเปิด'}</span>
    </button>
  )
}
