// Tiny WebAudio UI-cue player + a global hover/click delegate that covers
// every interactive control in the app (React-rendered or legacy-script
// DOM) from one place, instead of every component wiring its own handler.
//
// Three tiers, modeled on how production RPG menus separate these cues so
// they stay pleasant across hundreds of repeats instead of turning into
// noise: `hover` is a purely percussive filtered-noise tick (no pitch, so it
// never turns into "musical mush" while sweeping across a menu), `click` is
// a short pitched blip for the default press, and `confirm` is a fuller
// two-note chime with its own transient for the handful of "big commit"
// actions (entering a lesson, etc.) that opt in via `data-ui-sound="confirm"`.
// Every note also gets a slight downward pitch glide over its short life —
// a struck-bell/mallet character instead of a flat synth beep.
//
// Still synthesized on the fly (no audio assets, no licensing/bundle cost)
// and shares the same mute flag and silent-failure contract as
// soundFx.ts / gameAudio.ts — audio here is pure decoration and must never
// interrupt navigation or a click.

import { isSoundMuted } from './soundFx'

export type UiSoundName = 'hover' | 'click' | 'confirm'

type UiNote = { frequency: number; duration: number; delay: number }
type NoiseBurst = { duration: number; cutoff: number }
type UiCue = { notes: UiNote[]; gain: number; noiseBurst?: NoiseBurst }

export const UI_SOUNDS = {
  // Pointer hover over any button/link/control — deliberately toneless so
  // sweeping across a row of menu items reads as texture, not a melody.
  hover: {
    gain: 0.04,
    notes: [],
    noiseBurst: { duration: 0.015, cutoff: 5200 },
  },
  // The default press for every interactive control app-wide.
  click: {
    gain: 0.058,
    notes: [
      { frequency: 720, duration: 0.055, delay: 0 },
    ],
  },
  // Reserved for the handful of "big commit" actions (entering a lesson,
  // etc.) via data-ui-sound="confirm" — fuller two-note chime with its own
  // percussive transient under the attack.
  confirm: {
    gain: 0.085,
    notes: [
      { frequency: 587.33, duration: 0.09, delay: 0 },     // D5
      { frequency: 880, duration: 0.18, delay: 0.045 },    // A5
    ],
    noiseBurst: { duration: 0.02, cutoff: 3400 },
  },
} as const satisfies Record<string, UiCue>

type ContextFactory = () => AudioContext | null

const defaultFactory: ContextFactory = () => {
  const Ctor = window.AudioContext
    || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  return Ctor ? new Ctor() : null
}

function scheduleNote(audio: AudioContext, note: UiNote, cueGain: number, startsAt: number): void {
  const endsAt = startsAt + note.duration

  // Fundamental + a quiet octave-up layer reads as a single richer tone
  // instead of a bare sine, without needing a sampled instrument.
  const layers: Array<{ type: OscillatorType; frequency: number; level: number }> = [
    { type: 'sine', frequency: note.frequency, level: 1 },
    { type: 'triangle', frequency: note.frequency * 2, level: 0.22 },
  ]

  for (const layer of layers) {
    const oscillator = audio.createOscillator()
    const envelope = audio.createGain()
    const attackEndsAt = Math.min(endsAt, startsAt + 0.008)

    oscillator.type = layer.type
    oscillator.frequency.setValueAtTime(layer.frequency, startsAt)
    // A slight downward glide over the note's life reads as a struck
    // bell/mallet instead of a flat, static synth tone.
    oscillator.frequency.exponentialRampToValueAtTime(layer.frequency * 0.94, endsAt)

    // Short linear attack then an exponential release reads as a struck
    // note rather than the instant on/off of a plain step function.
    envelope.gain.setValueAtTime(0.0001, startsAt)
    envelope.gain.linearRampToValueAtTime(cueGain * layer.level, attackEndsAt)
    envelope.gain.exponentialRampToValueAtTime(0.0001, endsAt)

    oscillator.connect(envelope)
    envelope.connect(audio.destination)
    oscillator.start(startsAt)
    oscillator.stop(endsAt)
  }
}

