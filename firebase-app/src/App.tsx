import { useLayoutEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { LandingLogin, type LandingData, type LandingService, type LandingUser, type LoginResult } from './components/LandingLogin'
import { Lobby, type LobbyMode } from './components/Lobby'
import { AdventureMap, type MapResult, type MapUser } from './components/AdventureMap'
import { DashboardHome, type DailyStatus, type DashboardNews, type DashboardUser, type RewardResult } from './components/DashboardHome'
import { Leaderboard, type GuildResult, type PlayerResult } from './components/Leaderboard'
import { PlayerProfile, type ProfileResult } from './components/PlayerProfile'
import { Certificate, type CertificateSettings, type CertificateUser, type EligibilityResult } from './components/Certificate'
import { LessonPage, type Lesson } from './components/LessonPage'
import { PretestPage } from './components/PretestPage'
import { BossBattle, type BattleUser } from './components/BossBattle'
import { WorksheetPage, type WorksheetLesson } from './components/WorksheetPage'
import { CyberSafety, type CyberUser } from './components/CyberSafety'
import { PvpMode, type PvpUser } from './components/PvpMode'
import { AiTutor, type AiTutorUser } from './components/AiTutor'
import { PlayerEconomy, type EconomyUser } from './components/PlayerEconomy'
import { WorldBoss, type WorldBossUser } from './components/WorldBoss'
import { AdminPanel } from './components/AdminPanel'
import { LoginBonus } from './components/LoginBonus'
import { DashboardShell, type DashboardShellUser, type DashboardTab } from './components/DashboardShell'
import { legacyBody, legacyCss, legacyScript } from './legacy/sources'
import { endAdminSession } from './firebase/adminClient'
import { firestoreApi, getInitialData, loginStudent } from './services/firestoreApi'
import { installFirebaseServiceRunner } from './services/legacyRunner'
import { subscribeToMatch } from './services/pvpApi'

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
  updateUserReward(reward: { coins?: number; xp?: number; streak?: number }): void
  setMapData(payload: MapResult): void
  openMapLesson(lessonId: string): void
  openCertificateTab(): void
  showCertificateLocked(message: string): void
  getCurrentLesson(): Lesson | null
  backFromLesson(): void
  startLessonQuiz(): void
  openLessonWorksheet(): void
  continueFromPretest(): void
  trackDailyProgress(type: 'play1' | 'correct5', questionId?: string): void
  updateBattleUser(user: Partial<BattleUser>): void
  exitCyberSafety(): void
  exitPvp(): void
  exitWorldBoss(): void
}

const landingService: LandingService = {
  getInitialData: async () => await getInitialData() as LandingData,
  loginStudent: async (name, className, avatar) => await loginStudent(name, className, avatar) as LoginResult,
}

