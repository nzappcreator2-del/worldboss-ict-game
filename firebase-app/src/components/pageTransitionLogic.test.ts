import { describe, expect, it } from 'vitest'
import { PAGE_TRANSITION_EVENTS, PAGE_TRANSITION_VISIBLE_MS } from './pageTransitionLogic'

describe('pageTransitionLogic', () => {
  it('lists each tracked navigation event exactly once', () => {
    expect(PAGE_TRANSITION_EVENTS.length).toBeGreaterThan(0)
    expect(new Set(PAGE_TRANSITION_EVENTS).size).toBe(PAGE_TRANSITION_EVENTS.length)
    for (const name of PAGE_TRANSITION_EVENTS) expect(name.startsWith('nextgen:')).toBe(true)
  })

  it('keeps the visible duration short enough to read as a brief cue, not a real load', () => {
    expect(PAGE_TRANSITION_VISIBLE_MS).toBeGreaterThan(200)
    expect(PAGE_TRANSITION_VISIBLE_MS).toBeLessThan(1500)
  })
})
