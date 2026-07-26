import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const appRoot = fileURLToPath(new URL('../', import.meta.url))
const css = readFileSync(`${appRoot}/src/index.css`, 'utf8')
const html = readFileSync(`${appRoot}/index.html`, 'utf8')

describe('cross-device viewport contract', () => {
  it('opts into safe-area layout and the dynamic mobile viewport', () => {
    expect(html).toContain('viewport-fit=cover')
    expect(css).toContain('--app-viewport-height: 100dvh')
    expect(css).toContain('env(safe-area-inset-top)')
    expect(css).toContain('env(safe-area-inset-right)')
    expect(css).toContain('env(safe-area-inset-bottom)')
    expect(css).toContain('env(safe-area-inset-left)')
  })

  it('has dedicated portrait and compact-landscape layout policies', () => {
    expect(css).toContain('@media (max-width: 640px) and (orientation: portrait)')
    expect(css).toContain('@media (max-height: 540px) and (orientation: landscape)')
    expect(css).toContain('.pvp-battle-screen')
    expect(css).toContain('.pvp-question-panel')
    expect(css).toContain('.pvp-room-panel')
  })

  it('ships separate optimized battle arenas for duel and team PVP', () => {
    expect(existsSync(`${appRoot}/src/assets/generated/pvp-duel-arena-v2.webp`)).toBe(true)
    expect(existsSync(`${appRoot}/src/assets/generated/pvp-team-arena-v2.webp`)).toBe(true)
  })

  it('keeps mobile hub signs in world space and reserves the bottom navigation clearance', () => {
    expect(css).toContain('--map-control-clearance: calc(112px + var(--safe-bottom))')
    expect(css).toMatch(/\.dashboard-board-stage\s*\{[^}]*top:\s*50%;[^}]*left:\s*50%;[^}]*width:\s*100%;[^}]*height:\s*100%;[^}]*translate\(-50%, -50%\)/s)
    expect(css).toContain('bottom: var(--map-control-clearance)')
  })

  it('keeps opened hub cards in viewport space above the transformed camera', () => {
    expect(css).toMatch(/\.teacher-quest-tracker\.on-hub\s*\{[^}]*position:\s*fixed;[^}]*z-index:\s*140;/s)
    expect(css).toMatch(/\.dashboard-detail-backdrop\s*\{[^}]*position:\s*fixed;[^}]*z-index:\s*200;/s)
  })

  it('matches the announcement copy to the painted frame tilt', () => {
    const matches = css.match(/\.dashboard-news-board\s*\{[^}]*--board-tilt:\s*6\.2deg;/gs) || []
    expect(matches).toHaveLength(2)
  })

  it('uses a compact phone login composition and removes the redundant mobile AUTO banner', () => {
    expect(css).toContain('--landing-phone-field-height: 62px')
    expect(css).toMatch(/@media \(max-width: 700px\)[\s\S]*?\.lesson-auto-chip\s*\{\s*display:\s*none;/)
  })

  // Regression guards for four phone-only defects reported from the field.
  it('hides the hall movement controls whenever another scene owns the screen', () => {
    // React parks them with Tailwind's bare `.hidden`, which ties on specificity
    // with the display rules here and loses because those come later — so the
    // hall joystick used to float on top of the adventure map and eat its touches.
    expect(css).toMatch(/\.dashboard-move-controls\.hidden,\s*\.dashboard-joystick-dock\.hidden\s*\{\s*display:\s*none;/)
  })

  it('keeps the in-lesson quest tracker a small corner card on a phone', () => {
    // The hub breakpoint anchors the tracker to `bottom`, the lesson variant to
    // `top`; with both live the card stretched down the whole screen.
    expect(css).toMatch(/\.teacher-quest-tracker\.on-lesson\s*\{\s*bottom:\s*auto;\s*\}/)
    expect(css).toMatch(/\.teacher-quest-tracker\.on-lesson\s*\{[^}]*width:\s*138px;/s)
    expect(css).toMatch(/\.teacher-quest-tracker\.on-lesson b\s*\{[^}]*-webkit-line-clamp:\s*2;/s)
    expect(css).toMatch(/\.teacher-quest-tracker\.on-lesson small\s*\{[^}]*white-space:\s*nowrap;/s)
    expect(css).toMatch(/\.teacher-quest-tracker\.on-lesson\.expanded\s*\{[^}]*max-height:\s*54vh;/s)
  })

  it('never lets the worksheet answer box trigger the mobile focus zoom', () => {
    // Below 16px mobile Safari zooms on focus, which pushed the field out of the
    // fixed worksheet layer and made it look like typing did nothing.
    const mobileWorksheet = css.slice(css.indexOf('@media (max-width: 760px)'))
    expect(mobileWorksheet).toMatch(/\.worksheet-answer-panel textarea\s*\{\s*font-size:\s*16px;/)
  })

  it('reserves most of a phone lesson modal for reading and compacts combat feedback', () => {
    const marker = '/* Mobile lesson reading and combat feedback'
    const mobilePolicy = css.slice(css.indexOf(marker))

    expect(css).toContain(marker)
    expect(mobilePolicy).toContain('@media (max-width: 700px)')
    expect(mobilePolicy).toMatch(/\.lesson-note-header\s*\{[^}]*flex:\s*0 0 auto;/s)
    expect(mobilePolicy).toMatch(/\.lesson-note-modal\s*\{[^}]*padding:\s*54px 12px 12px;/s)
    expect(mobilePolicy).toMatch(/\.lesson-note-header > h3\s*\{[^}]*font-size:\s*clamp\(23px, 5\.7vw, 26px\);/s)
    expect(mobilePolicy).toMatch(/\.lesson-note-modal > \.lesson-note-content\s*\{[^}]*flex:\s*1 1 auto;/s)
    expect(mobilePolicy).toMatch(/\.lesson-note-actions\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/s)
    expect(mobilePolicy).toMatch(/\.lesson-combo-badge\s*\{[^}]*font-size:\s*15px;/s)
    expect(mobilePolicy).toMatch(/\.lesson-level-up-burst\s*\{[^}]*max-width:\s*260px;/s)
  })
})
