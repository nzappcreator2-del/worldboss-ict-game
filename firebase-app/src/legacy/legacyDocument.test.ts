import { describe, expect, it } from 'vitest'
import { extractLegacyBody, migrateLegacyBackendCalls, removeElementById, replaceElementWithPortal, stripHtmlTag } from './legacyDocument'

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
