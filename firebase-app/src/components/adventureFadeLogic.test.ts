import { describe, expect, it } from 'vitest'
import { shouldFadeForDashboardTab, shouldFadeForPageChange } from './adventureFadeLogic'

describe('shouldFadeForPageChange', () => {
  it('fades for every scene in the adventure/lesson flow', () => {
    for (const pageId of ['map', 'lesson', 'pretest', 'boss-battle', 'worksheet', 'dashboard']) {
      expect(shouldFadeForPageChange(pageId)).toBe(true)
    }
  })

  it('does not fade for pages outside the adventure/lesson flow', () => {
    for (const pageId of ['landing', 'lobby', 'pvp', 'world-boss', 'cyber-safety', 'admin']) {
      expect(shouldFadeForPageChange(pageId)).toBe(false)
    }
  })
})

describe('shouldFadeForDashboardTab', () => {
  it('fades when entering the map tab', () => {
    expect(shouldFadeForDashboardTab('map', 'home')).toBe(true)
  })

  it('fades when leaving the map tab', () => {
    expect(shouldFadeForDashboardTab('home', 'map')).toBe(true)
  })

  it('does not fade between two non-map tabs', () => {
    expect(shouldFadeForDashboardTab('shop', 'home')).toBe(false)
  })

  it('does not fade when there is no previous tab and the target is not map', () => {
    expect(shouldFadeForDashboardTab('home', null)).toBe(false)
  })
})
