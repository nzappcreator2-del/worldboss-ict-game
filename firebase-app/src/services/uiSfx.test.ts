// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { setSoundMuted } from './soundFx'
import { UI_SOUNDS, createUiSoundPlayer, installGlobalUiSoundDelegate } from './uiSfx'

// Minimal stand-in for the pieces of WebAudio the player touches, including
// the buffer/filter nodes the noise-burst transient needs.
function fakeAudio() {
  const context = {
    state: 'running' as string,
    currentTime: 0,
    sampleRate: 44100,
    destination: {},
    resume: vi.fn(),
    createOscillator: () => ({
      type: 'sine',
      frequency: { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    }),
    createGain: () => ({
      gain: { value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: vi.fn(),
    }),
    createBuffer: (_channels: number, length: number, sampleRate: number) => ({
      length,
      sampleRate,
      getChannelData: () => new Float32Array(length),
    }),
    createBufferSource: () => ({
      buffer: null,
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    }),
    createBiquadFilter: () => ({
      type: 'lowpass',
      frequency: { value: 0, setValueAtTime: vi.fn() },
      connect: vi.fn(),
    }),
  }
  return { context }
}

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('createUiSoundPlayer', () => {
  it('schedules two oscillator layers per note (fundamental + octave-up)', () => {
    const { context } = fakeAudio()
    const created = vi.spyOn(context, 'createOscillator')
    const play = createUiSoundPlayer(() => context as unknown as AudioContext)

    play('click')
    expect(created).toHaveBeenCalledTimes(UI_SOUNDS.click.notes.length * 2)
  })

  it('schedules a filtered noise burst for cues that define one', () => {
    const { context } = fakeAudio()
    const buffer = vi.spyOn(context, 'createBuffer')
    const filter = vi.spyOn(context, 'createBiquadFilter')
    const play = createUiSoundPlayer(() => context as unknown as AudioContext)

    play('confirm')
    expect(buffer).toHaveBeenCalledOnce()
    expect(filter).toHaveBeenCalledOnce()
  })

  it('plays the hover cue as a toneless noise tick only', () => {
    const { context } = fakeAudio()
    const oscillator = vi.spyOn(context, 'createOscillator')
    const buffer = vi.spyOn(context, 'createBuffer')
    const play = createUiSoundPlayer(() => context as unknown as AudioContext)

    play('hover')
    expect(oscillator).not.toHaveBeenCalled()
    expect(buffer).toHaveBeenCalledOnce()
  })

  it('plays nothing while muted', () => {
    const { context } = fakeAudio()
    const created = vi.spyOn(context, 'createOscillator')
    const play = createUiSoundPlayer(() => context as unknown as AudioContext)

    setSoundMuted(true)
    play('confirm')
    expect(created).not.toHaveBeenCalled()
  })

  it('degrades silently when the browser has no WebAudio', () => {
    const play = createUiSoundPlayer(() => null)
    expect(() => play('click')).not.toThrow()
  })

  it('degrades silently when constructing the context throws', () => {
    const play = createUiSoundPlayer(() => { throw new Error('blocked by autoplay policy') })
    expect(() => play('confirm')).not.toThrow()
  })

  it('builds the audio context lazily — never before the first cue', () => {
    const factory = vi.fn(() => fakeAudio().context as unknown as AudioContext)
    const play = createUiSoundPlayer(factory)
    expect(factory).not.toHaveBeenCalled()
    play('click')
    expect(factory).toHaveBeenCalledOnce()
  })

  it('reuses one audio context across cues instead of leaking a new one each time', () => {
    const factory = vi.fn(() => fakeAudio().context as unknown as AudioContext)
    const play = createUiSoundPlayer(factory)
    play('hover')
    play('click')
    play('confirm')
    expect(factory).toHaveBeenCalledOnce()
  })

  it('resumes a context the browser suspended before the first gesture', () => {
    const { context } = fakeAudio()
    context.state = 'suspended'
    const play = createUiSoundPlayer(() => context as unknown as AudioContext)
    play('click')
    expect(context.resume).toHaveBeenCalled()
  })

  it('ignores an unknown cue name', () => {
    const { context } = fakeAudio()
    const created = vi.spyOn(context, 'createOscillator')
    const play = createUiSoundPlayer(() => context as unknown as AudioContext)
    play('nope' as never)
    expect(created).not.toHaveBeenCalled()
  })
})

describe('UI_SOUNDS', () => {
  it('gives every cue an audible cue — a motif, a noise transient, or both', () => {
    for (const cue of Object.values(UI_SOUNDS)) {
      expect(cue.notes.length > 0 || ('noiseBurst' in cue && !!cue.noiseBurst)).toBe(true)
      for (const note of cue.notes) {
        expect(note.frequency).toBeGreaterThan(100)
        expect(note.frequency).toBeLessThan(4000)
        expect(note.duration).toBeGreaterThan(0)
      }
    }
  })
})

// jsdom has no PointerEvent constructor — build events by hand the same way
// VirtualJoystick.test.tsx does.
function firePointer(type: 'pointerover' | 'pointerout', el: Element, init: { pointerType: string; relatedTarget?: EventTarget | null }) {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.assign(event, init)
  el.dispatchEvent(event)
}

function fireClick(el: Element) {
  const event = new Event('click', { bubbles: true, cancelable: true })
  el.dispatchEvent(event)
}

describe('installGlobalUiSoundDelegate', () => {
  it('plays click on any button, link, or form control app-wide', () => {
    document.body.innerHTML = `
      <button id="btn">Go</button>
      <a id="link" href="/x">Link</a>
      <select id="sel"><option>a</option></select>
    `
    const play = vi.fn()
    const dispose = installGlobalUiSoundDelegate(play)

    fireClick(document.getElementById('btn')!)
    fireClick(document.getElementById('link')!)
    fireClick(document.getElementById('sel')!)

    expect(play).toHaveBeenCalledTimes(3)
    expect(play).toHaveBeenCalledWith('click')
    dispose()
  })

  it('ignores clicks on disabled controls', () => {
    document.body.innerHTML = `<button id="btn" disabled>Go</button>`
    const play = vi.fn()
    const dispose = installGlobalUiSoundDelegate(play)

    fireClick(document.getElementById('btn')!)
    expect(play).not.toHaveBeenCalled()
    dispose()
  })

  it('ignores clicks on plain, non-interactive elements', () => {
    document.body.innerHTML = `<div id="card">Not a button</div>`
    const play = vi.fn()
    const dispose = installGlobalUiSoundDelegate(play)

    fireClick(document.getElementById('card')!)
    expect(play).not.toHaveBeenCalled()
    dispose()
  })

  it('upgrades a click to the confirm chime via data-ui-sound="confirm"', () => {
    document.body.innerHTML = `<button id="btn" data-ui-sound="confirm">⚔️</button>`
    const play = vi.fn()
    const dispose = installGlobalUiSoundDelegate(play)

    fireClick(document.getElementById('btn')!)
    expect(play).toHaveBeenCalledWith('confirm')
    dispose()
  })

  it('opts out entirely via data-ui-sound="none"', () => {
    document.body.innerHTML = `<button id="btn" data-ui-sound="none">Silent</button>`
    const play = vi.fn()
    const dispose = installGlobalUiSoundDelegate(play)

    fireClick(document.getElementById('btn')!)
    expect(play).not.toHaveBeenCalled()
    dispose()
  })

  it('still fires even when the control\'s own bubble handler calls stopPropagation', () => {
    document.body.innerHTML = `<button id="btn">Go</button>`
    const btn = document.getElementById('btn')!
    btn.addEventListener('click', (event) => event.stopPropagation())
    const play = vi.fn()
    const dispose = installGlobalUiSoundDelegate(play)

    fireClick(btn)
    expect(play).toHaveBeenCalledWith('click')
    dispose()
  })

  it('plays hover once on entering a control from the mouse, not again while moving within it', () => {
    document.body.innerHTML = `<button id="btn"><span id="icon"></span>Go</button>`
    const play = vi.fn()
    const dispose = installGlobalUiSoundDelegate(play)
    const btn = document.getElementById('btn')!
    const icon = document.getElementById('icon')!

    firePointer('pointerover', btn, { pointerType: 'mouse' })
    firePointer('pointerover', icon, { pointerType: 'mouse' })
    expect(play).toHaveBeenCalledTimes(1)
    expect(play).toHaveBeenCalledWith('hover')
    dispose()
  })

  it('replays hover after the pointer truly leaves and re-enters the control', () => {
    document.body.innerHTML = `<button id="btn">Go</button><div id="outside"></div>`
    const play = vi.fn()
    const dispose = installGlobalUiSoundDelegate(play)
    const btn = document.getElementById('btn')!
    const outside = document.getElementById('outside')!

    firePointer('pointerover', btn, { pointerType: 'mouse' })
    firePointer('pointerout', btn, { pointerType: 'mouse', relatedTarget: outside })
    firePointer('pointerover', btn, { pointerType: 'mouse' })

    expect(play).toHaveBeenCalledTimes(2)
    dispose()
  })

  it('ignores touch-originated hover so taps do not double up with the click sound', () => {
    document.body.innerHTML = `<button id="btn">Go</button>`
    const play = vi.fn()
    const dispose = installGlobalUiSoundDelegate(play)

    firePointer('pointerover', document.getElementById('btn')!, { pointerType: 'touch' })
    expect(play).not.toHaveBeenCalled()
    dispose()
  })

  it('stops listening once disposed', () => {
    document.body.innerHTML = `<button id="btn">Go</button>`
    const play = vi.fn()
    const dispose = installGlobalUiSoundDelegate(play)
    dispose()

    fireClick(document.getElementById('btn')!)
    firePointer('pointerover', document.getElementById('btn')!, { pointerType: 'mouse' })
    expect(play).not.toHaveBeenCalled()
  })
})
