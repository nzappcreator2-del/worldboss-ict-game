// Pure event-filtering logic for AdventureFadeOverlay.tsx — kept separate so
// it's testable without rendering. The overlay listens to two navigation
// signals that already fire from legacy/DashboardShell code (see
// pageTransitionLogic.ts for the sibling top-bar indicator that listens to a
// different curated event list):
//
// - `nextgen:page-changed` (legacy showPage(), fired *after* it has already
//   swapped DOM classes) for top-level scene changes.
// - `nextgen:dashboard-tab` (DashboardShell's navigate()) for the React-owned
//   hub tabs, since entering/leaving the Adventure Map tab never triggers
//   showPage().
//
// Scope is limited to the Adventure Lesson flow the fade was requested for —
// login/lobby/pvp/admin/etc. keep their instant cut.

export const FADE_PAGE_IDS = new Set([
  'map',
  'lesson',
  'pretest',
  'boss-battle',
  'worksheet',
  'dashboard',
])

export function shouldFadeForPageChange(pageId: string): boolean {
  return FADE_PAGE_IDS.has(pageId)
}

export function shouldFadeForDashboardTab(tab: string, previousTab: string | null): boolean {
  return tab === 'map' || previousTab === 'map'
}

// Cosmetic pacing only, not a real load measurement — see
// PAGE_TRANSITION_VISIBLE_MS in pageTransitionLogic.ts for the sibling
// constant. Cover fast (the swap already happened), hold one frame so the
// new DOM has painted underneath, then reveal slower for a soft feel.
export const ADVENTURE_FADE_COVER_MS = 120
export const ADVENTURE_FADE_HOLD_MS = 80
export const ADVENTURE_FADE_REVEAL_MS = 380
