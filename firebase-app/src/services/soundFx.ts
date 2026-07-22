// Tiny WebAudio cue player for quest feedback (accept / turn-in / level-up).
//
// The game ships no audio assets, so these are synthesized on the fly: a few
// short sine-ish notes per cue. That keeps the bundle unchanged and avoids
// sourcing licensed sound files. Everything here degrades to silence rather
// than throwing — audio is decoration, and a browser that blocks it (autoplay
// policy, private mode, no WebAudio at all) must never break the quest flow.

export const SOUND_MUTE_KEY = 'nextgen-sound-muted'

export type SoundNote = { frequency: number; duration: number; delay: number }
export type SoundCue = { notes: SoundNote[]; gain: number }

// Rising arpeggios — the classic MMO "something good happened" shape.
export const QUEST_SOUNDS = {
  questAccept: {
    gain: 0.09,
    notes: [
      { frequency: 523.25, duration: 0.1, delay: 0 },      // C5
      { frequency: 659.25, duration: 0.14, delay: 0.09 },  // E5
    ],
  },
  questTurnIn: {
    gain: 0.11,
    notes: [
      { frequency: 523.25, duration: 0.1, delay: 0 },      // C5
      { frequency: 659.25, duration: 0.1, delay: 0.09 },   // E5
      { frequency: 783.99, duration: 0.1, delay: 0.18 },   // G5
      { frequency: 1046.5, duration: 0.26, delay: 0.27 },  // C6
    ],
  },
  levelUp: {
    gain: 0.12,
    notes: [
      { frequency: 659.25, duration: 0.1, delay: 0 },      // E5
      { frequency: 783.99, duration: 0.1, delay: 0.1 },    // G5
      { frequency: 1046.5, duration: 0.1, delay: 0.2 },    // C6
      { frequency: 1318.5, duration: 0.36, delay: 0.3 },   // E6
    ],
  },
} as const satisfies Record<string, SoundCue>

export type SoundName = keyof typeof QUEST_SOUNDS

export function isSoundMuted(): boolean {
  try {
    return localStorage.getItem(SOUND_MUTE_KEY) === '1'
  } catch {
    // Private-mode storage failures only cost the saved preference.
    return false
  }
}

export function setSoundMuted(muted: boolean): void {
  try {
    localStorage.setItem(SOUND_MUTE_KEY, muted ? '1' : '0')
  } catch {
    // Ignored: the toggle still works for the current session.
  }
}

type ContextFactory = () => AudioContext | null

const defaultFactory: ContextFactory = () => {
  const Ctor = window.AudioContext
    || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  return Ctor ? new Ctor() : null
}

// The factory is injected so the mute/scheduling logic is testable without real
// audio hardware.
export function createSoundPlayer(factory: ContextFactory = defaultFactory) {
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

  return function play(name: SoundName): void {
    const cue = QUEST_SOUNDS[name] as SoundCue | undefined
    if (!cue || isSoundMuted()) return
    try {
      const audio = ensureContext()
      if (!audio) return
      // A context created before the first gesture starts suspended.
      if (audio.state === 'suspended') void audio.resume()

      for (const note of cue.notes) {
        const oscillator = audio.createOscillator()
        const envelope = audio.createGain()
        const startsAt = audio.currentTime + note.delay
        const endsAt = startsAt + note.duration

        oscillator.type = 'triangle'
        oscillator.frequency.setValueAtTime(note.frequency, startsAt)
        // Fade each note out so the cue never clicks on release.
        envelope.gain.setValueAtTime(cue.gain, startsAt)
        envelope.gain.exponentialRampToValueAtTime(0.0001, endsAt)

        oscillator.connect(envelope)
        envelope.connect(audio.destination)
        oscillator.start(startsAt)
        oscillator.stop(endsAt)
      }
    } catch {
      // Audio is decoration: a failure here must never surface to the student.
    }
  }
}

export const playSound = createSoundPlayer()
