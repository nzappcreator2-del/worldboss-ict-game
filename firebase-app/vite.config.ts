/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import type { Plugin, ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { extname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { extractLegacyBody, migrateLegacyBackendCalls, migrateLegacyPageCss, removeElementById, replaceElementWithPortal, stripHtmlTag } from './src/legacy/legacyDocument'
import { stripLegacyFunctions } from './src/legacy/stripLegacyFunctions'
import { prepareStandaloneGame } from './src/worldBoss/standaloneGame'

const legacyRoot = fileURLToPath(new URL('../legacy-gas/', import.meta.url))
const legacyScripts = [
  'JS_Utils.html', 'JS_Auth.html', 'JS_Map.html', 'JS_Battle.html', 'JS_Admin.html',
  'JS_AITutor.html', 'JS_DailyQuest.html', 'JS_Profile.html', 'JS_PVP.html',
  'JS_Fitness.html', 'JS_CyberSafety.html',
]

const worldBossContentType: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.png': 'image/png',
  '.wav': 'audio/wav',
}

export function isWorldBossAssetPath(relativePath: string) {
  if (relativePath === 'fitness.html' || relativePath === 'neck_quiz.html') return true
  if (!relativePath.startsWith('mario-game/')) return false
  const name = relativePath.slice('mario-game/'.length)
  return name !== '.gitignore' && name !== 'README.md' && !name.endsWith('.txt')
}

function standaloneWorldBossSource(relativePath: string) {
  if (!isWorldBossAssetPath(relativePath)) return null
  const sourcePath = resolve(legacyRoot, relativePath)
  const root = resolve(legacyRoot) + sep
  if (!sourcePath.startsWith(root) || !existsSync(sourcePath)) return null
  if (relativePath === 'fitness.html') return Buffer.from(prepareStandaloneGame(readFileSync(sourcePath, 'utf8'), 'fitness'))
  if (relativePath === 'neck_quiz.html') return Buffer.from(prepareStandaloneGame(readFileSync(sourcePath, 'utf8'), 'neck-quiz'))
  return readFileSync(sourcePath)
}

function worldBossAssetsPlugin(): Plugin {
  const marioRoot = resolve(legacyRoot, 'mario-game')
  const marioFiles = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name)
    return entry.isDirectory() ? marioFiles(path) : [path]
  })
  const serve = (server: ViteDevServer) => {
    server.middlewares.use((request, response, next) => {
      const pathname = decodeURIComponent(new URL(request.url || '/', 'http://localhost').pathname)
      if (!pathname.startsWith('/world-boss/')) return next()
      const relativePath = pathname.slice('/world-boss/'.length)
      if (!['fitness.html', 'neck_quiz.html'].includes(relativePath) && !relativePath.startsWith('mario-game/')) return next()
      const source = standaloneWorldBossSource(relativePath)
      if (!source) return next()
      response.statusCode = 200
      response.setHeader('Content-Type', worldBossContentType[extname(relativePath).toLowerCase()] || 'application/octet-stream')
      response.end(source)
    })
  }
  return {
    name: 'nextgen-world-boss-assets',
    configureServer: serve,
    generateBundle() {
      for (const fileName of ['fitness.html', 'neck_quiz.html']) {
        const source = standaloneWorldBossSource(fileName)
        if (!source) throw new Error(`Missing legacy World Boss asset: ${fileName}`)
        this.emitFile({ type: 'asset', fileName: `world-boss/${fileName}`, source })
      }
      for (const filePath of marioFiles(marioRoot)) {
        const name = relative(marioRoot, filePath).split(sep).join('/')
        if (!isWorldBossAssetPath(`mario-game/${name}`)) continue
        this.emitFile({ type: 'asset', fileName: `world-boss/mario-game/${name}`, source: readFileSync(filePath) })
      }
    },
  }
}