export default function App() {
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
    lobbyApp.render(<Lobby onSelectMode={(mode) => bridge()?.openLobbyMode(mode)} />)
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
            }}
            onSelectLesson={(lessonId) => bridge()?.openMapLesson(lessonId)}
          />
        }
        home={
          <DashboardHome
            service={{
              getCurrentUser: () => bridge()?.getCurrentUser() as DashboardUser | null || null,
              getNews: () => bridge()?.getNews() || [],
              loadDailyStatus: async (userId) => await firestoreApi.getDailyQuestStatus(userId) as DailyStatus,
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
            }}
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
          />
        }
        economy={
          <PlayerEconomy
            service={{
              getCurrentUser: () => bridge()?.getCurrentUser() as unknown as EconomyUser | null,
              buyItem: async (userId, itemId) => await firestoreApi.buyItem(userId, itemId) as never,
              gacha: async (userId) => await firestoreApi.gachaAvatar(userId) as never,
            }}
            onUserUpdate={(user) => bridge()?.updateBattleUser(user as Partial<BattleUser>)}
          />
        }
      />,
    )
    lessonApp.render(
      <LessonPage
        service={{ getCurrentLesson: () => bridge()?.getCurrentLesson() || null }}
        onBack={() => bridge()?.backFromLesson()}
        onStartQuiz={() => bridge()?.startLessonQuiz()}
        onOpenWorksheet={() => bridge()?.openLessonWorksheet()}
      />,
    )
    pretestApp.render(
      <PretestPage
        service={{ loadQuestions: async (lessonId) => await firestoreApi.getPreTestQuestions(lessonId) as never }}
        onBack={() => bridge()?.backFromLesson()}
        onContinue={() => bridge()?.continueFromPretest()}
      />,
    )
    battleApp.render(
      <BossBattle
        service={{
          getCurrentUser: () => bridge()?.getCurrentUser() as unknown as BattleUser | null,
          getTimerPerQuestion: () => Number(bridge()?.getSettings().TimerPerQuestion) || 30,
          loadQuestions: async (lessonId) => await firestoreApi.getQuestions(lessonId) as never,
          saveProgress: async (userId, lessonId, status, score, maxScore) => await firestoreApi.saveStudentProgress(userId, lessonId, status, score, maxScore) as never,
          consumeItem: async (userId, itemId) => await firestoreApi.useItem(userId, itemId) as never,
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
        }}
        onBack={() => bridge()?.continueFromPretest()}
      />,
    )
    cyberApp.render(
      <CyberSafety
        service={{
          getCurrentUser: () => bridge()?.getCurrentUser() as unknown as CyberUser | null,
          loadScenarios: async () => await firestoreApi.getCyberSafetyScenarios() as never,
          saveResult: async (userId, shield, coins, xp) => await firestoreApi.saveCyberSafetyResult(userId, shield, coins, xp) as never,
        }}
        onExit={() => bridge()?.exitCyberSafety()}
        onUserUpdate={(user) => bridge()?.updateBattleUser(user as Partial<BattleUser>)}
      />,
    )
    pvpApp.render(
      <PvpMode
        service={{
          getCurrentUser: () => bridge()?.getCurrentUser() as unknown as PvpUser | null,
          createOrJoinMatch: async (userId, name, avatar, roomCode) => await firestoreApi.createOrJoinMatch(userId, name, avatar, roomCode) as never,
          subscribeToMatch,
          loadQuestions: async () => await firestoreApi.getQuestions('PVP_MODE') as never,
          setReady: async (matchId, userId, ready) => await firestoreApi.setPlayerReady(matchId, userId, ready) as never,
          updateHp: async (matchId, userId, hp) => await firestoreApi.updateMatchScore(matchId, userId, hp) as never,
          finishMatch: async (matchId, userId) => await firestoreApi.finishMatch(matchId, userId) as never,
          leaveMatch: async (matchId) => await firestoreApi.leaveMatch(matchId) as never,
        }}
        onExit={() => bridge()?.exitPvp()}
      />,
    )
    aiTutorApp.render(
      <AiTutor
        service={{
          getCurrentUser: () => bridge()?.getCurrentUser() as unknown as AiTutorUser | null,
          getCurrentLessonTitle: () => bridge()?.getCurrentLesson()?.title || 'ไม่มีข้อมูลด่าน',
          ask: async (question, context) => await firestoreApi.askNPCAi(question, context) as never,
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
          loadBosses: async () => await firestoreApi.getWorldBossConfig() as never,
          loadLeaderboard: async (bossId) => await firestoreApi.getWorldBossLeaderboard(bossId) as never,
          submitScore: async (userId, bossId, score, bonusCoins) => await firestoreApi.submitWorldBossScore(userId, bossId, score, bonusCoins) as never,
        }}
        onExit={() => bridge()?.exitWorldBoss()}
        onUserUpdate={(user) => bridge()?.updateBattleUser(user as Partial<BattleUser>)}
      />,
    )
    adminApp.render(
      <AdminPanel
        service={{
          verify: async (password) => await firestoreApi.verifyAdminPin(password) as never,
          logout: endAdminSession,
          loadLessons: async () => await firestoreApi.getLessons() as never,
          saveLesson: async (lesson, password) => await firestoreApi.saveAdminLesson(lesson, password) as never,
          deleteLesson: async (id, password) => await firestoreApi.deleteAdminLesson(id, password) as never,
          loadQuestions: async (lessonId, type, password) => await firestoreApi.getAdminQuestionsByLessonAndType(lessonId, type, password) as never,
          saveQuestions: async (lessonId, type, questions, password) => await firestoreApi.saveBatchQuestions(lessonId, type, questions, password) as never,
          loadStudents: async (password) => await firestoreApi.getAdminStudents(password) as never,
          resetStudent: async (id, password) => await firestoreApi.resetStudentData(id, password) as never,
          deleteStudent: async (id, password) => await firestoreApi.deleteStudentData(id, password) as never,
          resetAllStudents: async (className, password) => await firestoreApi.resetAllStudentData(className, password) as never,
          loadSettings: async () => await firestoreApi.getSettings() as never,
          saveSettings: async (settings, password) => await firestoreApi.saveSettings(settings, password) as never,
          loadNews: async (password) => await firestoreApi.getAllNewsAdmin(password) as never,
          saveNews: async (news, password) => await firestoreApi.saveNewsItem(news, password) as never,
          deleteNews: async (id, password) => await firestoreApi.deleteNewsItem(id, password) as never,
          loadReports: async (lessonId, password) => await firestoreApi.getExamReports(lessonId, password) as never,
          generateProgressReport: async (student) => await firestoreApi.generateAIProgressReport(student) as never,
        }}
        onExit={() => bridge()?.exitAdmin()}
      />,
    )
    overlayApp.render(
      <LoginBonus
        service={{
          getCurrentUser: () => {
            const user = bridge()?.getCurrentUser()
            return user ? { id: user.id } : null
          },
          claim: async (userId) => await firestoreApi.claimLoginBonus(userId) as never,
        }}
        onUserUpdate={(reward) => bridge()?.updateUserReward(reward)}
      />,
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
