import { describe, expect, it } from 'vitest'
import { hasTrackableLessonVideo, isDirectLessonVideo, lessonVideoMessageEnded, toTrackedLessonEmbedUrl } from './lessonMedia'

describe('lesson video completion adapters', () => {
  it('enables the YouTube player API without discarding the configured video', () => {
    expect(toTrackedLessonEmbedUrl('https://youtu.be/dQw4w9WgXcQ', 'https://game.test')).toBe(
      'https://www.youtube.com/embed/dQw4w9WgXcQ?enablejsapi=1&origin=https%3A%2F%2Fgame.test',
    )
  })

  it('accepts only a YouTube ended event from a trusted origin', () => {
    const ended = JSON.stringify({ event: 'onStateChange', info: 0 })
    expect(lessonVideoMessageEnded('https://www.youtube.com', ended)).toBe(true)
    expect(lessonVideoMessageEnded('https://evil.test', ended)).toBe(false)
    expect(lessonVideoMessageEnded('https://www.youtube.com', JSON.stringify({ event: 'onStateChange', info: 1 }))).toBe(false)
    expect(lessonVideoMessageEnded('https://www.youtube.com', 'not-json')).toBe(false)
  })

  it('identifies direct video files that expose an ended event', () => {
    expect(isDirectLessonVideo('https://cdn.test/lesson.mp4?token=1')).toBe(true)
    expect(isDirectLessonVideo('https://youtube.com/watch?v=dQw4w9WgXcQ')).toBe(false)
  })

  it('distinguishes providers with a reliable completion event from generic embeds', () => {
    expect(hasTrackableLessonVideo('https://youtu.be/dQw4w9WgXcQ')).toBe(true)
    expect(hasTrackableLessonVideo('https://cdn.test/lesson.webm')).toBe(true)
    expect(hasTrackableLessonVideo('https://example.com/watch/lesson')).toBe(false)
  })
})
