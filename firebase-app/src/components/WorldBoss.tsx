import { useCallback, useEffect, useRef, useState } from 'react'
import {
  gameFileForBoss,
  MARIO_EDUCATION_URL,
  MATH_SPEED_RACE_URL,
  motionArcadeBosses,
  normalizeWorldBosses,
  scorePresentation,
  validWorldBossResult,
  type WorldBossConfig,
} from './worldBossLogic'
import { gameAudio, musicForPage } from '../services/gameAudio'
import itemCoins from '../assets/ui/item-coins.png'
import iconStar from '../assets/ui/icon-star.png'
import arcadeBackground from '../assets/minigame-arcade-background.png'

// Every mini-game opens in its own tab/window with its own audio. Our hub's
// background music has no way to duck itself in that other tab, so instead we
// stop it here the moment a game launches and only bring it back once that
// window reports itself closed — polled via `Window.closed`, which stays
// readable even for the cross-origin external games (Mario, Math Speed Race).
const GAME_POPUP_POLL_MS = 700

function isWorldBossPageVisible(): boolean {
  const page = document.getElementById('page-world-boss')
  return !!page && !page.classList.contains('hidden')
}

export type WorldBossUser = {
  id: string
  name: string
  className?: string
  avatar?: string
  coins: number
  xp: number
}

type LeaderboardRow = { userId: string; name: string; className: string; bestTime: number; date: string }
type ScoreResult = {
  success: boolean
  error?: string
  newCoins?: number
  newXp?: number
  level?: number
  rank?: string
  rewardCoins?: number
  rewardXp?: number
  previousBest?: number | null
  bestTime?: number
  isPersonalBest?: boolean
  bossName?: string
}

export type WorldBossService = {
  getCurrentUser(): WorldBossUser | null
  loadBosses(): Promise<{ success: boolean; data?: WorldBossConfig[]; error?: string }>
  loadLeaderboard(bossId: string): Promise<{ success: boolean; data?: LeaderboardRow[]; error?: string }>
  submitScore(userId: string, bossId: string, score: number, bonusCoins: number): Promise<ScoreResult>
}

type Props = {
  service: WorldBossService
  onExit(): void
  onUserUpdate(user: { coins?: number; xp?: number; level?: number; rank?: string }): void
  openGame?: (url: string) => Window | null
  createSession?: () => string
}

const wb002Tabs = [
  ['WB002_10', '10 วินาที'],
  ['WB002_15', '15 วินาที'],
  ['WB002_20', '20 วินาที'],
  ['WB002_30', '30 วินาที'],
  ['WB002_SPEEDRUN', 'เคลียร์ 12 ข้อ'],
  ['WB002_1', 'โหมดทดสอบ 1 วินาที'],
] as const

type BossTheme = {
  tone: 'emerald' | 'cyan' | 'magenta'
  title: string
  emoji: string
  condition: string
  description: string
  border: string
  art: string
  glow: string
  chip: string
  text: string
  button: string
  buttonEdge: string
  tabActive: string
}

function displayBoss(boss: WorldBossConfig): BossTheme {
  if (boss.id === 'WB003' || boss.poseType === 'neck_quiz') return {
    tone: 'magenta',
    title: 'Neck-Tilt Quiz AI',
    emoji: '🧘‍♂️',
    condition: 'วิทยาการคำนวณ ม.2 · เอียงคอเลือกคำตอบ',
    description: 'ใช้กล้องตรวจจับการเอียงคอเพื่อเลือกคำตอบและพิชิตคะแนนความรู้วิทยาการคำนวณ',
    border: 'border-pink-500/40 hover:border-pink-400/70',
    art: 'from-pink-500/25 via-fuchsia-800/30 to-slate-950',
    glow: 'rgba(236,72,153,0.35)',
    chip: 'bg-pink-950/90 text-pink-300 border-pink-700/60',
    text: 'text-pink-300',
    button: 'from-pink-500 to-purple-600',
    buttonEdge: 'border-purple-900',
    tabActive: 'bg-pink-400 text-slate-950',
  }
  return {
    tone: 'cyan',
    title: 'สมรภูมิมือปราบภัย AI',
    emoji: '🛡️',
    condition: 'AI Safety Hand-Tracker',
    description: 'ใช้กล้องจีบนิ้วหรือเมาส์ลากการ์ดสถานการณ์ความปลอดภัยของ AI ลงหมวดหมู่ที่ถูกต้องและทำคะแนนสูงสุด',
    border: 'border-cyan-500/40 hover:border-cyan-400/70',
    art: 'from-cyan-500/25 via-indigo-800/30 to-slate-950',
    glow: 'rgba(6,182,212,0.35)',
    chip: 'bg-cyan-950/90 text-cyan-300 border-cyan-700/60',
    text: 'text-cyan-300',
    button: 'from-cyan-500 to-indigo-600',
    buttonEdge: 'border-indigo-900',
    tabActive: 'bg-cyan-400 text-slate-950',
  }
}

