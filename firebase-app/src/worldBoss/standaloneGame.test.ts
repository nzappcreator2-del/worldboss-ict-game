import { describe, expect, it } from 'vitest'
import { prepareStandaloneGame } from './standaloneGame'

describe('standalone World Boss bridge', () => {
  it('injects the fitness result bridge without adding a GAS endpoint', () => {
    const result = prepareStandaloneGame(`<html><body><script>const webAppUrl = decodeURIComponent(urlParams.get('webAppUrl') || ''); console.error("Failed to fetch questions from Apps Script:"); const message = "Saving to Google Sheets...";</script><div id="wb-victory-modal" class="hidden"></div></body></html>`, 'fitness')
    expect(result).toContain('nextgen:world-boss-result')
    expect(result).toContain('wbElapsedTime')
    expect(result).toContain('wbRepsCount')
    expect(result).not.toContain('google.script.run')
    expect(result).not.toContain('Apps Script')
    expect(result).not.toContain('Google Sheets')
    expect(result).not.toContain('webAppUrl=')
    expect(result).not.toContain("urlParams.get('webAppUrl')")
    expect(result).toContain('setInterval')
    expect(result).not.toContain('MutationObserver')
  })

  it('injects the neck quiz score bridge and rejects malformed documents', () => {
    const result = prepareStandaloneGame('<html><body><section id="victory-screen" class="hidden"></section></body></html>', 'neck-quiz')
    expect(result).toContain('localBossId')
    expect(result).toContain('score')
    expect(() => prepareStandaloneGame('<html></html>', 'fitness')).toThrow('closing body')
  })
})
