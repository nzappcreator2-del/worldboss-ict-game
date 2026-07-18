import { describe, expect, it } from 'vitest'
import { extractLegacyBody, migrateLegacyBackendCalls, migrateLegacyPageCss, removeElementById, replaceElementWithPortal, stripHtmlTag } from './legacyDocument'

describe('extractLegacyBody', () => {
  it('preserves the legacy body markup and removes GAS includes', () => {
    const html = '<body class="game"><main>เดิม</main><?!= include(\'JS_Auth\'); ?></body>'

    expect(extractLegacyBody(html)).toBe('<main>เดิม</main>')
  })

  it('rejects a document without a body', () => {
    expect(() => extractLegacyBody('<main>broken</main>')).toThrow('Legacy Index.html has no body')
  })
})

describe('stripHtmlTag', () => {
  it('unwraps style and script files copied from GAS', () => {
    expect(stripHtmlTag('<style>.game { color: red; }</style>', 'style')).toBe('.game { color: red; }')
    expect(stripHtmlTag('<script>window.ready = true;</script>', 'script')).toBe('window.ready = true;')
  })
})

describe('migrateLegacyBackendCalls', () => {
  it('routes GAS calls and availability checks to Firebase services', () => {
    const source = `
      if (typeof google !== 'undefined' && google.script && google.script.run) {
        google.script.run.withSuccessHandler(done).getLessons();
      } else if (typeof google === 'undefined') preview();
    `
    const migrated = migrateLegacyBackendCalls(source)

    expect(migrated).toContain('firebaseServices.withSuccessHandler(done).getLessons()')
    expect(migrated).toContain("typeof firebaseServices !== 'undefined'")
    expect(migrated).toContain("typeof firebaseServices === 'undefined'")
    expect(migrated).not.toContain('google.script')
  })
})

describe('migrateLegacyPageCss', () => {
  it('scopes the global section router rules to the legacy page shells', () => {
    const css = `
    /* ========== 3. Layouts & Navigation ========== */
    section {
        display: none;
        animation: fadeIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }

    section.page-active {
        display: flex;
    }`
    const migrated = migrateLegacyPageCss(css)

    expect(migrated).toContain(':where(section[id^="page-"]) {')
    expect(migrated).toContain(':where(section[id^="page-"].page-active) {')
    // React windows portaled to <body> (เช่น ตู้เสื้อผ้าในกระเป๋าไอเทม) render
    // their own <section> elements — the bare selector must be gone so they stay visible.
    expect(migrated).not.toMatch(/(^|[}/]|\*\/)\s*section\s*\{/)
    expect(migrated).not.toMatch(/(^|[}/]|\*\/)\s*section\.page-active/)
    expect(migrated).toContain('display: none;')
    expect(migrated).toContain('display: flex;')
  })

  it('keeps the scoped selector at zero specificity so a page\'s own display class always wins', () => {
    // #page-dashboard is rendered by React with a plain `.flex`/`.hidden` Tailwind
    // class controlling its display. A scoped-but-still-specific selector like
    // `section[id^="page-"]` (0,1,1) out-specifies a single class rule like
    // `.flex` (0,1,0) and would leave the whole dashboard stuck at display:none —
    // this is the exact regression :where() exists to prevent.
    const css = 'section {\n  display: none;\n}\n\nsection.page-active {\n  display: flex;\n}'
    const migrated = migrateLegacyPageCss(css)

    expect(migrated).not.toMatch(/(?<!:where\()section\[id\^="page-"\]/)
  })

  it('leaves descendant and unrelated selectors untouched', () => {
    const css = '.card section { color: red; } #quiz-section { display: none; }'

    expect(migrateLegacyPageCss(css)).toBe(css)
  })
})

describe('replaceElementWithPortal', () => {
  it('replaces the legacy landing section without touching the lobby', () => {
    const body = '<main><section id="page-landing"><form>old</form></section><section id="page-lobby">lobby</section></main>'
    const result = replaceElementWithPortal(body, 'section', 'page-landing', 'react-landing-root')

    expect(result).toContain('<div id="react-landing-root" class="contents"></div>')
    expect(result).toContain('id="page-lobby"')
    expect(result).not.toContain('<form>old</form>')
  })

  it('removes the complete element when it contains nested elements with the same tag', () => {
    const body = '<main><div id="map"><div><div id="legacy-node">old</div></div></div><div id="next">keep</div></main>'
    const result = replaceElementWithPortal(body, 'div', 'map', 'react-map-root')

    expect(result).toBe('<main><div id="react-map-root" class="contents"></div><div id="next">keep</div></main>')
    expect(result).not.toContain('legacy-node')
  })
})

describe('removeElementById', () => {
  it('removes one complete legacy widget while preserving adjacent markup', () => {
    const body = '<main><div id="old-widget"><div>old</div></div><div id="keep">keep</div></main>'

    expect(removeElementById(body, 'div', 'old-widget')).toBe('<main><div id="keep">keep</div></main>')
  })
})