const guideChips = [
  ['📷', 'อนุญาตสิทธิ์กล้อง'],
  ['💡', 'แสงสว่างเพียงพอ'],
  ['🧍', 'อยู่กึ่งกลางเฟรม'],
  ['🖱️', 'รองรับเมาส์/คีย์บอร์ด'],
] as const

const menuChips = [
  ['🍄', 'Mario 8-Bit'],
  ['🏎️', 'Math Race 3D'],
  ['🕹️', 'Motion & AR'],
  ['🏆', 'เก็บสถิติ & อันดับ'],
] as const

// Top-level arcade menu. Kept separate from the Firestore boss configs: the two
// external cards open self-contained games in a new tab (no score pipeline),
// while the "category" card reveals the Motion & AR zone (the camera games that
// DO record scores). Adding a future top-level game = one more entry here.
type ArcadeMenuItem = {
  id: string
  kind: 'external' | 'category'
  tone: 'emerald' | 'cyan' | 'magenta'
  badge: string
  title: string
  subtitle: string
  emoji: string
  description: string
  stats: readonly (readonly [string, string])[]
  cta: string
  url?: string
}

const arcadeMenu: readonly ArcadeMenuItem[] = [
  {
    id: 'mario',
    kind: 'external',
    tone: 'emerald',
    badge: 'MINI-GAME',
    title: 'Mario Education',
    subtitle: 'Super Mario Land 8-Bit + คำถามความรู้',
    emoji: '🍄',
    description: 'ผจญภัยเก็บเหรียญสไตล์มาริโอ 8-Bit พร้อมคำถามท้าทาย 3 ระดับ เล่นด้วยคีย์บอร์ดหรือกล้อง เปิดเล่นในแท็บใหม่',
    stats: [['รูปแบบเกม', 'เกมเสริมภายนอก 🎮'], ['การเล่น', 'เปิดแท็บใหม่ • ไม่นับคะแนน']],
    cta: 'เล่นเลย',
    url: MARIO_EDUCATION_URL,
  },
  {
    id: 'math-speed-race',
    kind: 'external',
    tone: 'cyan',
    badge: 'MINI-GAME',
    title: 'Math Speed Race 3D',
    subtitle: 'แข่งรถคณิตศาสตร์ 3 มิติ',
    emoji: '🏎️',
    description: 'ซิ่งรถความเร็วสูงพร้อมตอบโจทย์คณิตให้ทันเวลา ฝึกคิดเลขเร็วในสนามแข่ง 3D สุดมันส์ เปิดเล่นในแท็บใหม่',
    stats: [['รูปแบบเกม', 'เกมเสริมภายนอก 🎮'], ['การเล่น', 'เปิดแท็บใหม่ • ไม่นับคะแนน']],
    cta: 'เล่นเลย',
    url: MATH_SPEED_RACE_URL,
  },
  {
    id: 'motion-arcade',
    kind: 'category',
    tone: 'magenta',
    badge: 'GAME ZONE',
    title: 'Motion & AR Arcade',
    subtitle: 'โซนเกมตรวจจับท่าทาง & AR',
    emoji: '🕹️',
    description: 'รวมมินิเกมที่ควบคุมด้วยกล้องและการเคลื่อนไหวร่างกาย บันทึกสถิติและไต่อันดับได้จริง พร้อมเปิดรับเกมใหม่ในอนาคต',
    stats: [['เกมในโซน', '2 เกม + เพิ่มเรื่อยๆ'], ['การเล่น', 'กล้อง • นับคะแนน 🏆']],
    cta: 'เข้าสู่โซน',
  },
]

const ARCADE_SLOTS = 3

