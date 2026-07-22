import { memo, useLayoutEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { LandingLogin, type LandingData, type LandingService, type LandingUser, type LoginResult } from './components/LandingLogin'
import { Lobby, type LobbyMode } from './components/Lobby'
import { AdventureMap, type MapResult, type MapUser } from './components/AdventureMap'
import { TeacherNpc } from './components/TeacherNpc'
import { questTargetLessonIds } from './services/teacherQuestLogic'
import { DashboardHome, type DailyStatus, type DashboardNews, type DashboardUser, type RewardResult } from './components/DashboardHome'
import { Leaderboard, type GuildResult, type PlayerResult } from './components/Leaderboard'
import { PlayerProfile, type ProfileResult, type StatAllocationResult } from './components/PlayerProfile'
import { Certificate, type CertificateSettings, type CertificateUser, type EligibilityResult } from './components/Certificate'
import { LessonPage, type Lesson } from './components/LessonPage'
import { PretestPage } from './components/PretestPage'
import { BossBattle, type BattleUser } from './components/BossBattle'
import { WorksheetPage, type WorksheetLesson, type WorksheetSubmissionResult, type WorksheetSubmissionStats } from './components/WorksheetPage'
import { CyberSafety, type CyberUser } from './components/CyberSafety'
import { PvpMode, type PvpModeUser } from './components/PvpMode'
import { AiTutor, type AiTutorUser } from './components/AiTutor'
import { PlayerEconomy, type EconomyUser } from './components/PlayerEconomy'
import { WorldBoss, type WorldBossUser } from './components/WorldBoss'
import { AdminPanel } from './components/AdminPanel'
import { HeroProfile, type HeroProfileInventory, type HeroProfileUser } from './components/HeroProfile'
import { LoginBonus } from './components/LoginBonus'
import { DashboardShell, type DashboardShellUser, type DashboardTab } from './components/DashboardShell'
import { PageTransitionIndicator } from './components/PageTransitionIndicator'
import { GameAudioControl } from './components/GameAudioControl'
import { legacyBody, legacyCss, legacyScript } from './legacy/sources'
import { endAdminSession } from './firebase/adminClient'
import { resetTutorHistory, testGeminiKey } from './services/aiApi'
import { firestoreApi, getInitialData, loginStudent, subscribeActiveNews } from './services/firestoreApi'
import { installFirebaseServiceRunner } from './services/legacyRunner'
import {
  getPvpRankings,
  joinPrivateRoom,
  leavePvpRoom,
  quickJoinRoom,
  answerPvpRound,
  sendPvpChat,
  setPvpReady,
  setPvpTeamSize,
  startPvpBattle,
  subscribeToPvpChat,
  subscribeToPvpPresence,
  subscribeToRoom,
  submitPvpRanking,
  switchPvpTeam,
  timeoutPvpRound,
  updatePvpPresence,
} from './services/pvpRoomApi'

const legacyBodyClass = 'bg-fantasy font-prompt h-screen w-screen relative overflow-hidden text-gray-800'

type LegacyBridge = {
  completeLogin(user: LandingUser, data: LandingData): void
  openAdmin(): void
  exitAdmin(): void
  openLobbyMode(mode: LobbyMode): void
  openDashboardTab(tab: DashboardTab): void
  logout(): void
  getCurrentUser(): MapUser | null
  getNews(): DashboardNews[]
  getSettings(): CertificateSettings & { TimerPerQuestion?: number | string }
  updateUserReward(reward: { coins?: number; xp?: number; streak?: number; inventory?: unknown }): void
  setMapData(payload: MapResult): void
  openMapLesson(lessonId: string): void
  openCertificateTab(): void
  showCertificateLocked(message: string): void
  getCurrentLesson(): Lesson | null
  backFromLesson(): void
  startLessonQuiz(): void
  openLessonWorksheet(): void
  closeLessonWorksheet(): void
  continueFromPretest(): void
  trackDailyProgress(type: 'play1' | 'correct5', questionId?: string): void
  updateBattleUser(user: Partial<BattleUser>): void
  exitCyberSafety(): void
  exitPvp(): void
  exitWorldBoss(): void
}

const landingService: LandingService = {
  getInitialData: async () => await getInitialData() as LandingData,
  loginStudent: async (name, className, avatar, gender) => await loginStudent(name, className, avatar, gender) as LoginResult,
}

// Memoized: App takes no props and does its one-time DOM/root mount in a
// useLayoutEffect guarded by `started`. AppLoadingGate (its only caller)
// re-renders often while resources preload; without memo, each of those
// re-renders reaches this component's <div dangerouslySetInnerHTML> and
// React re-applies the innerHTML on commit — wiping out the imperatively
// mounted sub-roots (landingApp, dashboardApp, ...) without ever running
// their unmount cleanup, leaving pages blank after the splash fades out.
function App() {
  const started = useRef(false)

  useLayoutEffect(() => {
    if (started.current) return
    started.current = true
    document.body.className = legacyBodyClass

    let style = document.querySelector<HTMLStyleElement>('style[data-legacy="nextgen-play"]')
    if (!style) {
      style = document.createElement('style')
      style.dataset.legacy = 'nextgen-play'
      style.textContent = legacyCss
      document.head.appendChild(style)
    }

    let script = document.querySelector<HTMLScriptElement>('script[data-legacy="nextgen-play"]')
    if (!script) {
      script = document.createElement('script')
      script.dataset.legacy = 'nextgen-play'
      script.textContent = legacyScript
      document.body.appendChild(script)
    }

    // Install after all legacy globals are evaluated so third-party/legacy scripts
    // cannot replace the GAS-compatible namespace before the first data request.
    installFirebaseServiceRunner(firestoreApi)
    const landingTarget = document.getElementById('react-landing-root')
    if (!landingTarget) throw new Error('Missing React landing target')
    const landingApp = createRoot(landingTarget)
    const lobbyTarget = document.getElementById('react-lobby-root')
    if (!lobbyTarget) throw new Error('Missing React lobby target')
    const lobbyApp = createRoot(lobbyTarget)
    const dashboardTarget = document.getElementById('react-dashboard-root')
    if (!dashboardTarget) throw new Error('Missing React dashboard shell target')
    const dashboardApp = createRoot(dashboardTarget)
    const bridge = () => (window as typeof window & { nextGenLegacyBridge?: LegacyBridge }).nextGenLegacyBridge
    const lessonTarget = document.getElementById('react-lesson-root')
    if (!lessonTarget) throw new Error('Missing React lesson target')
    const lessonApp = createRoot(lessonTarget)
    const pretestTarget = document.getElementById('react-pretest-root')
    if (!pretestTarget) throw new Error('Missing React pretest target')
    const pretestApp = createRoot(pretestTarget)
    const battleTarget = document.getElementById('react-battle-root')
    if (!battleTarget) throw new Error('Missing React battle target')
    const battleApp = createRoot(battleTarget)
    const worksheetTarget = document.getElementById('react-worksheet-root')
    if (!worksheetTarget) throw new Error('Missing React worksheet target')
    const worksheetApp = createRoot(worksheetTarget)
    const cyberTarget = document.getElementById('react-cyber-root')
    if (!cyberTarget) throw new Error('Missing React cyber safety target')
    const cyberApp = createRoot(cyberTarget)
    const pvpTarget = document.getElementById('react-pvp-root')
    if (!pvpTarget) throw new Error('Missing React PVP target')
    const pvpApp = createRoot(pvpTarget)
    const aiTutorTarget = document.getElementById('react-ai-tutor-root')
    if (!aiTutorTarget) throw new Error('Missing React AI Tutor target')
    const aiTutorApp = createRoot(aiTutorTarget)
    const worldBossTarget = document.getElementById('react-world-boss-root')
    if (!worldBossTarget) throw new Error('Missing React World Boss target')
    const worldBossApp = createRoot(worldBossTarget)
    const adminTarget = document.getElementById('react-admin-root')
    if (!adminTarget) throw new Error('Missing React Admin target')
    const adminApp = createRoot(adminTarget)
    const overlayTarget = document.createElement('div')
    overlayTarget.id = 'react-overlays-root'
    document.body.appendChild(overlayTarget)
    const overlayApp = createRoot(overlayTarget)
    landingApp.render(
      <LandingLogin
        service={landingService}
        onLogin={(user, data) => bridge()?.completeLogin(user, data)}
        onAdmin={() => bridge()?.openAdmin()}
      />,
    )
    lobbyApp.render(
      <Lobby
        onSelectMode={(mode) => bridge()?.openLobbyMode(mode)}
        onDailyReward={() => bridge()?.openDashboardTab('home')}
        onRank={() => bridge()?.openDashboardTab('rank')}
      />,
    )
    dashboardApp.render(
      <DashboardShell
        getCurrentUser={() => bridge()?.getCurrentUser() as DashboardShellUser | null || null}
        onNavigate={(tab) => bridge()?.openDashboardTab(tab)}
        onLogout={() => bridge()?.logout()}
        map={
          <AdventureMap
            service={{
              getCurrentUser: () => bridge()?.getCurrentUser() || null,
              loadLessons: async (userId) => {
                const result = await firestoreApi.getLessons(userId) as MapResult
                bridge()?.setMapData(result)
                return result
              },
              loadQuestTargets: async (userId) => {
                const board = await firestoreApi.getTeacherQuestBoard(userId)
                return { success: board.success, data: questTargetLessonIds(board.data || []) }
              },
            }}
            onSelectLesson={(lessonId) => bridge()?.openMapLesson(lessonId)}
          />
        }
        teacherNpc={
          <TeacherNpc
            service={{
              getCurrentUser: () => {
                const user = bridge()?.getCurrentUser()
                return user ? { id: user.id, level: Number((user as { level?: unknown }).level) || 0 } : null
              },
              loadQuestBoard: async (userId) => await firestoreApi.getTeacherQuestBoard(userId),
              acceptQuest: async (userId, questId) => await firestoreApi.acceptTeacherQuest(userId, questId),
              markStudied: async (userId, questId) => await firestoreApi.markTeacherQuestStudied(userId, questId),
              turnInQuest: async (userId, questId) => await firestoreApi.turnInTeacherQuest(userId, questId),
            }}
            onOpenMap={() => {
              // Land the student on the adventure map so they walk into the
              // lesson themselves. Mirrors DashboardShell's own navigate():
              // the event flips the shell's active tab, the bridge call does
              // the legacy map load (which also hydrates lesson data).
              window.dispatchEvent(new CustomEvent('nextgen:dashboard-tab', { detail: 'map' }))
              bridge()?.openDashboardTab('map')
            }}
            // Pushes the paid reward into the legacy user object so the HUD
            // updates immediately instead of after a manual refresh.
            onUserUpdate={(stats) => bridge()?.updateBattleUser(stats as Partial<BattleUser>)}
          />
        }
        home={
          <DashboardHome
            service={{
              getCurrentUser: () => bridge()?.getCurrentUser() as DashboardUser | null || null,
              getNews: () => bridge()?.getNews() || [],
              subscribeNews: (onNews, onError) => subscribeActiveNews(onNews, onError),
              loadDailyStatus: async (userId) => await firestoreApi.getDailyQuestStatus(userId) as DailyStatus,
              loadDailyQuests: async () => await firestoreApi.getDailyQuestConfig(),
              claimQuest: async (userId, questId, coins, xp) => await firestoreApi.completeDailyQuest(userId, questId, coins, xp) as RewardResult,
            }}
            onUserReward={(reward) => bridge()?.updateUserReward(reward)}
          />
        }
        rank={
          <Leaderboard
            service={{
              getCurrentUser: () => {
                const user = bridge()?.getCurrentUser() as unknown as { id: string; class: string } | null
                return user ? { id: user.id, class: user.class } : null
              },
              loadPlayers: async () => await firestoreApi.getLeaderboard() as PlayerResult,
              loadGuilds: async () => await firestoreApi.getGuildLeaderboard() as GuildResult,
            }}
            onClose={() => bridge()?.openDashboardTab('home')}
          />
        }
        profile={
          <PlayerProfile
            service={{
              getCurrentUser: () => {
                const user = bridge()?.getCurrentUser()
                return user ? { id: user.id } : null
              },
              loadProfile: async (userId) => await firestoreApi.getStudentProfileData(userId) as ProfileResult,
              allocateStat: async (userId, key) => await firestoreApi.allocateStatPoint(userId, key) as StatAllocationResult,
              equipCosmetic: async (userId, itemId) => await firestoreApi.equipCosmeticItem(userId, itemId) as { success: boolean; equipped?: boolean; inventory?: Record<string, unknown>; error?: string },
            }}
            onUserUpdate={(update) => bridge()?.updateBattleUser(update as Partial<BattleUser>)}
            onClose={() => bridge()?.openDashboardTab('home')}
          />
        }
        cert={
          <Certificate
            service={{
              getCurrentUser: () => bridge()?.getCurrentUser() as unknown as CertificateUser | null,
              getSettings: () => bridge()?.getSettings() || {},
              checkEligibility: async (userId) => await firestoreApi.checkCertificateEligibility(userId) as EligibilityResult,
            }}
            onEligible={() => bridge()?.openCertificateTab()}
            onDenied={(message) => bridge()?.showCertificateLocked(message)}
            onClose={() => bridge()?.openDashboardTab('home')}
          />
        }
        economy={
          <PlayerEconomy
            service={{
              getCurrentUser: () => bridge()?.getCurrentUser() as unknown as EconomyUser | null,
              buyItem: async (userId, itemId) => await firestoreApi.buyItem(userId, itemId),
              gacha: async (userId) => await firestoreApi.gachaAvatar(userId),
              buyCosmetic: async (userId, itemId) => await firestoreApi.buyCosmeticItem(userId, itemId),
              equipCosmetic: async (userId, itemId) => await firestoreApi.equipCosmeticItem(userId, itemId),
            }}
            onUserUpdate={(user) => bridge()?.updateBattleUser(user as Partial<BattleUser>)}
          />
        }
      />,
    )
    lessonApp.render(
      <LessonPage
        service={{
          getCurrentLesson: () => bridge()?.getCurrentLesson() || null,
          getCurrentUser: () => bridge()?.getCurrentUser() as unknown as BattleUser | null,
          getTimerPerQuestion: () => Number(bridge()?.getSettings().TimerPerQuestion) || 30,
          loadQuestions: async (lessonId) => await firestoreApi.getQuestions(lessonId),
          saveProgress: async (userId, lessonId, status, score, maxScore) => await firestoreApi.saveStudentProgress(userId, lessonId, status, score, maxScore),
          saveAdventureRewards: async (userId, xpGain, coinGain) => await firestoreApi.saveAdventureRewards(userId, xpGain, coinGain),
          trackDailyProgress: (type, questionId) => bridge()?.trackDailyProgress(type, questionId),
          // Opening the lesson is what earns a teacher quest's "study" objective.
          markLessonStudied: async (lessonId) => {
            const user = bridge()?.getCurrentUser()
            if (!user) return
            await firestoreApi.markTeacherQuestStudiedForLesson(user.id, lessonId)
          },
        }}
        onBack={() => bridge()?.backFromLesson()}
        onStartQuiz={() => bridge()?.startLessonQuiz()}
        onOpenWorksheet={() => bridge()?.openLessonWorksheet()}
        onUserUpdate={(user) => bridge()?.updateBattleUser(user as Partial<BattleUser>)}
        onExitGame={() => bridge()?.logout()}
      />,
    )
    pretestApp.render(
      <PretestPage
        service={{ loadQuestions: async (lessonId) => await firestoreApi.getPreTestQuestions(lessonId) }}
        onBack={() => bridge()?.backFromLesson()}
        onContinue={() => bridge()?.continueFromPretest()}
      />,
    )
    battleApp.render(
      <BossBattle
        service={{
          getCurrentUser: () => bridge()?.getCurrentUser() as unknown as BattleUser | null,
          getTimerPerQuestion: () => Number(bridge()?.getSettings().TimerPerQuestion) || 30,
          loadQuestions: async (lessonId) => await firestoreApi.getQuestions(lessonId),
          saveProgress: async (userId, lessonId, status, score, maxScore) => await firestoreApi.saveStudentProgress(userId, lessonId, status, score, maxScore),
          consumeItem: async (userId, itemId) => await firestoreApi.useItem(userId, itemId),
          trackDailyProgress: (type, questionId) => bridge()?.trackDailyProgress(type, questionId),
        }}
        onFinish={() => bridge()?.backFromLesson()}
        onUserUpdate={(user) => bridge()?.updateBattleUser(user)}
      />,
    )
    worksheetApp.render(
      <WorksheetPage
        service={{
          getCurrentLesson: () => bridge()?.getCurrentLesson() as WorksheetLesson | null,
          getCurrentUser: () => {
            const user = bridge()?.getCurrentUser() as unknown as { name?: string; class?: string; avatar?: string } | null
            return user ? { name: user.name || '', class: user.class || '', avatar: user.avatar } : null
          },
          saveSubmission: async (lessonId, answer) => {
            const user = bridge()?.getCurrentUser()
            if (!user) return { success: false, error: 'ไม่พบข้อมูลผู้เล่น' }
            return await firestoreApi.saveWorksheetSubmission(user.id, lessonId, answer) as WorksheetSubmissionResult
          },
        }}
        onBack={() => bridge()?.closeLessonWorksheet()}
        onUserUpdate={(stats: WorksheetSubmissionStats) => bridge()?.updateBattleUser(stats as Partial<BattleUser>)}
      />,
    )
    cyberApp.render(
      <CyberSafety
        service={{
          getCurrentUser: () => bridge()?.getCurrentUser() as unknown as CyberUser | null,
          loadScenarios: async () => await firestoreApi.getCyberSafetyScenarios(),
          saveResult: async (userId, shield, coins, xp) => await firestoreApi.saveCyberSafetyResult(userId, shield, coins, xp),
        }}
        onExit={() => bridge()?.exitCyberSafety()}
        onUserUpdate={(user) => bridge()?.updateBattleUser(user as Partial<BattleUser>)}
      />,
    )
    pvpApp.render(
      <PvpMode
        service={{
          getCurrentUser: () => bridge()?.getCurrentUser() as unknown as PvpModeUser | null,
          getRankings: getPvpRankings,
          quickJoin: quickJoinRoom,
          joinPrivate: joinPrivateRoom,
          subscribeRoom: subscribeToRoom,
          leaveRoom: leavePvpRoom,
          setReady: setPvpReady,
          switchTeam: switchPvpTeam,
          setTeamSize: setPvpTeamSize,
          startBattle: startPvpBattle,
          answerRound: answerPvpRound,
          timeoutRound: timeoutPvpRound,
          loadQuestions: async () => await firestoreApi.getQuestions('PVP_MODE'),
          sendChat: sendPvpChat,
          subscribeChat: subscribeToPvpChat,
          updatePresence: updatePvpPresence,
          subscribePresence: subscribeToPvpPresence,
          submitRanking: submitPvpRanking,
          grantReward: async (userId, xp, coins) => {
            const result = await firestoreApi.saveAdventureRewards(userId, xp, coins) as { success: boolean; stats?: Partial<BattleUser> }
            if (result.success && result.stats) bridge()?.updateBattleUser(result.stats)
            return result
          },
        }}
        onExit={() => bridge()?.exitPvp()}
      />,
    )
    aiTutorApp.render(
      <AiTutor
        service={{
          getCurrentUser: () => bridge()?.getCurrentUser() as unknown as AiTutorUser | null,
          getCurrentLessonTitle: () => bridge()?.getCurrentLesson()?.title || 'ไม่มีข้อมูลด่าน',
          ask: async (question, context) => await firestoreApi.askNPCAi(question, context),
          reset: resetTutorHistory,
        }}
      />,
    )
    worldBossApp.render(
      <WorldBoss
        service={{
          getCurrentUser: () => {
            const user = bridge()?.getCurrentUser() as unknown as (WorldBossUser & { class?: string }) | null
            return user ? { ...user, className: user.className || user.class || '' } : null
          },
          loadBosses: async () => await firestoreApi.getWorldBossConfig(),
          loadLeaderboard: async (bossId) => await firestoreApi.getWorldBossLeaderboard(bossId),
          submitScore: async (userId, bossId, score, bonusCoins) => await firestoreApi.submitWorldBossScore(userId, bossId, score, bonusCoins),
        }}
        onExit={() => bridge()?.exitWorldBoss()}
        onUserUpdate={(user) => bridge()?.updateBattleUser(user as Partial<BattleUser>)}
      />,
    )
    adminApp.render(
      <AdminPanel
        service={{
          verify: async (password) => await firestoreApi.verifyAdminPin(password),
          logout: endAdminSession,
          loadLessons: async () => await firestoreApi.getLessons(),
          saveLesson: async (lesson, password) => await firestoreApi.saveAdminLesson(lesson, password),
          deleteLesson: async (id, password) => await firestoreApi.deleteAdminLesson(id, password),
          loadQuestions: async (lessonId, type, password) => await firestoreApi.getAdminQuestionsByLessonAndType(lessonId, type, password),
          saveQuestions: async (lessonId, type, questions, password) => await firestoreApi.saveBatchQuestions(lessonId, type, questions, password),
          loadStudents: async (password) => await firestoreApi.getAdminStudents(password),
          resetStudent: async (id, password) => await firestoreApi.resetStudentData(id, password),
          deleteStudent: async (id, password) => await firestoreApi.deleteStudentData(id, password),
          unbindStudent: async (id, password) => await firestoreApi.unbindStudentDevice(id, password),
          resetAllStudents: async (className, password) => await firestoreApi.resetAllStudentData(className, password),
          unbindAllStudents: async (className, password) => await firestoreApi.unbindAllStudentDevices(className, password),
          unlockAllEquipment: async (id, password) => await firestoreApi.unlockAllStudentEquipment(id, password),
          unlockAllEquipmentForClass: async (className, password) => await firestoreApi.unlockAllEquipmentForClass(className, password),
          scanCleanup: async (keys, password) => await firestoreApi.scanSystemCleanup(keys, password),
          runCleanup: async (keys, confirmation, password) => await firestoreApi.runSystemCleanup(keys, confirmation, password),
          exportBackup: async (password) => await firestoreApi.exportSystemBackup(password),
          loadSettings: async () => await firestoreApi.getSettings(),
          saveSettings: async (settings, password) => await firestoreApi.saveSettings(settings, password),
          loadNews: async (password) => await firestoreApi.getAllNewsAdmin(password),
          saveNews: async (news, password) => await firestoreApi.saveNewsItem(news, password),
          deleteNews: async (id, password) => await firestoreApi.deleteNewsItem(id, password),
          loadReports: async (lessonId, password) => await firestoreApi.getExamReports(lessonId, password),
          generateProgressReport: async (student) => await firestoreApi.generateAIProgressReport(student),
          loadDailyQuests: async (password) => await firestoreApi.getAdminDailyQuests(password),
          saveDailyQuest: async (quest, password) => await firestoreApi.saveAdminDailyQuest(quest, password),
          loadTeacherQuests: async (password) => await firestoreApi.getAdminTeacherQuests(password),
          saveTeacherQuest: async (quest, password) => await firestoreApi.saveAdminTeacherQuest(quest, password),
          deleteTeacherQuest: async (questId, password) => await firestoreApi.deleteAdminTeacherQuest(questId, password),
          loadTeacherQuestSubmissions: async (questId, password) => await firestoreApi.getAdminTeacherQuestSubmissions(questId, password),
          loadCyberScenarios: async (password) => await firestoreApi.getAdminCyberScenarios(password),
          saveCyberScenario: async (scenario, password) => await firestoreApi.saveAdminCyberScenario(scenario, password),
          deleteCyberScenario: async (id, password) => await firestoreApi.deleteAdminCyberScenario(id, password),
          generateLesson: async (spec, password) => await firestoreApi.generateLessonAndQuizWithGemini(spec, undefined, password),
          loadAiSettings: async (password) => await firestoreApi.getAiSettingsAdmin(password),
          saveAiKey: async (key, password) => await firestoreApi.saveAiSettings(key, password),
          clearAiKey: async (password) => await firestoreApi.clearAiSettings(password),
          testAiKey: async (key) => await testGeminiKey(key),
        }}
        onExit={() => bridge()?.exitAdmin()}
      />,
    )
    overlayApp.render(
      <>
        <PageTransitionIndicator />
        <GameAudioControl />
        <LoginBonus
          service={{
            getCurrentUser: () => {
              const user = bridge()?.getCurrentUser()
              return user ? { id: user.id } : null
            },
            claim: async (userId) => await firestoreApi.claimLoginBonus(userId),
          }}
          onUserUpdate={(reward) => bridge()?.updateUserReward(reward)}
        />
        <HeroProfile
          service={{
            getCurrentUser: () => bridge()?.getCurrentUser() as unknown as HeroProfileUser | null,
            allocateStat: async (userId, key) => await firestoreApi.allocateStatPoint(userId, key) as { success: boolean; inventory?: HeroProfileInventory; remaining?: number; error?: string },
            equipCosmetic: async (userId, itemId) => await firestoreApi.equipCosmeticItem(userId, itemId) as { success: boolean; equipped?: boolean; inventory?: HeroProfileInventory; error?: string },
          }}
          onUserUpdate={(update) => bridge()?.updateBattleUser(update as Partial<BattleUser>)}
        />
      </>,
    )
    document.documentElement.dataset.backend = 'firestore'
    document.dispatchEvent(new Event('DOMContentLoaded'))
    if (document.readyState === 'complete') window.dispatchEvent(new Event('load'))

    return () => {
      landingApp.unmount()
      lobbyApp.unmount()
      lessonApp.unmount()
      pretestApp.unmount()
      battleApp.unmount()
      worksheetApp.unmount()
      cyberApp.unmount()
      pvpApp.unmount()
      aiTutorApp.unmount()
      dashboardApp.unmount()
      worldBossApp.unmount()
      adminApp.unmount()
      overlayApp.unmount()
      overlayTarget.remove()
      delete document.documentElement.dataset.backend
    }
  }, [])

  return <div dangerouslySetInnerHTML={{ __html: legacyBody }} />
}

export default memo(App)
