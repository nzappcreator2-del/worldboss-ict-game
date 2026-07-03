import { describe, expect, it } from 'vitest'
import { stripLegacyFunctions } from './stripLegacyFunctions'

describe('stripLegacyFunctions', () => {
  it('removes only named top-level functions and handles braces inside strings', () => {
    const source = `
      function removeMe() { const template = \`value: \${{ ok: true }.ok}\`; return template; }
      function keepMe() { return '{still here}'; }
    `
    const result = stripLegacyFunctions(source, ['removeMe'])

    expect(result).not.toContain('function removeMe')
    expect(result).toContain("function keepMe() { return '{still here}'; }")
  })

  it('does not remove nested functions that happen to share a name', () => {
    const source = 'function outer() { function target() { return true; } return target(); }'
    expect(stripLegacyFunctions(source, ['target'])).toBe(source)
  })

  it('removes named top-level window function assignments', () => {
    const source = `window.removeMe = function () { return true; }; window.keepMe = () => false;`
    const result = stripLegacyFunctions(source, ['removeMe'])

    expect(result).not.toContain('window.removeMe')
    expect(result).toContain('window.keepMe')
  })
})