export function WorldBoss({
  service,
  onExit,
  onUserUpdate,
  openGame = (url) => window.open(url, '_blank'),
  createSession = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
}: Props) {
  const [bosses, setBosses] = useState<WorldBossConfig[]>([])
  const [view, setView] = useState<'menu' | 'motion'>('menu')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [leaderboardId, setLeaderboardId] = useState<string | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([])
  const [leaderboardLoading, setLeaderboardLoading] = useState(false)
  const [notice, setNotice] = useState('')
  const activeGame = useRef<{ session: string; popup: Window } | null>(null)
  // Tracks every mini-game tab currently open, not just the last one — a
  // student can launch a second game without closing the first, and the hub's
  // music must stay off until every one of them is closed.
  const activePopups = useRef<Set<Window>>(new Set())

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (activePopups.current.size === 0) return
      for (const popup of activePopups.current) {
        if (popup.closed) activePopups.current.delete(popup)
      }
      if (activePopups.current.size > 0) return
      if (!isWorldBossPageVisible()) return
      const music = musicForPage('world-boss')
      if (music !== undefined) gameAudio.setMusic(music)
    }, GAME_POPUP_POLL_MS)
    return () => window.clearInterval(interval)
  }, [])

  const launchGame = (popup: Window): void => {
    activePopups.current.add(popup)
    // Stop synchronously (not setMusic(null)): the game opens in a new tab, so
    // this hub tab backgrounds immediately and its rAF-based fade would freeze,
    // leaving the music audible until the user tabs back. See gameAudio.stopImmediately.
    gameAudio.stopImmediately()
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    setNotice('')
    setView('menu')
    setLeaderboardId(null)
    try {
      const result = await service.loadBosses()
      if (!result.success) throw new Error(result.error || 'โหลดข้อมูล World Boss ไม่สำเร็จ')
      setBosses(normalizeWorldBosses(result.data || []))
    } catch (reason) {
      setBosses([])
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setLoading(false)
    }
  }, [service])

  useEffect(() => {
    const open = () => void load()
    window.addEventListener('nextgen:open-world-boss', open)
    return () => window.removeEventListener('nextgen:open-world-boss', open)
  }, [load])

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      const active = activeGame.current
      if (!active || event.origin !== window.location.origin || event.source !== active.popup) return
      const message = validWorldBossResult(event.data, active.session)
      if (!message) return
      activeGame.current = null
      setNotice('กำลังบันทึกสถิติ...')
      const user = service.getCurrentUser()
      if (!user) {
        setNotice('ไม่พบข้อมูลผู้เล่น จึงไม่สามารถบันทึกสถิติได้')
        return
      }
      const { bossId, score, bonusCoins } = message.payload
      void service.submitScore(user.id, bossId, score, bonusCoins).then((result) => {
        if (!result.success) {
          setNotice(result.error || 'บันทึกสถิติไม่สำเร็จ')
          return
        }
        const update = {
          ...(result.newCoins !== undefined ? { coins: result.newCoins } : {}),
          ...(result.newXp !== undefined ? { xp: result.newXp } : {}),
          ...(result.level !== undefined ? { level: result.level } : {}),
          ...(result.rank !== undefined ? { rank: result.rank } : {}),
        }
        onUserUpdate(update)
        if (result.isPersonalBest) localStorage.setItem(`wb_best_time_${user.id}_${bossId}`, String(result.bestTime ?? score))
        const shown = scorePresentation(bossId, score)
        setNotice(result.isPersonalBest
          ? `บันทึกสถิติสำเร็จ: ${shown.value} ${shown.unit} • +${result.rewardCoins || 0} เหรียญ • +${result.rewardXp || 0} XP`
          : `จบเกม: ${shown.value} ${shown.unit} • ยังไม่ทำลายสถิติเดิม (รางวัลใหญ่ได้เมื่อทำสถิติใหม่)`)
      }).catch((reason: unknown) => setNotice(reason instanceof Error ? reason.message : 'บันทึกสถิติไม่สำเร็จ'))
    }
    window.addEventListener('message', receive)
    return () => window.removeEventListener('message', receive)
  }, [onUserUpdate, service])

  const showLeaderboard = async (rawId: string) => {
    const bossId = rawId === 'WB002' ? 'WB002_10' : rawId
    setLeaderboardId(bossId)
    setLeaderboard([])
    setLeaderboardLoading(true)
    setError('')
    try {
      const result = await service.loadLeaderboard(bossId)
      if (!result.success) throw new Error(result.error || 'โหลดตารางอันดับไม่สำเร็จ')
      setLeaderboard(result.data || [])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setLeaderboardLoading(false)
    }
  }

  const openMenuItem = (item: ArcadeMenuItem) => {
    if (item.kind === 'category') {
      setError('')
      setNotice('')
      setLeaderboardId(null)
      setView('motion')
      return
    }
    const popup = openGame(item.url || '')
    if (!popup) {
      setError('เบราว์เซอร์บล็อกหน้าต่างเกม กรุณาอนุญาต Pop-up แล้วลองใหม่')
      return
    }
    launchGame(popup)
    setError('')
    setNotice(`เปิด ${item.title} ในแท็บใหม่แล้ว (มินิเกมเสริม ไม่มีการนับคะแนนในระบบ)`)
  }

  const exitMotionZone = () => {
    setLeaderboardId(null)
    setError('')
    setNotice('')
    setView('menu')
  }

  const start = (boss: WorldBossConfig) => {
    const user = service.getCurrentUser()
    if (!user) {
      setError('กรุณาล็อกอินก่อนเริ่ม World Boss')
      return
    }
    const session = createSession()
    const url = new URL(`/world-boss/${gameFileForBoss(boss)}`, window.location.origin)
    const params: Record<string, string> = {
      session,
      userId: user.id,
      userName: user.name,
      className: user.className || '',
      bossId: boss.id,
      bossName: displayBoss(boss).title,
      poseType: boss.poseType,
      targetReps: String(boss.targetReps),
      maxHp: String(boss.maxHp),
      rewardCoins: String(boss.rewardCoins),
      rewardXp: String(boss.rewardXp),
      lessonId: 'L-CURRENT',
    }
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value))
    const popup = openGame(url.toString())
    if (!popup) {
      setError('เบราว์เซอร์บล็อกหน้าต่างเกม กรุณาอนุญาต Pop-up แล้วลองใหม่')
      return
    }
    activeGame.current = { session, popup }
    launchGame(popup)
    setNotice('เปิดสมรภูมิในแท็บใหม่แล้ว เมื่อจบเกมระบบจะบันทึกผลกลับ Firestore อัตโนมัติ')
  }

  const currentUser = service.getCurrentUser()
  const motionBosses = motionArcadeBosses(bosses)
  const motionPlaceholders = Math.max(0, ARCADE_SLOTS - motionBosses.length)
  const leaderboardTheme = leaderboardId
    ? displayBoss(bosses.find((boss) => (leaderboardId.startsWith('WB002') ? boss.id.startsWith('WB002') : boss.id === leaderboardId)) || { id: leaderboardId, name: '', poseType: '', targetReps: 0, maxHp: 0, rewardCoins: 0, rewardXp: 0 })
    : null

  return (
    <div id="page-world-boss" className="world-boss-page hidden flex-1 flex-col relative z-20 h-full overflow-y-auto text-white">
      <section
        role="region"
        aria-label="AI Motion Arcade"
        className="world-boss-arcade-stage"
        style={{ backgroundImage: `url(${arcadeBackground})` }}
      >
        <div className="arcade-stage__scanlines" aria-hidden />
        <div className="arcade-stage__particles" aria-hidden>
          <i /><i /><i /><i /><i /><i />
        </div>

        <header className="arcade-stage__header">
          {view === 'motion' ? (
            <button type="button" aria-label="กลับเมนูมินิเกม" onClick={exitMotionZone} className="arcade-back-button">
              <span aria-hidden>‹</span>
              <span>กลับเมนูมินิเกม</span>
            </button>
          ) : (
            <button type="button" aria-label="กลับห้องโถงหลัก" onClick={onExit} className="arcade-back-button">
              <span aria-hidden>‹</span>
              <span>กลับห้องโถงหลัก</span>
            </button>
          )}

          <div className="arcade-title-console">
            <span className="arcade-title-console__light arcade-title-console__light--left" aria-hidden />
            <div>
              <p>{view === 'motion' ? 'AI MOTION ARCADE' : 'NEXTGEN ARCADE'}</p>
              <h2>{view === 'motion' ? 'มินิเกมตรวจจับท่าทาง' : 'ศูนย์รวมมินิเกม'}</h2>
            </div>
            <span className="arcade-title-console__light arcade-title-console__light--right" aria-hidden />
          </div>

          {currentUser ? (
            <div className="arcade-player-console">
              <span className="arcade-player-console__avatar" aria-hidden>{currentUser.avatar || '🧙‍♂️'}</span>
              <span className="arcade-player-console__identity">
                <strong>{currentUser.name}</strong>
                <small>{currentUser.className || 'ผู้เล่น'}</small>
              </span>
              <span className="arcade-player-console__coins">
                <img src={itemCoins} alt="" />
                <b>{currentUser.coins.toLocaleString()}</b>
              </span>
            </div>
          ) : <span className="arcade-player-console arcade-player-console--empty" aria-hidden />}
        </header>

        {view === 'motion' ? (
          <section aria-label="คู่มือเตรียมกล้อง AI" className="arcade-camera-guide">
            <div className="arcade-camera-guide__title">
              <span aria-hidden>⌁</span>
              <strong>คู่มือผู้ใช้งาน</strong>
              <small>AI Camera Guide</small>
            </div>
            <div className="arcade-camera-guide__items">
              {guideChips.map(([icon, label]) => (
                <span key={label}>
                  <b aria-hidden>{icon}</b>
                  <small>{label}</small>
                </span>
              ))}
            </div>
          </section>
        ) : (
          <section aria-label="โหมดเกมที่เลือกได้" className="arcade-camera-guide">
            <div className="arcade-camera-guide__title">
              <span aria-hidden>⌁</span>
              <strong>เลือกโหมดเกม</strong>
              <small>Game Modes</small>
            </div>
            <div className="arcade-camera-guide__items">
              {menuChips.map(([icon, label]) => (
                <span key={label}>
                  <b aria-hidden>{icon}</b>
                  <small>{label}</small>
                </span>
              ))}
            </div>
          </section>
        )}

        <div className="arcade-stage__feedback">
          {notice && <div role="status" className="arcade-message arcade-message--success"><span aria-hidden>✓</span>{notice}</div>}
          {error && <div role="alert" className="arcade-message arcade-message--error"><span aria-hidden>!</span>{error}</div>}
          {view === 'motion' && loading && <div className="arcade-message arcade-message--loading"><span className="arcade-spinner" aria-hidden />กำลังโหลดข้อมูลมินิเกม...</div>}
          {view === 'motion' && !loading && !error && motionBosses.length === 0 && <div className="arcade-message">ขณะนี้มินิเกมกำลังเตรียมพร้อม กรุณาลองใหม่อีกครั้ง</div>}
        </div>

        {view === 'menu' ? (
          <div className="arcade-game-grid">
            {arcadeMenu.map((item) => (
              <article key={item.id} className={`arcade-game-card arcade-game-card--${item.tone}`}>
                <div className="arcade-game-card__energy" aria-hidden><i /><i /><i /></div>
                <div className="arcade-game-card__topbar">
                  <span>{item.badge}</span>
                </div>

                <div className="arcade-game-card__content">
                  <header>
                    <h3>{item.title}</h3>
                    <p>{item.subtitle}</p>
                  </header>

                  <div className="arcade-game-card__art" aria-hidden>
                    <span className="arcade-game-card__orbit" />
                    <b>{item.emoji}</b>
                    <i /><i /><i />
                  </div>

                  <p className="arcade-game-card__description">{item.description}</p>

                  <div className="arcade-game-card__stats">
                    {item.stats.map(([label, value]) => (
                      <div key={label}>
                        <strong>{label}</strong>
                        <span>{value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  aria-label={`${item.kind === 'category' ? 'เข้าสู่' : 'เริ่มเล่น'} ${item.title}`}
                  onClick={() => openMenuItem(item)}
                  className="arcade-game-card__play"
                >
                  <span>{item.cta}</span>
                  <b aria-hidden>{item.kind === 'category' ? '→' : '↗'}</b>
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="arcade-game-grid">
            {motionBosses.map((boss) => {
              const theme = displayBoss(boss)
              const localBest = currentUser ? localStorage.getItem(`wb_best_time_${currentUser.id}_${boss.id}`) : null
              return (
                <article key={boss.id} className={`arcade-game-card arcade-game-card--${theme.tone}`}>
                  <div className="arcade-game-card__energy" aria-hidden><i /><i /><i /></div>
                  <div className="arcade-game-card__topbar">
                    <span>MINI-GAME</span>
                    <button type="button" aria-label={`ดูอันดับ ${theme.title}`} onClick={() => void showLeaderboard(boss.id)}>
                      <span aria-hidden>🏆</span>
                    </button>
                  </div>

                  <div className="arcade-game-card__content">
                    <header>
                      <h3>{theme.title}</h3>
                      <p>{theme.condition}</p>
                    </header>

                    <div className="arcade-game-card__art" aria-hidden>
                      <span className="arcade-game-card__orbit" />
                      <b>{theme.emoji}</b>
                      <i /><i /><i />
                    </div>

                    <p className="arcade-game-card__description">{theme.description}</p>

                    <div className="arcade-game-card__stats">
                      <div>
                        <strong>รางวัลสูงสุด</strong>
                        <span>
                          <img src={itemCoins} alt="เหรียญ" /> +{boss.rewardCoins}
                          <img src={iconStar} alt="XP" /> +{boss.rewardXp}
                        </span>
                      </div>
                      <div>
                        <strong>สถิติของคุณ</strong>
                        <span>{localBest || 'ยังไม่มีสถิติ'}</span>
                      </div>
                    </div>
                  </div>

                  <button type="button" aria-label={`เริ่มเล่น ${theme.title}`} onClick={() => start(boss)} className="arcade-game-card__play">
                    <span>เริ่มเล่น</span>
                    <b aria-hidden>⚔</b>
                  </button>
                </article>
              )
            })}
            {Array.from({ length: motionPlaceholders }).map((_, index) => (
              <article key={`soon-${index}`} className="arcade-game-card arcade-game-card--cyan arcade-game-card--soon" aria-label="ช่องเกมที่กำลังจะเปิด">
                <div className="arcade-game-card__energy" aria-hidden><i /><i /><i /></div>
                <div className="arcade-game-card__topbar">
                  <span>COMING SOON</span>
                </div>

                <div className="arcade-game-card__content">
                  <header>
                    <h3>เร็วๆ นี้</h3>
                    <p>เปิดรับมินิเกมใหม่</p>
                  </header>

                  <div className="arcade-game-card__art" aria-hidden>
                    <span className="arcade-game-card__orbit" />
                    <b>✨</b>
                    <i /><i /><i />
                  </div>

                  <p className="arcade-game-card__description">พื้นที่สำหรับมินิเกมตรวจจับท่าทางและ AR ใหม่ที่กำลังจะมาถึง</p>

                  <div className="arcade-game-card__stats">
                    <div>
                      <strong>สถานะ</strong>
                      <span>กำลังพัฒนา</span>
                    </div>
                    <div>
                      <strong>อัปเดต</strong>
                      <span>เร็วๆ นี้</span>
                    </div>
                  </div>
                </div>

                <button type="button" className="arcade-game-card__play" disabled aria-disabled="true">
                  <span>เร็วๆ นี้</span>
                  <b aria-hidden>✨</b>
                </button>
              </article>
            ))}
          </div>
        )}

        {leaderboardId && (
          <div className="arcade-leaderboard-overlay">
            <section aria-label="ตารางอันดับ World Boss" className="arcade-leaderboard">
              <div className={`arcade-leaderboard__header arcade-leaderboard__header--${leaderboardTheme?.tone || 'cyan'}`}>
                <h3>🏆 ทำเนียบสถิติที่ดีที่สุด (Top 10)</h3>
                <button type="button" aria-label="ปิดตารางอันดับ" onClick={() => setLeaderboardId(null)}>×</button>
              </div>
              {leaderboardId.startsWith('WB002') && (
                <div className="arcade-leaderboard__tabs">
                  {wb002Tabs.map(([id, label]) => (
                    <button type="button" key={id} aria-label={label} onClick={() => void showLeaderboard(id)} className={leaderboardId === id ? 'is-active' : ''}>{label}</button>
                  ))}
                </div>
              )}
              {leaderboardLoading ? (
                <div className="arcade-leaderboard__empty"><span className="arcade-spinner" aria-hidden />กำลังโหลดทำเนียบผู้กล้า...</div>
              ) : leaderboard.length === 0 ? (
                <div className="arcade-leaderboard__empty">ยังไม่มีผู้กล้าพิชิตบอสตัวนี้</div>
              ) : (
                <div className="arcade-leaderboard__table-wrap">
                  <table>
                    <thead><tr><th>อันดับ</th><th>ผู้กล้า</th><th>ชั้น</th><th>สถิติ</th><th>วันที่</th></tr></thead>
                    <tbody>
                      {leaderboard.map((row, index) => {
                        const shown = scorePresentation(leaderboardId, row.bestTime)
                        const isMe = row.userId === currentUser?.id
                        return (
                          <tr key={`${row.userId}-${index}`} className={isMe ? 'is-current-player' : ''}>
                            <td>{['🥇', '🥈', '🥉'][index] || index + 1}</td>
                            <td>{row.name}{isMe ? ' (คุณ)' : ''}</td>
                            <td>{row.className}</td>
                            <td>{shown.value} {shown.unit}</td>
                            <td>{row.date}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}
      </section>
    </div>
  )
}