function scheduleNoiseBurst(audio: AudioContext, burst: NoiseBurst, cueGain: number, startsAt: number): void {
  const sampleRate = audio.sampleRate || 44100
  const length = Math.max(1, Math.round(sampleRate * burst.duration))
  const buffer = audio.createBuffer(1, length, sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1

  const source = audio.createBufferSource()
  source.buffer = buffer

  const filter = audio.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(burst.cutoff, startsAt)

  const envelope = audio.createGain()
  const endsAt = startsAt + burst.duration
  envelope.gain.setValueAtTime(cueGain * 0.6, startsAt)
  envelope.gain.exponentialRampToValueAtTime(0.0001, endsAt)

  source.connect(filter)
  filter.connect(envelope)
  envelope.connect(audio.destination)
  source.start(startsAt)
  source.stop(endsAt)
}

// The factory is injected so scheduling logic is testable without real audio
// hardware.
export function createUiSoundPlayer(factory: ContextFactory = defaultFactory) {
  let context: AudioContext | null = null
  let unavailable = false

  // Built lazily: constructing an AudioContext before a user gesture is
  // blocked (and warned about) by browsers.
  const ensureContext = (): AudioContext | null => {
    if (unavailable) return null
    if (context) return context
    try {
      context = factory()
    } catch {
      context = null
    }
    if (!context) unavailable = true
    return context
  }

  return function play(name: UiSoundName): void {
    const cue = (UI_SOUNDS as Record<string, UiCue>)[name]
    if (!cue || isSoundMuted()) return
    try {
      const audio = ensureContext()
      if (!audio) return
      // A context created before the first gesture starts suspended.
      if (audio.state === 'suspended') void audio.resume()

      for (const note of cue.notes) scheduleNote(audio, note, cue.gain, audio.currentTime + note.delay)
      if (cue.noiseBurst) scheduleNoiseBurst(audio, cue.noiseBurst, cue.gain, audio.currentTime)
    } catch {
      // Audio is decoration: a failure here must never surface to the student.
    }
  }
}

export const playUiSound = createUiSoundPlayer()

// Every native button/link/form control app-wide, React-rendered or legacy
// script DOM alike — this is a plain DOM query selector, not a React
// concept, so it needs no per-component wiring.
const INTERACTIVE_SELECTOR = [
  'button',
  'a[href]',
  '[role="button"]',
  'input[type="button"]',
  'input[type="submit"]',
  'input[type="checkbox"]',
  'input[type="radio"]',
  'select',
].join(', ')

function isInteractiveDisabled(el: Element): boolean {
  if (
    el instanceof HTMLButtonElement
    || el instanceof HTMLInputElement
    || el instanceof HTMLSelectElement
  ) {
    return el.disabled
  }
  return el.getAttribute('aria-disabled') === 'true'
}

// A control can opt out entirely (data-ui-sound="none") or upgrade its
// click to the fuller confirm chime (data-ui-sound="confirm") without any
// JS wiring — see the "⚔️ บุกโจมตี!" enter-lesson button for the one place
// that currently uses it.
function resolveClickOverride(el: Element): UiSoundName | 'none' | undefined {
  const marker = el.closest('[data-ui-sound]')
  const value = marker?.getAttribute('data-ui-sound') ?? undefined
  if (value === 'none') return 'none'
  if (value === 'hover' || value === 'click' || value === 'confirm') return value
  return undefined
}

// Installed once for the whole app (see main.tsx). Listens in the capture
// phase so it always fires — even on controls (like the adventure-map
// lesson node) whose own onClick calls stopPropagation() during the bubble
// phase — and never calls preventDefault/stopPropagation itself, so it can
// never change how any existing click/hover behavior resolves.
export function installGlobalUiSoundDelegate(play: (name: UiSoundName) => void = playUiSound): () => void {
  let hoveredEl: Element | null = null

  const onPointerOver = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse') return
    const target = event.target
    if (!(target instanceof Element)) return
    const next = target.closest(INTERACTIVE_SELECTOR)
    if (!next || next === hoveredEl || isInteractiveDisabled(next)) return
    hoveredEl = next
    play('hover')
  }

  const onPointerOut = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse' || !hoveredEl) return
    const related = event.relatedTarget
    if (related instanceof Node && hoveredEl.contains(related)) return
    hoveredEl = null
  }

  const onClick = (event: MouseEvent) => {
    const target = event.target
    if (!(target instanceof Element)) return
    const interactive = target.closest(INTERACTIVE_SELECTOR)
    if (!interactive || isInteractiveDisabled(interactive)) return
    const override = resolveClickOverride(interactive)
    if (override === 'none') return
    play(override ?? 'click')
  }

  window.addEventListener('pointerover', onPointerOver, true)
  window.addEventListener('pointerout', onPointerOut, true)
  window.addEventListener('click', onClick, true)

  return () => {
    window.removeEventListener('pointerover', onPointerOver, true)
    window.removeEventListener('pointerout', onPointerOut, true)
    window.removeEventListener('click', onClick, true)
  }
}
