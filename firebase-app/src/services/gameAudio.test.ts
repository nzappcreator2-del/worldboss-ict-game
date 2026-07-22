// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createGameAudioManager,
  MUSIC_TRACKS,
  musicForPage,
  type GameAudioElement,
} from './gameAudio'

function audioHarness() {
  const elements: Array<GameAudioElement & { play: ReturnType<typeof vi.fn>; pause: ReturnType<typeof vi.fn> }> = []
  const createAudio = vi.fn((src: string) => {
    const element = {
      src,
      volume: 1,
      loop: false,
      preload: '',
      currentTime: 0,
      play: vi.fn(() => Promise.resolve()),
      pause: vi.fn(),
    }
    elements.push(element)
    return element
  })
  return { createAudio, elements }
}

function frameHarness() {
  let now = 0
  let nextId = 0
  const callbacks = new Map<number, FrameRequestCallback>()
  return {
    now: () => now,
    requestFrame: (callback: FrameRequestCallback) => {
      nextId += 1
      callbacks.set(nextId, callback)
      return nextId
    },
    cancelFrame: (id: number) => callbacks.delete(id),
    advanceTo(value: number) {
      now = value
      const pending = [...callbacks.values()]
      callbacks.clear()
      for (const callback of pending) callback(now)
    },
  }
}

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('musicForPage', () => {
  it('maps login, adventure and boss pages while leaving unrelated modes silent', () => {
    expect(musicForPage('landing')).toBe('login')
    expect(musicForPage('lobby')).toBe('login')
    expect(musicForPage('dashboard')).toBe('adventure')
    expect(musicForPage('boss-battle')).toBe('bossBattle')
    expect(musicForPage('world-boss')).toBe('bossBattle')
    expect(musicForPage('pvp')).toBeNull()
    expect(musicForPage('cyber-safety')).toBeNull()
  })

  it('lets the lesson component choose its zone music without an incorrect intermediate switch', () => {
    expect(musicForPage('lesson')).toBeUndefined()
    expect(musicForPage('worksheet')).toBeUndefined()
  })
})

describe('createGameAudioManager', () => {
  it('can preload every registered music track without starting playback', () => {
    const audio = audioHarness()
    const manager = createGameAudioManager({ ...audio, ...frameHarness() })

    manager.prepare()

    expect(audio.elements).toHaveLength(Object.keys(MUSIC_TRACKS).length)
    expect(audio.elements.every((element) => element.preload === 'auto')).toBe(true)
    expect(audio.elements.every((element) => element.play.mock.calls.length === 0)).toBe(true)
  })

  it('does not restart music when another menu requests the same track', () => {
    const audio = audioHarness()
    const frames = frameHarness()
    const manager = createGameAudioManager({ ...audio, ...frames, fadeDurationMs: 1000 })

    manager.setMusic('login')
    frames.advanceTo(1000)
    manager.setMusic('login')

    expect(audio.createAudio).toHaveBeenCalledTimes(1)
    expect(audio.elements[0].play).toHaveBeenCalledTimes(1)
  })

  it('crossfades with both tracks audible, then releases the old track', () => {
    const audio = audioHarness()
    const frames = frameHarness()
    const manager = createGameAudioManager({ ...audio, ...frames, fadeDurationMs: 1000 })

    manager.setMusic('login')
    frames.advanceTo(1000)
    manager.setMusic('adventure')
    frames.advanceTo(1500)

    expect(audio.elements).toHaveLength(2)
    expect(audio.elements[0].volume).toBeGreaterThan(0)
    expect(audio.elements[1].volume).toBeGreaterThan(0)
    frames.advanceTo(2000)
    expect(audio.elements[0].pause).toHaveBeenCalledOnce()
    expect(audio.elements[0].currentTime).toBe(0)
    expect(audio.elements[1].volume).toBeGreaterThan(0)
  })

  it('creates a fresh effect voice for every sword strike so rapid attacks can overlap', () => {
    const audio = audioHarness()
    const manager = createGameAudioManager({ ...audio, ...frameHarness() })

    manager.playEffect('swordHit')
    manager.playEffect('swordHit')

    expect(audio.elements).toHaveLength(2)
    expect(audio.elements.every((element) => element.play.mock.calls.length === 1)).toBe(true)
    expect(audio.elements.every((element) => element.loop === false)).toBe(true)
  })

  it('fades out when muted and resumes the current page music when unmuted', () => {
    const audio = audioHarness()
    const frames = frameHarness()
    const manager = createGameAudioManager({ ...audio, ...frames, fadeDurationMs: 1000 })
    manager.setMusic('adventure')
    frames.advanceTo(1000)

    manager.setMuted(true)
    frames.advanceTo(2000)
    expect(audio.elements[0].pause).toHaveBeenCalledOnce()

    manager.setMuted(false)
    frames.advanceTo(3000)
    expect(audio.elements[0].play).toHaveBeenCalledTimes(2)
    expect(audio.elements[0].volume).toBeGreaterThan(0)
  })

  it('resumes the current login track before preloading later scene music on first interaction', () => {
    const events: string[] = []
    const createAudio = (src: string): GameAudioElement => {
      events.push(`create:${src}`)
      return {
        src,
        volume: 1,
        loop: false,
        preload: '',
        currentTime: 0,
        play: () => { events.push(`play:${src}`); return Promise.resolve() },
        pause: vi.fn(),
      }
    }
    const manager = createGameAudioManager({ createAudio, ...frameHarness() })
    manager.setMusic('login')
    events.length = 0

    manager.unlock()

    expect(events[0]).toBe(`play:${MUSIC_TRACKS.login.src}`)
  })

  it('degrades to silence when media playback is rejected by browser autoplay policy', async () => {
    const audio = audioHarness()
    audio.createAudio.mockImplementationOnce((src: string) => {
      const element = {
        src,
        volume: 1,
        loop: false,
        preload: '',
        currentTime: 0,
        play: vi.fn(() => Promise.reject(new Error('NotAllowedError'))),
        pause: vi.fn(),
      }
      audio.elements.push(element)
      return element
    })
    const manager = createGameAudioManager({ ...audio, ...frameHarness() })

    expect(() => manager.setMusic('login')).not.toThrow()
    await Promise.resolve()
    expect(() => manager.unlock()).not.toThrow()
  })

  it('stops and releases all active music during cleanup', () => {
    const audio = audioHarness()
    const manager = createGameAudioManager({ ...audio, ...frameHarness() })
    manager.setMusic('login')

    manager.dispose()

    expect(audio.elements[0].pause).toHaveBeenCalledOnce()
    expect(audio.elements[0].currentTime).toBe(0)
  })
})
