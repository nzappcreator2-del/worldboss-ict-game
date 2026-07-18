// window CustomEvents already dispatched by the legacy bridge (see
// vite.config.ts's nextGenLegacyBridge / showPage / showDashboardTab) and by
// DashboardShell whenever the player moves to a different page or dashboard
// tab. Listening to these — rather than adding new ones — lets the indicator
// track real navigation without any page having to opt in.
export const PAGE_TRANSITION_EVENTS = [
  'nextgen:login-complete',
  'nextgen:dashboard-tab',
  'nextgen:open-lesson',
  'nextgen:start-pretest',
  'nextgen:start-battle',
  'nextgen:open-worksheet',
  'nextgen:open-cyber-safety',
  'nextgen:open-pvp',
  'nextgen:open-world-boss',
  'nextgen:open-admin',
  'nextgen:open-hero-profile',
] as const

// Brief on purpose — this is a cosmetic transition cue, not a real progress
// measurement, so it should read as "something moved" and get out of the way.
export const PAGE_TRANSITION_VISIBLE_MS = 650
