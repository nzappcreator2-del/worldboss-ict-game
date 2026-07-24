import loginThemeUrl from '../assets/audio/login-theme.ogg'
import adventureThemeUrl from '../assets/audio/adventure-theme.ogg'
import monsterBattleThemeUrl from '../assets/audio/monster-battle-theme.ogg'
import bossBattleThemeUrl from '../assets/audio/boss-battle-theme.ogg'
import swordHitUrl from '../assets/audio/sword-hit.wav'
import { isSoundMuted } from './soundFx'

export const MUSIC_TRACKS = {
  login: { src: loginThemeUrl, volume: 0.34 },
  adventure: { src: adventureThemeUrl, volume: 0.32 },
  monsterBattle: { src: monsterBattleThemeUrl, volume: 0.36 },
  bossBattle: { src: bossBattleThemeUrl, volume: 0.38 },
} as const

export const GAME_EFFECTS = {
  swordHit: { src: swordHitUrl, volume: 0.52 },
} as const

export type MusicTrackName = keyof typeof MUSIC_TRACKS
export type GameEffectName = keyof typeof GAME_EFFECTS
export type PvpAudioScene = 'select' | 'joining' | 'lobby' | 'battle' | 'result' | 'error'

export type GameAudioElement = {
  src: string
  volume: number
  loop: boolean
  preload: string
  currentTime: number
  play(): Promise<void> | void
  pause(): void
}

type MusicVoice = {
  name: MusicTrackName
  element: GameAudioElement
  targetVolume: number
}

type GameAudioOptions = {
  createAudio?(src: string): GameAudioElement
  requestFrame?(callback: FrameRequestCallback): number
  cancelFrame?(id: number): void
  now?(): number
  isMuted?(): boolean
  fadeDurationMs?: number
}

const defaultCreateAudio = (src: string): GameAudioElement => {
  // jsdom intentionally has no media backend and reports every play() call as
  // an error. A silent voice keeps component tests deterministic without
  // changing the real browser path.
  if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) {
    return {
      src,
      volume: 1,
      loop: false,
      preload: '',
      currentTime: 0,
      play: () => Promise.resolve(),
      pause: () => undefined,
    }
  }
  return new Audio(src)
}
const defaultRequestFrame = (callback: FrameRequestCallback) => window.requestAnimationFrame(callback)
const defaultCancelFrame = (id: number) => window.cancelAnimationFrame(id)
const defaultNow = () => performance.now()

function safePlay(element: GameAudioElement): void {
  try {
    const result = element.play()
    if (result && typeof result.catch === 'function') void result.catch(() => undefined)
  } catch {
    // Sound must never interrupt navigation or combat when media is blocked.
  }
}

function release(element: GameAudioElement): void {
  try {
    element.pause()
    element.currentTime = 0
  } catch {
    // A detached or partially initialized media element is already harmless.
  }
}

