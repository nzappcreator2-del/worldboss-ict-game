import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { legacyBody, legacyScript } from './sources'

describe('generated legacy compatibility runtime', () => {
  const appSource = readFileSync(fileURLToPath(new URL('../App.tsx', import.meta.url)), 'utf8')

  it('remains valid JavaScript after migrated functions are stripped', () => {
    expect(() => new Function(legacyScript)).not.toThrow()
  })

  it('provides every React mount point required by App.tsx', () => {
    const requiredMountIds = [...appSource.matchAll(/getElementById\('([^']+)'\)/g)]
      .map((match) => match[1])
      .sort()
    const missingMountIds = requiredMountIds.filter((id) => !legacyBody.includes(`id="${id}"`))

    expect(requiredMountIds).toEqual([
      'react-admin-root',
      'react-ai-tutor-root',
      'react-battle-root',
      'react-cyber-root',
      'react-dashboard-root',
      'react-landing-root',
      'react-lesson-root',
      'react-lobby-root',
      'react-pretest-root',
      'react-pvp-root',
      'react-worksheet-root',
      'react-world-boss-root',
    ])
    expect(missingMountIds).toEqual([])
  })

  it('replaces the legacy lesson page with one React portal', () => {
    expect(legacyBody.match(/id="react-dashboard-root"/g)).toHaveLength(1)
    expect(legacyBody).not.toContain('id="page-dashboard"')
    expect(legacyBody).not.toContain('id="sidebar"')
    expect(legacyBody).not.toContain('id="display-name"')
    expect(legacyBody).not.toContain('id="bottom-action-bar"')
    expect(legacyBody).not.toContain('onclick="showDashboardTab')
    expect(legacyBody.match(/id="react-lesson-root"/g)).toHaveLength(1)
    expect(legacyBody).not.toContain('id="lesson-title-display"')
    expect(legacyBody).not.toContain('id="lesson-worksheet-btn"')
    expect(legacyBody.match(/id="react-pretest-root"/g)).toHaveLength(1)
    expect(legacyBody.match(/id="react-battle-root"/g)).toHaveLength(1)
    expect(legacyBody.match(/id="react-worksheet-root"/g)).toHaveLength(1)
    expect(legacyBody.match(/id="react-cyber-root"/g)).toHaveLength(1)
    expect(legacyBody.match(/id="react-pvp-root"/g)).toHaveLength(1)
    expect(legacyBody.match(/id="react-ai-tutor-root"/g)).toHaveLength(1)
    expect(legacyBody).not.toContain('id="react-economy-root"')
    expect(legacyBody.match(/id="react-world-boss-root"/g)).toHaveLength(1)
    expect(legacyBody.match(/id="react-admin-root"/g)).toHaveLength(1)
    expect(legacyBody).not.toContain('id="pretest-question-text"')
    expect(legacyBody).not.toContain('id="battle-result-modal"')
    expect(legacyBody).not.toContain('id="worksheet-input"')
    expect(legacyBody).not.toContain('id="cyber-start-screen"')
    expect(legacyBody).not.toContain('id="pvp-mode-selection"')
    expect(legacyBody).not.toContain('id="pvp-result-modal"')
    expect(legacyBody).not.toContain('id="ai-tutor-fab"')
    expect(legacyBody).not.toContain('id="ai-tutor-modal"')
    expect(legacyBody).not.toContain('id="floating-shop-bag"')
    expect(legacyBody).not.toContain('id="shop-modal"')
    expect(legacyBody).not.toContain('id="inventory-modal"')
    expect(legacyBody).not.toContain('id="wb-lobby"')
    expect(legacyBody).not.toContain('id="wb-battle"')
    expect(legacyBody).not.toContain('id="admin-tab-lessons"')
    expect(legacyBody).not.toContain('id="modal-lesson"')
    expect(legacyBody).not.toContain('id="modal-ai-generator"')
    expect(legacyBody).not.toContain('id="modal-question"')
    expect(legacyBody).not.toContain('id="modal-news"')
    expect(legacyBody).not.toContain('id="modal-lesson-preview"')
    expect(legacyBody).not.toContain('id="preview-enter-btn"')
    expect(legacyBody).not.toContain('id="image-lightbox-modal"')
  })

  it('installs lesson compatibility methods without GAS calls', () => {
    expect(legacyScript).toContain('getCurrentLesson()')
    expect(legacyScript).toContain("new Event('nextgen:open-lesson')")
    expect(legacyScript).toContain("new CustomEvent('nextgen:start-pretest'")
    expect(legacyScript).toContain("new CustomEvent('nextgen:start-battle'")
    expect(legacyScript).not.toContain('function submitAnswer(')
    expect(legacyScript).not.toContain('window.submitMatchingAnswer')
    expect(legacyScript).toContain("new Event('nextgen:open-worksheet')")
    expect(legacyScript).not.toContain('function submitWorksheet(')
    expect(legacyScript).toContain("new Event('nextgen:open-cyber-safety')")
    expect(legacyScript).not.toContain('function selectCyberOption(')
    expect(legacyScript).toContain("new Event('nextgen:open-pvp')")
    expect(legacyScript).not.toContain('function startPvpMatchmaking(')
    expect(legacyScript).not.toContain('function submitPvpAnswer(')
    expect(legacyScript).not.toContain('function toggleAITutor(')
    expect(legacyScript).not.toContain('function sendAITutorMessage(')
    expect(legacyScript).toContain("new Event('nextgen:open-shop')")
    expect(legacyScript).toContain("new Event('nextgen:open-inventory')")
    expect(legacyScript).toContain("new Event('nextgen:user-updated')")
    expect(legacyScript).not.toContain('function updateDashboardInfo(')
    expect(legacyScript).not.toContain('async function logout(')
    expect(legacyScript).not.toContain('legacyShowDashboardTabForReactEconomy')
    expect(legacyScript).not.toContain('function buyGacha(')
    expect(legacyScript).not.toContain('function buyItemShop(')
    expect(legacyScript).toContain("new Event('nextgen:open-world-boss')")
    expect(legacyScript).not.toContain('function renderWorldBossLobby(')
    expect(legacyScript).not.toContain('function startWorldBossBattle(')
    expect(legacyScript).toContain("new Event('nextgen:open-admin')")
    expect(legacyScript).not.toContain('function adminLoginPrompt(')
    expect(legacyScript).not.toContain('function loadAdminLessons(')
    expect(legacyScript).toContain("new Event('nextgen:login-complete')")
    expect(legacyScript).not.toContain('function showLessonPreviewModal(')
    expect(legacyScript).not.toContain('function closeLessonPreviewModal(')
    expect(legacyScript).not.toContain('function checkAndShowLoginBonus(')
    expect(legacyScript).not.toContain('function showLoginBonusModal(')
    expect(legacyScript).not.toContain('login-bonus-modal')
    expect(legacyScript).not.toContain('window.openImageLightbox')
    expect(legacyScript).not.toContain('window.closeImageLightbox')
    expect(legacyScript).not.toContain('google.script.run')
  })
})