function legacySourcesPlugin() {
  const virtualId = 'virtual:legacy-sources'
  const resolvedId = `\0${virtualId}`
  return {
    name: 'nextgen-legacy-sources',
    resolveId(id: string) {
      return id === virtualId ? resolvedId : undefined
    },
    load(id: string) {
      if (id !== resolvedId) return undefined
      const index = readFileSync(`${legacyRoot}/Index.html`, 'utf8')
      const css = readFileSync(`${legacyRoot}/CSS.html`, 'utf8')
      const script = legacyScripts.map((name) => {
        const source = readFileSync(`${legacyRoot}/${name}`, 'utf8')
        const migrated = migrateLegacyBackendCalls(stripHtmlTag(source, 'script'))
        if (name === 'JS_Utils.html') return stripLegacyFunctions(migrated, [
          'openShopModal', 'closeShopModal', 'openInventoryModal', 'closeInventoryModal',
          'buyGacha', 'showGachaResultModal', 'handleGachaEscape', 'closeGachaResultModal', 'buyItemShop',
          'showDashboardTab',
        ])
        if (name === 'JS_Auth.html') return stripLegacyFunctions(migrated, ['fetchInitialData', 'onClassChange', 'onNameSelectChange', 'selectAvatar', 'handleLogin', 'renderDashboardNews', 'updateDashboardInfo', 'logout'])
        if (name === 'JS_Map.html') return stripLegacyFunctions(migrated, ['openMap', 'fetchMapData', 'renderMapNodes', 'showLessonPreviewModal', 'closeLessonPreviewModal'])
        if (name === 'JS_DailyQuest.html') return stripLegacyFunctions(migrated, ['checkAndShowLoginBonus', 'fetchDailyQuestStatus', 'renderDailyQuests', 'claimDailyQuest', 'showLoginBonusModal'])
        if (name === 'JS_Battle.html') return stripLegacyFunctions(migrated, [
          'extractYouTubeId', 'openLesson', 'startBossBattle', 'initBattleState', 'updateTimerUI', 'updateHpUI', 'updateComboUI', 'loadQuestion',
          'selectMatchingLeft', 'selectMatchingRight', 'updateMatchingColors', 'submitMatchingAnswer', 'showCorrectMatchingPairs', 'submitAnswer',
          'useItemInBattle', 'showDamageEffect', 'endBattle', 'showBattleResultModal', 'finishBattle', 'updateStarRating',
          'startPreTest', 'renderPreTestQuestion', 'selectPretestMatchingLeft', 'selectPretestMatchingRight', 'updatePretestMatchingColors',
          'submitPretestMatchingAnswer', 'showCorrectPretestMatchingPairs', 'submitPreTestAnswer', 'goToLessonFromPretest',
          'openWorksheetModal', 'closeWorksheetModal', 'submitWorksheet', 'downloadWorksheetImage', 'closeWorksheetResult',
          'openImageLightbox', 'closeImageLightbox', 'launchConfetti',
          'openLeaderboard', 'closeLeaderboard', 'toggleLeaderboardType', 'loadLeaderboard', 'loadGuildLeaderboard', 'renderLeaderboard', 'renderGuildLeaderboard',
          'openCertificate', 'openCertificateModal', 'closeCertificate', 'generateCertificate', 'downloadCertificate',
        ])
        if (name === 'JS_Profile.html') {
          return stripLegacyFunctions(migrated, ['openProfile', 'fetchProfileData', 'renderProfile', 'formatDate'])
            .replace(/^\s*const PROFILE_VERSION\s*=\s*["'][^"']+["'];\s*let profileLoadingTimeout\s*=\s*null;\s*/m, '')
            .replaceAll('v4.1.2-Patch', '')
        }
        if (name === 'JS_CyberSafety.html') return ''
        if (name === 'JS_PVP.html') return ''
        if (name === 'JS_AITutor.html') return ''
        if (name === 'JS_Fitness.html') return ''
        if (name === 'JS_Admin.html') return ''
        return migrated
      }).join('\n\n').replace(/\n\s*fetchInitialData\(\);\s*(?=\n\s*};)/, '\n') + `

window.nextGenLegacyBridge = {
  setInitialData(payload) {
    allRegisteredUsers = payload.users || [];
    gameSettings = payload.settings || {};
    gameNews = payload.news || [];
  },
  completeLogin(user, payload) {
    this.setInitialData(payload);
    currentUser = user;
    if (!currentUser.inventory) currentUser.inventory = { potion: 0, magnifier: 0 };
    if (!currentUser.coins) currentUser.coins = 0;
    window.dispatchEvent(new Event('nextgen:user-updated'));
    showPage('lobby');
    window.dispatchEvent(new Event('nextgen:login-complete'));
  },
  openAdmin() {
    showPage('admin');
    window.dispatchEvent(new Event('nextgen:open-admin'));
  },
  exitAdmin() {
    return showPage('landing');
  },
  openLobbyMode(mode) {
    if (mode === 'adventure') {
      const result = enterAdventureMode();
      window.dispatchEvent(new Event('nextgen:open-home'));
      return result;
    }
    if (mode === 'pvp') return enterPVPMode();
    if (mode === 'world-boss') return enterWorldBossMode();
    if (mode === 'cyber-safety') return enterCyberSafetyMode();
    throw new Error('Unknown lobby mode: ' + mode);
  },
  openDashboardTab(tabId) {
    if (tabId === 'home') {
      showDashboardTab('home');
      window.dispatchEvent(new Event('nextgen:open-home'));
      return;
    }
    if (tabId === 'profile') return openProfile();
    if (tabId === 'map') return openMap();
    if (tabId === 'rank') return openLeaderboard();
    if (tabId === 'cert') return openCertificate();
    throw new Error('Unknown dashboard tab: ' + tabId);
  },
  logout() {
    window.location.reload();
  },
  getCurrentUser() {
    return currentUser;
  },
  getNews() {
    return gameNews || [];
  },
  getSettings() {
    return gameSettings || {};
  },
  updateUserReward(reward) {
    if (!currentUser) return;
    if (reward.coins !== undefined) currentUser.coins = reward.coins;
    if (reward.xp !== undefined) currentUser.xp = reward.xp;
    if (reward.streak !== undefined) currentUser.streak = reward.streak;
    if (reward.inventory !== undefined) currentUser.inventory = reward.inventory;
    window.dispatchEvent(new Event('nextgen:user-updated'));
  },
  setMapData(payload) {
    lessonsData = payload.data || [];
    if (currentUser) currentUser.passedLessons = payload.passedLessons || [];
  },
  openMapLesson(lessonId) {
    return openLesson(lessonId);
  },
  openCertificateTab() {
    if (currentUser) {
      if (!currentUser.inventory) currentUser.inventory = {};
      if (!Array.isArray(currentUser.inventory.badges)) currentUser.inventory.badges = [];
      if (!currentUser.inventory.badges.includes('badge_cert')) currentUser.inventory.badges.push('badge_cert');
      window.dispatchEvent(new Event('nextgen:user-updated'));
    }
    showDashboardTab('cert');
  },
  showCertificateLocked(message) {
    if (currentUser && currentUser.inventory && Array.isArray(currentUser.inventory.badges)) {
      currentUser.inventory.badges = currentUser.inventory.badges.filter((badge) => badge !== 'badge_cert');
      window.dispatchEvent(new Event('nextgen:user-updated'));
    }
    customAlert(message);
  },
  getCurrentLesson() {
    return currentLesson;
  },
  backFromLesson() {
    return openMap();
  },
  startLessonQuiz() {
    return startBossBattle();
  },
  openLessonWorksheet() {
    return openWorksheetModal();
  },
  continueFromPretest() {
    return goToLessonFromPretest();
  },
  trackDailyProgress(type, questionId) {
    if (typeof updateDailyProgressLocal === 'function') updateDailyProgressLocal(type, 1, questionId);
  },
  updateBattleUser(update) {
    if (!currentUser) return;
    if (update.xp !== undefined) currentUser.xp = update.xp;
    if (update.coins !== undefined) currentUser.coins = update.coins;
    if (update.level !== undefined) currentUser.level = update.level;
    if (update.rank !== undefined) currentUser.rank = update.rank;
    if (update.inventory !== undefined) currentUser.inventory = update.inventory;
    if (update.avatar !== undefined) currentUser.avatar = update.avatar;
    if (update.passedLessons !== undefined) currentUser.passedLessons = update.passedLessons;
    window.dispatchEvent(new Event('nextgen:user-updated'));
  },
  exitCyberSafety() {
    return exitCyberSafetyMode();
  },
  exitPvp() {
    return exitPvpMode();
  },
  exitWorldBoss() {
    return exitWorldBossMode();
  }
};

function enterAdventureMode() {
  showDashboardTab('home');
  if (typeof renderMapNodes === 'function') renderMapNodes();
}

function enterPVPMode() {
  if (!currentUser) return showPage('landing');
  showPage('pvp');
  window.dispatchEvent(new Event('nextgen:open-pvp'));
}

function exitPvpMode() {
  return showPage('lobby');
}

function enterWorldBossMode() {
  if (!currentUser) return showPage('landing');
  showPage('world-boss');
  window.dispatchEvent(new Event('nextgen:open-world-boss'));
}

function exitWorldBossMode() {
  return showPage('lobby');
}

function showDashboardTab(tabId) {
  showPage('dashboard');
  window.dispatchEvent(new CustomEvent('nextgen:dashboard-tab', { detail: tabId }));
}

function openShopModal() {
  window.dispatchEvent(new Event('nextgen:open-shop'));
}

function closeShopModal() {
  window.dispatchEvent(new Event('nextgen:close-shop'));
}

function openInventoryModal() {
  window.dispatchEvent(new Event('nextgen:open-inventory'));
}

function closeInventoryModal() {
  window.dispatchEvent(new Event('nextgen:close-inventory'));
}

function showReactLesson() {
  if (!currentLesson) return openMap();
  showPage('lesson');
  window.dispatchEvent(new Event('nextgen:open-lesson'));
}

function openLesson(lessonId) {
  currentLesson = lessonsData.find((lesson) => lesson.id === lessonId);
  if (!currentLesson) return openMap();
  if (currentLesson.enablePretest) return startPreTest(lessonId);
  return showReactLesson();
}

function goToLessonFromPretest() {
  return showReactLesson();
}

function startPreTest(lessonId) {
  if (!currentLesson || currentLesson.id !== lessonId) {
    currentLesson = lessonsData.find((lesson) => lesson.id === lessonId);
  }
  if (!currentLesson) return openMap();
  showPage('pretest');
  window.dispatchEvent(new CustomEvent('nextgen:start-pretest', { detail: currentLesson }));
}

function startBossBattle() {
  if (!currentLesson) return openMap();
  showPage('boss-battle');
  window.dispatchEvent(new CustomEvent('nextgen:start-battle', { detail: currentLesson }));
}

function finishBattle() {
  return openMap();
}

function openWorksheetModal() {
  if (!currentLesson) return;
  showPage('worksheet');
  window.dispatchEvent(new Event('nextgen:open-worksheet'));
}

function closeWorksheetModal() {
  return showReactLesson();
}

function enterCyberSafetyMode() {
  if (!currentUser) return showPage('landing');
  showPage('cyber-safety');
  window.dispatchEvent(new Event('nextgen:open-cyber-safety'));
}

function exitCyberSafetyMode() {
  return showPage('lobby');
}

function openMap() {
  showDashboardTab('map');
  window.dispatchEvent(new Event('nextgen:open-map'));
}

function renderMapNodes() {
  window.dispatchEvent(new Event('nextgen:open-map'));
}

function fetchDailyQuestStatus() {
  window.dispatchEvent(new Event('nextgen:open-home'));
}

function renderDailyQuests() {
  window.dispatchEvent(new Event('nextgen:open-home'));
}

function renderDashboardNews() {
  window.dispatchEvent(new Event('nextgen:open-home'));
}

function openLeaderboard() {
  showDashboardTab('rank');
  window.dispatchEvent(new Event('nextgen:open-leaderboard'));
}

function closeLeaderboard() {
  showDashboardTab('home');
  window.dispatchEvent(new Event('nextgen:open-home'));
}

function openProfile() {
  showDashboardTab('profile');
  window.dispatchEvent(new Event('nextgen:open-profile'));
}

function fetchProfileData() {
  window.dispatchEvent(new Event('nextgen:open-profile'));
}

function openCertificate() {
  showDashboardTab('cert');
  window.dispatchEvent(new Event('nextgen:open-certificate'));
}

function closeCertificate() {
  showDashboardTab('home');
  window.dispatchEvent(new Event('nextgen:open-home'));
}`
      let bodyWithReactPages = extractLegacyBody(index)
      bodyWithReactPages = replaceElementWithPortal(bodyWithReactPages, 'section', 'page-landing', 'react-landing-root')
      bodyWithReactPages = replaceElementWithPortal(bodyWithReactPages, 'section', 'page-dashboard', 'react-dashboard-root')
      bodyWithReactPages = replaceElementWithPortal(bodyWithReactPages, 'section', 'page-lobby', 'react-lobby-root')
      bodyWithReactPages = replaceElementWithPortal(bodyWithReactPages, 'section', 'page-lesson', 'react-lesson-root')
      bodyWithReactPages = replaceElementWithPortal(bodyWithReactPages, 'section', 'page-pretest', 'react-pretest-root')
      bodyWithReactPages = replaceElementWithPortal(bodyWithReactPages, 'section', 'page-boss-battle', 'react-battle-root')
      bodyWithReactPages = replaceElementWithPortal(bodyWithReactPages, 'section', 'page-worksheet', 'react-worksheet-root')
      bodyWithReactPages = replaceElementWithPortal(bodyWithReactPages, 'section', 'page-cyber-safety', 'react-cyber-root')
      bodyWithReactPages = replaceElementWithPortal(bodyWithReactPages, 'section', 'page-pvp', 'react-pvp-root')
      const bodyWithEconomy = removeElementById(
        removeElementById(
          bodyWithReactPages,
          'div',
          'shop-modal',
        ),
        'div',
        'inventory-modal',
      )
      const bodyWithWorldBoss = replaceElementWithPortal(bodyWithEconomy, 'section', 'page-world-boss', 'react-world-boss-root')
      const bodyBeforeAdmin = removeElementById(
        replaceElementWithPortal(bodyWithWorldBoss, 'div', 'ai-tutor-fab', 'react-ai-tutor-root'),
        'div',
        'ai-tutor-modal',
      )
      const bodyWithAdmin = removeElementById(
        removeElementById(
          removeElementById(
            removeElementById(
              replaceElementWithPortal(bodyBeforeAdmin, 'section', 'page-admin', 'react-admin-root'),
              'div',
              'modal-lesson',
            ),
            'div',
            'modal-ai-generator',
          ),
          'div',
          'modal-question',
        ),
        'div',
        'modal-news',
      )
      const bodyWithoutLessonPreview = removeElementById(bodyWithAdmin, 'div', 'modal-lesson-preview')
      const body = removeElementById(bodyWithoutLessonPreview, 'div', 'image-lightbox-modal')
      return [
        `export const legacyBody = ${JSON.stringify(body)};`,
        `export const legacyCss = ${JSON.stringify(migrateLegacyPageCss(stripHtmlTag(css, 'style')))};`,
        `export const legacyScript = ${JSON.stringify(script)};`,
      ].join('\n')
    },
  }
}

export default defineConfig({
  publicDir: false,
  // The lesson RPG tests grind long fake-timer combat cycles; under a fully
  // parallel suite run the default 5s per-test budget flakes on slower CPUs.
  test: {
    testTimeout: 20000,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const path = id.replace(/\\/g, '/')
          if (!path.includes('node_modules')) {
            // Teacher-only surface: keep the admin console out of the main
            // student bundle so the index chunk stays under the 500 KiB cap.
            if (path.includes('/src/components/AdminPanel') || path.includes('/src/components/adminPanelLogic') || path.includes('/src/services/adminApi')) return 'admin'
            return undefined
          }
          if (path.includes('/react/') || path.includes('/react-dom/')) return 'react-vendor'
          if (path.includes('/firebase/') || path.includes('/@firebase/')) return 'firebase-vendor'
          return 'vendor'
        },
      },
    },
  },
  plugins: [worldBossAssetsPlugin(), legacySourcesPlugin(), react()],
})