export function createGameAudioManager(options: GameAudioOptions = {}) {
  const createAudio = options.createAudio ?? defaultCreateAudio
  const requestFrame = options.requestFrame ?? defaultRequestFrame
  const cancelFrame = options.cancelFrame ?? defaultCancelFrame
  const now = options.now ?? defaultNow
  const muted = options.isMuted ?? isSoundMuted
  const fadeDurationMs = Math.max(0, options.fadeDurationMs ?? 900)
  const voices = new Set<MusicVoice>()
  const preparedMusic = new Map<MusicTrackName, GameAudioElement>()
  let desiredMusic: MusicTrackName | null = null
  let currentVoice: MusicVoice | null = null
  let fadeFrame: number | null = null
  let unlocked = false
  let sessionMuted: boolean | null = null

  const isMuted = () => sessionMuted ?? muted()

  const prepareTrack = (name: MusicTrackName): GameAudioElement | null => {
    const cached = preparedMusic.get(name)
    if (cached) return cached
    try {
      const element = createAudio(MUSIC_TRACKS[name].src)
      element.loop = true
      element.preload = 'auto'
      element.volume = 0
      preparedMusic.set(name, element)
      return element
    } catch {
      return null
    }
  }

  const prepare = () => {
    for (const name of Object.keys(MUSIC_TRACKS) as MusicTrackName[]) prepareTrack(name)
  }

  const stopFade = () => {
    if (fadeFrame !== null) cancelFrame(fadeFrame)
    fadeFrame = null
  }

  const fadeTo = (next: MusicVoice | null) => {
    stopFade()
    const starts = new Map([...voices].map((voice) => [voice, voice.element.volume]))
    const startedAt = now()

    const update = () => {
      const elapsed = now() - startedAt
      const progress = fadeDurationMs === 0 ? 1 : Math.min(1, Math.max(0, elapsed / fadeDurationMs))
      const fadeIn = Math.sin(progress * Math.PI / 2)
      const fadeOut = Math.cos(progress * Math.PI / 2)

      for (const voice of voices) {
        voice.element.volume = voice === next
          ? voice.targetVolume * fadeIn
          : (starts.get(voice) ?? voice.element.volume) * fadeOut
      }

      if (progress < 1) {
        fadeFrame = requestFrame(update)
        return
      }

      fadeFrame = null
      for (const voice of [...voices]) {
        if (voice === next) continue
        release(voice.element)
        voices.delete(voice)
      }
      if (!next) currentVoice = null
    }

    update()
  }

  const startDesiredMusic = () => {
    if (!desiredMusic || isMuted()) {
      currentVoice = null
      fadeTo(null)
      return
    }
    if (currentVoice?.name === desiredMusic && voices.has(currentVoice)) return

    const config = MUSIC_TRACKS[desiredMusic]
    try {
      const element = prepareTrack(desiredMusic)
      if (!element) return
      const voice: MusicVoice = { name: desiredMusic, element, targetVolume: config.volume }
      voices.add(voice)
      currentVoice = voice
      safePlay(element)
      fadeTo(voice)
    } catch {
      currentVoice = null
      // Unsupported media formats and constructor failures degrade to silence.
    }
  }

  return {
    prepare,

    setMusic(name: MusicTrackName | null): void {
      if (desiredMusic === name && (name === null || currentVoice?.name === name)) return
      desiredMusic = name
      startDesiredMusic()
    },

    playEffect(name: GameEffectName): void {
      if (isMuted()) return
      const config = GAME_EFFECTS[name]
      if (!config) return
      try {
        // Effects intentionally use separate elements so rapid attacks overlap.
        const element = createAudio(config.src)
        element.loop = false
        element.preload = 'auto'
        element.volume = config.volume
        safePlay(element)
      } catch {
        // Audio is decorative and cannot be allowed to break a game action.
      }
    },

    unlock(): void {
      if (!unlocked) unlocked = true
      if (isMuted()) return
      if (!currentVoice && desiredMusic) {
        startDesiredMusic()
      } else if (currentVoice) {
        safePlay(currentVoice.element)
      }
      // Warm future scenes only after the current track has been resumed, so
      // login feedback wins the first-interaction critical path.
      prepare()
    },

    setMuted(nextMuted: boolean): void {
      sessionMuted = nextMuted
      if (nextMuted) {
        fadeTo(null)
        return
      }
      prepare()
      startDesiredMusic()
    },

    dispose(): void {
      stopFade()
      for (const element of preparedMusic.values()) release(element)
      voices.clear()
      preparedMusic.clear()
      currentVoice = null
      desiredMusic = null
      sessionMuted = null
    },
  }
}

// undefined means "preserve the current contextual music". This is useful for
// lesson overlays such as worksheets; the LessonPage owns its zone 1/2/3 cue.
export function musicForPage(pageId: string): MusicTrackName | null | undefined {
  if (pageId === 'landing' || pageId === 'lobby') return 'login'
  if (pageId === 'dashboard') return 'adventure'
  if (pageId === 'boss-battle' || pageId === 'world-boss') return 'bossBattle'
  if (pageId === 'lesson' || pageId === 'worksheet' || pageId === 'pretest') return undefined
  return null
}

export const gameAudio = createGameAudioManager()

export function setLessonMusic(zone: number): void {
  gameAudio.setMusic(zone === 3 ? 'bossBattle' : 'monsterBattle')
}

export function musicForPvpScene(scene: PvpAudioScene): MusicTrackName {
  return scene === 'battle' || scene === 'result' ? 'bossBattle' : 'adventure'
}

export function setPvpMusic(scene: PvpAudioScene): void {
  gameAudio.setMusic(musicForPvpScene(scene))
}

export function playSwordHit(): void {
  gameAudio.playEffect('swordHit')
}

export function installGameAudioRouting(): () => void {
  const onPageChanged = (event: Event) => {
    const pageId = (event as CustomEvent<string>).detail
    const music = musicForPage(pageId)
    if (music !== undefined) gameAudio.setMusic(music)
  }
  const unlock = () => {
    gameAudio.unlock()
    window.removeEventListener('pointerdown', unlock, true)
    window.removeEventListener('keydown', unlock, true)
  }

  window.addEventListener('nextgen:page-changed', onPageChanged)
  window.addEventListener('pointerdown', unlock, true)
  window.addEventListener('keydown', unlock, true)
  gameAudio.setMusic('login')

  return () => {
    window.removeEventListener('nextgen:page-changed', onPageChanged)
    window.removeEventListener('pointerdown', unlock, true)
    window.removeEventListener('keydown', unlock, true)
    gameAudio.dispose()
  }
}
