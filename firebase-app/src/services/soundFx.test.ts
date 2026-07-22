// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  SOUND_MUTE_KEY,
  QUEST_SOUNDS,
  createSoundPlayer,
  isSoundMuted,
  setSoundMuted,
} from './soundFx'

// Minimal stand-in for the pieces of WebAudio the player touches. Recording the
// scheduled frequencies lets the note tables be asserted without real audio.
function fakeAudio() {
  const played: Array<{ frequency: number; startsAt: number; type: string }> = []
  const context = {
    state: 'running' as string,
    currentTime: 0,
    destination: {},
    resume: vi.fn(),
    createOscillator: () => {
      const node = {
        type: 'sine',
        frequency: { value: 0, setValueAtTime: vi.fn() },
        connect: vi.fn(),
        start: vi.fn((at: number) => { node.startedAt = at }),
        stop: vi.fn(),
        startedAt: 0,
      }
      return node
    },
    createGain: () => ({
      gain: { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
      connect: vi.fn(),
    }),
  }
  return { context, played }
}

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('sound mute preference', () => {
  it('defaults to unmuted', () => {
    expect(isSoundMuted()).toBe(false)
  })

  it('round-trips through storage so the choice survives a reload', () => {
    setSoundMuted(true)
    expect(localStorage.getItem(SOUND_MUTE_KEY)).toBe('1')
    expect(isSoundMuted()).toBe(true)
    setSoundMuted(false)
    expect(isSoundMuted()).toBe(false)
  })

  it('treats unreadable storage as unmuted rather than throwing', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('private mode') })
    expect(isSoundMuted()).toBe(false)
  })

  it('never throws when storage refuses a write', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
    expect(() => setSoundMuted(true)).not.toThrow()
  })
})

describe('createSoundPlayer', () => {
  it('schedules one oscillator per note in the cue', () => {
    const { context } = fakeAudio()
    const created = vi.spyOn(context, 'createOscillator')
    const play = createSoundPlayer(() => context as unknown as AudioContext)

    play('questTurnIn')
    expect(created).toHaveBeenCalledTimes(QUEST_SOUNDS.questTurnIn.notes.length)
  })

  it('plays nothing while muted', () => {
    const { context } = fakeAudio()
    const created = vi.spyOn(context, 'createOscillator')
    const play = createSoundPlayer(() => context as unknown as AudioContext)

    setSoundMuted(true)
    play('questAccept')
    expect(created).not.toHaveBeenCalled()
  })

  it('degrades silently when the browser has no WebAudio', () => {
    const play = createSoundPlayer(() => null)
    expect(() => play('questAccept')).not.toThrow()
  })

  it('degrades silently when constructing the context throws', () => {
    const play = createSoundPlayer(() => { throw new Error('blocked by autoplay policy') })
    expect(() => play('levelUp')).not.toThrow()
  })

  it('builds the audio context lazily — never before the first cue', () => {
    const factory = vi.fn(() => fakeAudio().context as unknown as AudioContext)
    const play = createSoundPlayer(factory)
    expect(factory).not.toHaveBeenCalled()
    play('questAccept')
    expect(factory).toHaveBeenCalledOnce()
  })

  it('reuses one audio context across cues instead of leaking a new one each time', () => {
    const factory = vi.fn(() => fakeAudio().context as unknown as AudioContext)
    const play = createSoundPlayer(factory)
    play('questAccept')
    play('questTurnIn')
    play('levelUp')
    expect(factory).toHaveBeenCalledOnce()
  })

  it('resumes a context the browser suspended before the first gesture', () => {
    const { context } = fakeAudio()
    context.state = 'suspended'
    const play = createSoundPlayer(() => context as unknown as AudioContext)
    play('questAccept')
    expect(context.resume).toHaveBeenCalled()
  })

  it('ignores an unknown cue name', () => {
    const { context } = fakeAudio()
    const created = vi.spyOn(context, 'createOscillator')
    const play = createSoundPlayer(() => context as unknown as AudioContext)
    play('nope' as never)
    expect(created).not.toHaveBeenCalled()
  })
})

describe('QUEST_SOUNDS', () => {
  it('gives every cue a rising, audible motif', () => {
    for (const cue of Object.values(QUEST_SOUNDS)) {
      expect(cue.notes.length).toBeGreaterThan(0)
      for (const note of cue.notes) {
        expect(note.frequency).toBeGreaterThan(100)
        expect(note.frequency).toBeLessThan(4000)
        expect(note.duration).toBeGreaterThan(0)
      }
    }
  })
})
