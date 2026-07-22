// Renovated PVP arena: duel (1v1) and team multiplayer (2v2/3v3/4v4) rooms
// with a walkable lobby map, realtime chat, and a quiz-race turn battle where
// the fastest correct answer strikes a random enemy. Game rules live in
// pvpRoomLogic.ts; Firestore traffic goes through services/pvpRoomApi.ts.
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import pvpArenaBackground from '../assets/pvp-arena-background.png'
import lobbyMapBackground from '../assets/generated/pvp-lobby-courtyard.jpg'
import pvpSelectBackground from '../assets/pvp-select-background.jpg'
import pvpScrollPanel from '../assets/ui/pvp/panel-scroll-ranking.png'
import pvpAvatarFrame from '../assets/ui/pvp/avatar-frame.png'
import pvpNameplate from '../assets/ui/pvp/nameplate.png'
import pvpBannerRibbon from '../assets/ui/pvp/banner-ribbon-plain.png'
import pvpCrownGold from '../assets/ui/pvp/crown-gold.png'
import pvpSealRed from '../assets/ui/pvp/seal-red.png'
import pvpBtnClose from '../assets/ui/pvp/btn-close.png'
import pvpModeDuelArt from '../assets/ui/pvp/mode-duel-art.webp'
import pvpModeTeamArt from '../assets/ui/pvp/mode-team-art.webp'
import { playSwordHit } from '../services/gameAudio'
import { characterLayerImages } from './characterAssets'
import {
  TEST_CHARACTER_SPRITE,
  directionForKey,
  directionTowardTarget,
  moveCharacter,
  moveTowardTarget,
  movementStepForElapsed,
  pointerToWalkPosition,
  spriteBackgroundPosition,
  type CharacterPosition,
  type WalkBounds,
  type WalkDirection,
} from './dashboardCharacter'
import {
  PVP_COUNTDOWN_SECONDS,
  PVP_LOBBY_WALK_BOUNDS,
  PVP_ROUND_SECONDS,
  PVP_TEAM_SIZES,
  battleScore,
  canStartBattle,
  clampPvpLobbyPosition,
  computeMvp,
  currentQuestionId,
  outcomeForPlayer,
  pvpMatchReward,
  rankingDelta,
  refereeId,
  sanitizeRoomCode,
  validRoomCode,
  type PvpOutcome,
  type PvpPlayer,
  type PvpRoomMode,
  type PvpTeam,
} from './pvpRoomLogic'
import type { JoinRoomResult, PvpChatMessage, PvpPresence, PvpRankingRow, PvpRoomView } from '../services/pvpRoomApi'
import type { QuizQuestion } from './QuizQuestionView'

export type PvpModeUser = {
  id: string
  name: string
  avatar?: string
  class?: string
  gender?: string
  level?: number
  xp?: number
  inventory?: unknown
}

type BasicResult = { success: boolean; error?: string }

export type PvpArenaService = {
  getCurrentUser(): PvpModeUser | null
  getRankings(): Promise<{ success: boolean; data: PvpRankingRow[] }>
  quickJoin(user: PvpModeUser, mode: PvpRoomMode, teamSize: number): Promise<JoinRoomResult>
  joinPrivate(user: PvpModeUser, mode: PvpRoomMode, teamSize: number, code: string): Promise<JoinRoomResult>
  subscribeRoom(roomId: string, onData: (room: PvpRoomView) => void, onError: (error: Error) => void): () => void
  leaveRoom(roomId: string, userId: string): Promise<BasicResult>
  setReady(roomId: string, userId: string, ready: boolean): Promise<BasicResult>
  switchTeam(roomId: string, userId: string): Promise<BasicResult>
  setTeamSize(roomId: string, userId: string, size: number): Promise<BasicResult>
  startBattle(roomId: string, userId: string, questionIds: string[]): Promise<BasicResult>
  answerRound(roomId: string, userId: string, round: number): Promise<BasicResult & { struck?: boolean }>
  timeoutRound(roomId: string, userId: string, round: number): Promise<BasicResult>
  loadQuestions(): Promise<{ success: boolean; data?: QuizQuestion[]; error?: string }>
  sendChat(roomId: string, user: PvpModeUser, text: string): Promise<BasicResult>
  subscribeChat(roomId: string, onData: (messages: PvpChatMessage[]) => void): () => void
  updatePresence(roomId: string, presence: { userId: string; x: number; y: number; direction: string; action: string }): Promise<void>
  subscribePresence(roomId: string, onData: (rows: PvpPresence[]) => void): () => void
  submitRanking(user: PvpModeUser, outcome: PvpOutcome): Promise<BasicResult>
  grantReward(userId: string, xp: number, coins: number): Promise<unknown>
}

type Props = { service: PvpArenaService; onExit(): void }
type View = 'idle' | 'select' | 'joining' | 'lobby' | 'battle' | 'result' | 'error'

const LOBBY_WALK_BOUNDS: WalkBounds = PVP_LOBBY_WALK_BOUNDS
const LOBBY_SPAWN: CharacterPosition = { x: 50, y: 68 }
const LOBBY_SPRITE_SIZE = 84
const BATTLE_SPRITE_SIZE = 96
const WALK_SPEED = 17
const MOVE_TICK_MS = 40
const FRAME_TICK_MS = 140
const PRESENCE_TICK_MS = 350
const FX_DURATION_MS = 1600
const TIMEOUT_GRACE_SECONDS = 2

const ALLY_SLOTS: CharacterPosition[] = [{ x: 26, y: 60 }, { x: 15, y: 68 }, { x: 30, y: 76 }, { x: 11, y: 54 }]
const ENEMY_SLOTS: CharacterPosition[] = [{ x: 74, y: 40 }, { x: 85, y: 32 }, { x: 70, y: 24 }, { x: 89, y: 46 }]
const TEAM_NAMES = ['ทีมอัศวิน 🔵', 'ทีมมังกร 🔴'] as const
const TEAM_COLORS = ['border-sky-400 text-sky-300', 'border-rose-400 text-rose-300'] as const

const PVP_STYLES = `
@keyframes pvp-zoom-in { 0% { transform: scale(2.6); opacity: 0; } 55% { transform: scale(1); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
@keyframes pvp-float-up { 0% { transform: translateY(0); opacity: 1; } 100% { transform: translateY(-64px); opacity: 0; } }
@keyframes pvp-hit-flash { 0%, 100% { filter: none; transform: translateX(0); } 20% { filter: brightness(2.4) sepia(1) hue-rotate(-50deg); transform: translateX(-7px); } 40% { transform: translateX(6px); } 60% { transform: translateX(-4px); } 80% { transform: translateX(3px); } }
@keyframes pvp-lunge-right { 0%, 100% { transform: translate(0, 0); } 45% { transform: translate(46px, -22px) scale(1.06); } }
@keyframes pvp-lunge-left { 0%, 100% { transform: translate(0, 0); } 45% { transform: translate(-46px, 22px) scale(1.06); } }
@keyframes pvp-banner-slide { 0% { transform: translateY(-24px); opacity: 0; } 12% { transform: translateY(0); opacity: 1; } 88% { transform: translateY(0); opacity: 1; } 100% { transform: translateY(-24px); opacity: 0; } }
@keyframes pvp-crit-shake { 0%, 100% { transform: translate(0, 0); } 25% { transform: translate(-6px, 4px); } 50% { transform: translate(5px, -5px); } 75% { transform: translate(-4px, -3px); } }
@keyframes pvp-pulse-ring { 0% { box-shadow: 0 0 0 0 rgba(250, 204, 21, .8); } 100% { box-shadow: 0 0 0 14px rgba(250, 204, 21, 0); } }
.pvp-countdown { animation: pvp-zoom-in .9s ease-out both; text-shadow: 0 0 26px rgba(250, 204, 21, .9), 0 6px 0 rgba(0,0,0,.55); }
.pvp-damage-pop { animation: pvp-float-up 1.4s ease-out both; text-shadow: 0 2px 0 #000, 0 0 14px rgba(248, 113, 113, .9); }
.pvp-hit { animation: pvp-hit-flash .7s ease-out both; }
.pvp-lunge-right { animation: pvp-lunge-right .7s ease-in-out both; }
.pvp-lunge-left { animation: pvp-lunge-left .7s ease-in-out both; }
.pvp-banner { animation: pvp-banner-slide 1.6s ease-in-out both; }
.pvp-crit-screen { animation: pvp-crit-shake .5s ease-in-out both; }
.pvp-ready-ring { animation: pvp-pulse-ring 1.4s ease-out infinite; }
`

function spriteLayers(player: Pick<PvpPlayer, 'equipped' | 'gender'>): string {
  const owned = Object.values(player.equipped).filter(Boolean)
  return characterLayerImages({ cosmetics: { owned, equipped: player.equipped } }, player.gender || undefined)
}

function spriteStyle(player: Pick<PvpPlayer, 'equipped' | 'gender'>, direction: WalkDirection, frame: number, size: number): CSSProperties {
  return {
    width: size,
    height: size,
    backgroundImage: spriteLayers(player),
    backgroundRepeat: 'no-repeat',
    backgroundSize: `${TEST_CHARACTER_SPRITE.columns * size}px ${TEST_CHARACTER_SPRITE.rows * size}px`,
    backgroundPosition: spriteBackgroundPosition(TEST_CHARACTER_SPRITE, direction, frame, size),
    imageRendering: 'pixelated',
  }
}

function HpBar({ hp, maxHp, small }: { hp: number; maxHp: number; small?: boolean }) {
  const percent = Math.max(0, Math.min(100, (hp / Math.max(1, maxHp)) * 100))
  const tone = percent > 50 ? 'from-emerald-500 to-lime-400' : percent > 25 ? 'from-amber-500 to-yellow-400' : 'from-rose-600 to-red-400'
  return (
    <div className={`${small ? 'h-1.5' : 'h-2.5'} w-full bg-slate-950/80 rounded-full overflow-hidden border border-black/60`}>
      <div className={`h-full bg-gradient-to-r ${tone} transition-all duration-500`} style={{ width: `${percent}%` }} />
    </div>
  )
}

function ModeCardArt({ tone, selected }: { tone: PvpRoomMode; selected: boolean }) {
  const duel = tone === 'duel'
  const art = duel ? pvpModeDuelArt : pvpModeTeamArt

  return (
    <div className="relative h-full w-full overflow-hidden">
      <img src={art} alt="" aria-hidden="true" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.045]" />
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-transparent to-slate-950/15" />
      <div className={`absolute left-3.5 top-3.5 rounded-full border px-3 py-1.5 text-[clamp(10px,.75vw,14px)] font-black tracking-wide text-white backdrop-blur-sm ${duel ? 'border-pink-200/70 bg-fuchsia-950/75' : 'border-sky-200/70 bg-sky-950/75'}`}>
        {duel ? 'SOLO DUEL' : 'TEAM BATTLE'}
      </div>
      {selected && (
        <div className={`absolute right-3.5 top-3.5 flex items-center gap-1 rounded-full border px-3 py-1.5 text-[clamp(10px,.75vw,14px)] font-black text-white backdrop-blur-sm ${duel ? 'border-pink-100/80 bg-pink-600/90' : 'border-sky-100/80 bg-sky-600/90'}`}>
          <span aria-hidden="true">✓</span> เลือกแล้ว
        </div>
      )}
    </div>
  )
}

export function PvpMode({ service, onExit }: Props) {
  const [view, setView] = useState<View>('idle')
  const [mode, setMode] = useState<PvpRoomMode>('duel')
  const [teamSize, setTeamSize] = useState(2)
  const [code, setCode] = useState('')
  const [message, setMessage] = useState('')
  const [rankings, setRankings] = useState<PvpRankingRow[]>([])
  const [showRankings, setShowRankings] = useState(true)
  const [room, setRoom] = useState<PvpRoomView | null>(null)
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [chat, setChat] = useState<PvpChatMessage[]>([])
  const [chatText, setChatText] = useState('')
  const [bubbles, setBubbles] = useState<Record<string, { text: string; at: number }>>({})
  const [presence, setPresence] = useState<PvpPresence[]>([])
  const [countdown, setCountdown] = useState<number | null>(null)
  const [timeLeft, setTimeLeft] = useState(PVP_ROUND_SECONDS)
  const [lockedRound, setLockedRound] = useState(0)
  const [answeredRound, setAnsweredRound] = useState(0)
  const [fx, setFx] = useState<{ attackerId: string; targetId: string; damage: number; crit: boolean; defeated: boolean; key: number } | null>(null)

  const [myPosition, setMyPosition] = useState<CharacterPosition>(LOBBY_SPAWN)
  const [myDirection, setMyDirection] = useState<WalkDirection>('down')
  const [myAction, setMyAction] = useState<'idle' | 'walk'>('idle')
  const [walkFrame, setWalkFrame] = useState(0)

  const unsubscribeRef = useRef<Array<() => void>>([])
  const roomIdRef = useRef('')
  const leavingRef = useRef(false)
  const countdownDoneRef = useRef(false)
  const timeoutFiredRef = useRef(0)
  const fxRoundRef = useRef(0)
  const resultRecordedRef = useRef(false)
  const myPositionRef = useRef(myPosition)
  const walkTargetRef = useRef<CharacterPosition | null>(null)
  const heldDirectionRef = useRef<WalkDirection | null>(null)
  const presenceSentRef = useRef('')
  const mapRef = useRef<HTMLDivElement>(null)
  myPositionRef.current = myPosition

  const me = service.getCurrentUser()
  const myId = me?.id || ''

  const stopSubscriptions = useCallback(() => {
    for (const stop of unsubscribeRef.current) stop()
    unsubscribeRef.current = []
  }, [])

  const reset = useCallback(() => {
    stopSubscriptions()
    roomIdRef.current = ''
    leavingRef.current = false
    countdownDoneRef.current = false
    timeoutFiredRef.current = 0
    fxRoundRef.current = 0
    resultRecordedRef.current = false
    walkTargetRef.current = null
    heldDirectionRef.current = null
    presenceSentRef.current = ''
    setRoom(null)
    setQuestions([])
    setChat([])
    setBubbles({})
    setPresence([])
    setCountdown(null)
    setLockedRound(0)
    setAnsweredRound(0)
    setFx(null)
    setMessage('')
    setCode('')
    setMyPosition(LOBBY_SPAWN)
    setMyAction('idle')
    setView('select')
    void service.getRankings().then((result) => setRankings(result.data || [])).catch(() => setRankings([]))
  }, [service, stopSubscriptions])

  useEffect(() => {
    const open = () => reset()
    window.addEventListener('nextgen:open-pvp', open)
    return () => {
      window.removeEventListener('nextgen:open-pvp', open)
      stopSubscriptions()
    }
  }, [reset, stopSubscriptions])

  const onRoom = useCallback((next: PvpRoomView) => {
    setRoom(next)
    if (next.status === 'LOBBY') setView('lobby')
    else if (next.status === 'PLAYING') setView('battle')
    else if (next.status === 'FINISHED') setView('result')
    else if (next.status === 'CANCELLED') {
      if (leavingRef.current) return
      stopSubscriptions()
      setMessage('ห้องถูกยกเลิก หรือหัวหน้าห้องออกจากห้องแล้ว')
      setView('error')
    }
  }, [stopSubscriptions])

  const attachRoom = useCallback((roomId: string) => {
    stopSubscriptions()
    roomIdRef.current = roomId
    unsubscribeRef.current = [
      service.subscribeRoom(roomId, onRoom, () => {
        setMessage('การเชื่อมต่อห้องประลองขัดข้อง')
        setView('error')
      }),
      service.subscribeChat(roomId, (messages) => {
        setChat(messages)
        setBubbles((current) => {
          const next = { ...current }
          const now = Date.now()
          for (const item of messages.slice(-6)) {
            if (!next[item.userId] || next[item.userId].text !== item.text) next[item.userId] = { text: item.text, at: now }
          }
          return next
        })
      }),
      service.subscribePresence(roomId, setPresence),
    ]
    void service.loadQuestions().then((result) => {
      if (result.success && result.data) setQuestions(result.data)
    }).catch(() => undefined)
  }, [onRoom, service, stopSubscriptions])

  const join = useCallback(async (kind: 'public' | 'private', selectedMode: PvpRoomMode = mode) => {
    if (!me) return
    const sanitized = sanitizeRoomCode(code)
    if (kind === 'private' && !validRoomCode(sanitized)) {
      setMessage('รหัสห้องต้องเป็นตัวอักษรอังกฤษ/ตัวเลข 4-8 ตัว')
      return
    }
    setMessage('')
    setView('joining')
    try {
      const size = selectedMode === 'duel' ? 1 : teamSize
      const result = kind === 'public'
        ? await service.quickJoin(me, selectedMode, size)
        : await service.joinPrivate(me, selectedMode, size, sanitized)
      if (!result.success) throw new Error(result.error || 'join failed')
      attachRoom(result.roomId)
    } catch (error) {
      setMessage(error instanceof Error && error.message !== 'join failed' ? error.message : 'ค้นหาห้องประลองไม่สำเร็จ ลองใหม่อีกครั้ง')
      setView('error')
    }
  }, [attachRoom, code, me, mode, service, teamSize])

  const leave = useCallback(async () => {
    const roomId = roomIdRef.current
    leavingRef.current = true
    stopSubscriptions()
    if (roomId && me) await service.leaveRoom(roomId, me.id).catch(() => undefined)
    reset()
  }, [me, reset, service, stopSubscriptions])

  // ---- Lobby walking -------------------------------------------------------
  useEffect(() => {
    if (view !== 'lobby') return
    const moveTimer = window.setInterval(() => {
      const held = heldDirectionRef.current
      if (held) {
        walkTargetRef.current = null
        const next = moveCharacter(myPositionRef.current, held, movementStepForElapsed(MOVE_TICK_MS, WALK_SPEED), LOBBY_WALK_BOUNDS)
        myPositionRef.current = next
        setMyDirection(held)
        setMyPosition(next)
        setMyAction('walk')
        return
      }
      const target = walkTargetRef.current
      if (!target) return
      const result = moveTowardTarget(myPositionRef.current, target, movementStepForElapsed(MOVE_TICK_MS, WALK_SPEED), LOBBY_WALK_BOUNDS)
      setMyDirection(directionTowardTarget(myPositionRef.current, target))
      myPositionRef.current = result.position
      setMyPosition(result.position)
      setMyAction(result.reached ? 'idle' : 'walk')
      if (result.reached) walkTargetRef.current = null
    }, MOVE_TICK_MS)
    const frameTimer = window.setInterval(() => setWalkFrame((frame) => frame + 1), FRAME_TICK_MS)
    const bubbleTimer = window.setInterval(() => setBubbles((current) => ({ ...current })), 2000)
    return () => {
      window.clearInterval(moveTimer)
      window.clearInterval(frameTimer)
      window.clearInterval(bubbleTimer)
    }
  }, [view])

  useEffect(() => {
    if (view !== 'lobby') return
    const down = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement | null)?.tagName === 'INPUT') return
      const direction = directionForKey(event.key)
      if (direction) heldDirectionRef.current = direction
    }
    const up = (event: KeyboardEvent) => {
      if (directionForKey(event.key) === heldDirectionRef.current) {
        heldDirectionRef.current = null
        setMyAction('idle')
      }
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [view])

  useEffect(() => {
    if (view !== 'lobby' || !me) return
    const timer = window.setInterval(() => {
      const snapshot = `${Math.round(myPositionRef.current.x)}|${Math.round(myPositionRef.current.y)}|${myDirection}|${myAction}`
      if (snapshot === presenceSentRef.current) return
      presenceSentRef.current = snapshot
      void service.updatePresence(roomIdRef.current, {
        userId: me.id,
        x: myPositionRef.current.x,
        y: myPositionRef.current.y,
        direction: myDirection,
        action: myAction,
      })
    }, PRESENCE_TICK_MS)
    return () => window.clearInterval(timer)
  }, [me, myAction, myDirection, service, view])

  const walkTo = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = mapRef.current?.getBoundingClientRect()
    if (!rect || rect.width <= 0) return
    heldDirectionRef.current = null
    walkTargetRef.current = pointerToWalkPosition(event.clientX, event.clientY, rect, LOBBY_WALK_BOUNDS)
    setMyAction('walk')
  }, [])

  // ---- Battle round machinery ---------------------------------------------
  const battleRound = room?.battle?.round ?? 0

  useEffect(() => {
    if (view !== 'battle') return
    if (battleRound !== 1 || room?.battle?.lastAction) {
      countdownDoneRef.current = true
      setCountdown(null)
      return
    }
    if (countdownDoneRef.current) return
    setCountdown(PVP_COUNTDOWN_SECONDS)
    const timer = window.setInterval(() => {
      setCountdown((current) => {
        if (current === null) return null
        if (current <= 0) {
          window.clearInterval(timer)
          countdownDoneRef.current = true
          return null
        }
        return current - 1
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [battleRound, room?.battle?.lastAction, view])

  useEffect(() => {
    if (view !== 'battle' || countdown !== null || battleRound === 0) return
    setTimeLeft(PVP_ROUND_SECONDS)
    const timer = window.setInterval(() => setTimeLeft((current) => current - 1), 1000)
    return () => window.clearInterval(timer)
  }, [battleRound, countdown, view])

  useEffect(() => {
    if (view !== 'battle' || !room || !me || battleRound === 0) return
    if (timeLeft > -TIMEOUT_GRACE_SECONDS || timeoutFiredRef.current === battleRound) return
    if (refereeId(room) !== me.id) return
    timeoutFiredRef.current = battleRound
    void service.timeoutRound(roomIdRef.current, me.id, battleRound).catch(() => undefined)
  }, [battleRound, me, room, service, timeLeft, view])

  useEffect(() => {
    const action = room?.battle?.lastAction
    if (!action || action.round === fxRoundRef.current) return
    fxRoundRef.current = action.round
    playSwordHit()
    setFx({ ...action, key: Date.now() })
    const timer = window.setTimeout(() => setFx(null), FX_DURATION_MS)
    return () => window.clearTimeout(timer)
  }, [room?.battle?.lastAction])

  useEffect(() => {
    if (view !== 'result' || !room || !me || resultRecordedRef.current) return
    resultRecordedRef.current = true
    const outcome = outcomeForPlayer(room, me.id)
    const reward = pvpMatchReward(outcome)
    void service.submitRanking(me, outcome).catch(() => undefined)
    void service.grantReward(me.id, reward.xp, reward.coins).catch(() => undefined)
  }, [me, room, service, view])

  const questionById = useMemo(() => {
    const map: Record<string, QuizQuestion> = {}
    for (const question of questions) map[question.qId] = question
    return map
  }, [questions])

  const activeQuestion = room?.battle ? questionById[currentQuestionId(room.battle)] : undefined

  const answer = useCallback((optionIndex: number) => {
    if (!me || !room?.battle || !activeQuestion) return
    const round = room.battle.round
    if (lockedRound === round || answeredRound === round) return
    if (optionIndex !== activeQuestion.answer) {
      setLockedRound(round)
      return
    }
    setAnsweredRound(round)
    void service.answerRound(roomIdRef.current, me.id, round).catch(() => undefined)
  }, [activeQuestion, answeredRound, lockedRound, me, room, service])

  if (view === 'idle') return <section id="page-pvp" className="hidden" />

  const players = room ? Object.values(room.players) : []
  const myPlayer = room?.players[myId]
  const myTeam: PvpTeam = myPlayer?.team ?? 0
  const isHost = room?.hostId === myId
  const startCheck = room ? canStartBattle(room) : { ok: false, reason: '' }
  const roomCodeLabel = room?.roomId.startsWith('PRIVATE_') ? room.roomId.slice('PRIVATE_'.length) : ''

  return (
    <section
      id="page-pvp"
      className="isolate z-[60] pointer-events-auto flex flex-1 absolute inset-0 w-full h-full overflow-hidden bg-slate-950 text-white font-prompt"
      style={{ backgroundImage: `linear-gradient(rgba(2,6,23,.72),rgba(2,6,23,.88)),url(${pvpArenaBackground})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
    >
      <style>{PVP_STYLES}</style>

      {view === 'select' && (
        <div
          className="absolute inset-0 overflow-x-hidden overflow-y-auto bg-no-repeat bg-cover bg-center flex flex-col items-center"
          style={{ backgroundImage: `url(${pvpSelectBackground})` }}
        >
          {/* pt clears the "PVP ARENA" title baked into the background art */}
          <div className="w-full max-w-[1480px] min-h-full flex flex-col items-center px-[clamp(14px,2vw,32px)] pb-5 pt-[clamp(160px,12vw,215px)]">
            <div className="shrink-0 mb-[1.6vh] px-5 py-1.5 rounded-full bg-gradient-to-b from-amber-100/95 to-amber-200/90 border-2 border-amber-700/80 shadow-[0_4px_14px_rgba(0,0,0,.5)]">
              <p className="text-amber-950 font-black text-[clamp(10px,1.5vw,14px)] text-center tracking-wide">ศึกประลองความรู้เรียลไทม์ — ท้าเพื่อนทั้งห้องได้เลย</p>
            </div>

            <div className="w-full flex flex-col xl:flex-1 xl:min-h-0 xl:flex-row gap-5 xl:gap-7 items-stretch">
              {/* Left: each game mode carries its own room action in one card */}
              <div className="flex flex-none flex-col gap-[1.4vh] justify-start xl:flex-[3] xl:min-h-0 xl:justify-center">
                {/* Two complete destination cards: duel/public and team/private */}
                <div className="mx-auto grid w-full max-w-[820px] grid-cols-1 gap-5 sm:grid-cols-2 lg:gap-6">
                  <div className={`relative aspect-[4/5] min-w-0 overflow-hidden rounded-[26px] border-[4px] bg-[#1b2130] transition-transform duration-200 ${mode === 'duel' ? 'scale-[1.018] border-pink-300 shadow-[0_0_0_2px_rgba(88,28,68,.9),0_0_30px_rgba(244,114,182,.65),0_16px_30px_rgba(15,23,42,.52)]' : 'border-amber-200/80 shadow-[0_0_0_2px_rgba(92,56,29,.9),0_14px_26px_rgba(15,23,42,.46)]'}`}>
                    <button type="button" onClick={() => setMode('duel')} aria-pressed={mode === 'duel'} className="group block h-[43%] w-full text-left focus:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-pink-200/90">
                      <ModeCardArt tone="duel" selected={mode === 'duel'} />
                    </button>
                    <div className="flex h-[57%] flex-col bg-[linear-gradient(180deg,#f8e4af_0%,#e5b96d_100%)] px-[clamp(12px,1vw,18px)] pb-[clamp(12px,1vw,18px)] pt-[clamp(10px,.8vw,15px)] text-center shadow-[inset_0_2px_0_rgba(255,255,255,.6)]">
                      <h3 className="font-black text-[clamp(18px,1.55vw,28px)] leading-tight text-fuchsia-950">ท้าดวล 1v1</h3>
                      <p className="mt-1 text-[clamp(11px,.82vw,14px)] font-semibold leading-[1.3] text-amber-950/80">ตอบให้ถูกและไวกว่า เพื่อชิงจังหวะโจมตี!</p>
                      <div className="mt-auto rounded-2xl border border-emerald-950/20 bg-[#f8e5b3]/85 px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,.7)]">
                        <h4 className="font-black text-[clamp(13px,1vw,18px)] text-emerald-900">ห้องสาธารณะ</h4>
                        <p className="mt-1 text-[clamp(10px,.72vw,13px)] leading-snug text-amber-950/75">จับคู่กับคู่ต่อสู้ที่กำลังรอ หรือเปิดห้องใหม่อัตโนมัติ</p>
                        <button type="button" onClick={() => { setMode('duel'); void join('public', 'duel') }} className="mt-3 flex min-h-11 w-full items-center justify-center rounded-xl border-2 border-sky-200 bg-[linear-gradient(180deg,#4f9be5_0%,#24519a_100%)] px-3 font-black text-[clamp(12px,.9vw,16px)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.45),0_3px_0_#163666] hover:brightness-110">จับคู่สาธารณะ</button>
                      </div>
                    </div>
                    {['left-1.5 top-1.5', 'right-1.5 top-1.5', 'bottom-1.5 left-1.5', 'bottom-1.5 right-1.5'].map((position) => <span key={position} aria-hidden="true" className={`absolute h-2.5 w-2.5 rotate-45 rounded-[2px] border border-white/70 ${position} bg-pink-400 shadow-[0_1px_3px_rgba(0,0,0,.7)]`} />)}
                  </div>

                  <div className={`relative aspect-[4/5] min-w-0 overflow-hidden rounded-[26px] border-[4px] bg-[#1b2130] transition-transform duration-200 ${mode === 'team' ? 'scale-[1.018] border-sky-200 shadow-[0_0_0_2px_rgba(24,63,98,.9),0_0_30px_rgba(56,189,248,.65),0_16px_30px_rgba(15,23,42,.52)]' : 'border-amber-200/80 shadow-[0_0_0_2px_rgba(92,56,29,.9),0_14px_26px_rgba(15,23,42,.46)]'}`}>
                    <button type="button" onClick={() => setMode('team')} aria-pressed={mode === 'team'} className="group block h-[43%] w-full text-left focus:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-sky-200/90">
                      <ModeCardArt tone="team" selected={mode === 'team'} />
                    </button>
                    <div className="flex h-[57%] flex-col bg-[linear-gradient(180deg,#f8e4af_0%,#e5b96d_100%)] px-[clamp(12px,1vw,18px)] pb-[clamp(12px,1vw,18px)] pt-[clamp(10px,.8vw,15px)] text-center shadow-[inset_0_2px_0_rgba(255,255,255,.6)]">
                      <h3 className="font-black text-[clamp(18px,1.55vw,28px)] leading-tight text-sky-950">ศึกทีม Multiplayer</h3>
                      <p className="mt-1 text-[clamp(11px,.82vw,14px)] font-semibold leading-[1.3] text-amber-950/80">รวมทีม แล้วชิงชัยด้วยความรู้ไปพร้อมกัน</p>
                      <div className="mt-auto rounded-2xl border border-amber-950/20 bg-[#f8e5b3]/85 px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,.7)]">
                        <h4 className="font-black text-[clamp(13px,1vw,18px)] text-amber-900">ห้องส่วนตัว</h4>
                        <div className="mt-1.5 flex justify-center gap-2">
                          {PVP_TEAM_SIZES.map((size) => <button key={size} type="button" onClick={() => { setMode('team'); setTeamSize(size) }} className={`rounded-lg border px-2.5 py-1 text-[clamp(10px,.7vw,13px)] font-black transition ${teamSize === size && mode === 'team' ? 'border-sky-100 bg-sky-500 text-slate-950' : 'border-amber-900/30 bg-amber-100/70 text-amber-950 hover:border-sky-400'}`}>{size} vs {size}</button>)}
                        </div>
                        <input value={code} onChange={(event) => setCode(sanitizeRoomCode(event.target.value))} placeholder="รหัสห้อง 4-8 ตัว" className="mt-2 h-11 w-full rounded-lg border border-amber-950/25 bg-amber-950/70 px-3 text-center text-[clamp(12px,.82vw,15px)] font-black tracking-widest text-amber-50 placeholder:text-amber-200/60 uppercase outline-none focus:border-sky-200" />
                        <button type="button" onClick={() => { setMode('team'); void join('private', 'team') }} className="mt-3 flex min-h-11 w-full items-center justify-center rounded-xl border-2 border-fuchsia-200 bg-[linear-gradient(180deg,#bb62dc_0%,#6d278f_100%)] px-3 font-black text-[clamp(12px,.86vw,15px)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.45),0_3px_0_#40145d] hover:brightness-110">เข้าห้องส่วนตัว / สร้างห้อง</button>
                      </div>
                    </div>
                    {['left-1.5 top-1.5', 'right-1.5 top-1.5', 'bottom-1.5 left-1.5', 'bottom-1.5 right-1.5'].map((position) => <span key={position} aria-hidden="true" className={`absolute h-2.5 w-2.5 rotate-45 rounded-[2px] border border-white/70 ${position} bg-sky-400 shadow-[0_1px_3px_rgba(0,0,0,.7)]`} />)}
                  </div>
                </div>
                {message && <p className="shrink-0 text-red-200 font-bold text-sm text-center drop-shadow-[0_1px_2px_rgba(0,0,0,.9)]">{message}</p>}
              </div>

              {/* Right: ranking scroll */}
              {showRankings ? (
                <div className="relative mx-auto w-full max-w-[520px] flex-none aspect-[350/417] bg-no-repeat bg-center [background-size:100%_100%] xl:mx-0 xl:h-full xl:max-h-full xl:w-auto xl:flex-[2] xl:min-h-0" style={{ backgroundImage: `url(${pvpScrollPanel})` }}>
                  <h3 className="absolute left-[11%] top-[5%] font-black text-[clamp(12px,1.5vw,17px)] text-amber-950">🏆 อันดับนักสู้ PVP</h3>
                  <button
                    type="button"
                    onClick={() => setShowRankings(false)}
                    aria-label="ซ่อนอันดับ"
                    className="absolute right-[4%] top-[1.5%] w-[12%] aspect-square bg-no-repeat bg-center [background-size:100%_100%] hover:brightness-110"
                    style={{ backgroundImage: `url(${pvpBtnClose})` }}
                  />
                  <div className="absolute left-[9%] right-[9%] top-[14%] bottom-[22%] overflow-y-auto pr-1 flex flex-col gap-2">
                    {rankings.length === 0 && <p className="text-amber-950/70 text-[11px] text-center mt-6">ยังไม่มีการจัดอันดับ — ประเดิมสนามเป็นคนแรกเลย!</p>}
                    {rankings.map((row, index) => (
                      <div key={row.userId} className="relative h-9 md:h-10 shrink-0 flex items-stretch">
                        {index === 0 && (
                          <img src={pvpCrownGold} alt="" className="absolute -left-1.5 -top-2.5 w-5 h-5 md:w-6 md:h-6 z-10 drop-shadow-[0_2px_2px_rgba(0,0,0,.6)]" />
                        )}
                        <div className="w-9 md:w-10 bg-no-repeat bg-center [background-size:100%_100%] flex items-center justify-center text-base md:text-lg" style={{ backgroundImage: `url(${pvpAvatarFrame})` }}>
                          {row.avatar}
                        </div>
                        <div className="flex-1 -ml-1 bg-no-repeat bg-center [background-size:100%_100%] flex items-center justify-between pl-3.5 pr-3" style={{ backgroundImage: `url(${pvpNameplate})` }}>
                          <div className="min-w-0">
                            <div className="font-bold text-[11px] md:text-xs text-amber-950 truncate leading-tight">{row.name}</div>
                            <div className="text-[9px] md:text-[10px] text-amber-900/70 leading-tight">LV {row.level} • {row.class}</div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="font-black text-[11px] md:text-xs text-amber-900">{row.rating}</span>
                            <img src={pvpSealRed} alt="" className="w-3.5 h-3.5 md:w-4 md:h-4" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowRankings(true)}
                  className="flex-none xl:flex-[2] self-start w-full max-w-sm mx-auto xl:mx-0 h-11 rounded-2xl bg-amber-100/90 border-2 border-amber-700/80 font-black text-amber-950 text-sm hover:brightness-105"
                >🏆 แสดงอันดับนักสู้ PVP</button>
              )}
            </div>

            <button
              type="button"
              onClick={onExit}
              className="shrink-0 mt-[1.4vh] w-56 aspect-[335/77] bg-no-repeat bg-center [background-size:100%_100%] font-black text-amber-50 text-[clamp(12px,1.4vw,16px)] tracking-wide drop-shadow-[0_1px_2px_rgba(0,0,0,.8)] hover:brightness-110"
              style={{ backgroundImage: `url(${pvpBannerRibbon})` }}
            >ออกจากสนามประลอง</button>
          </div>
        </div>
      )}

      {view === 'joining' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 px-4 text-center">
          <div className="text-6xl animate-spin mb-4">⌛</div>
          <h2 className="text-3xl font-black">กำลังหาห้องประลอง...</h2>
          <button type="button" onClick={() => void leave()} className="mt-6 px-6 py-2 bg-red-600 rounded-full font-bold">ยกเลิก</button>
        </div>
      )}

      {view === 'lobby' && room && (
        <div className="absolute inset-0 flex flex-col md:flex-row">
          <div
            ref={mapRef}
            onPointerDown={walkTo}
            className="relative flex-1 min-h-[45%] cursor-pointer overflow-hidden"
            style={{ backgroundImage: `url(${lobbyMapBackground})`, backgroundSize: 'cover', backgroundPosition: 'center bottom' }}
          >
            <div className="absolute inset-x-0 top-0 p-3 flex items-center gap-3 bg-gradient-to-b from-slate-950/85 to-transparent pointer-events-none">
              <h2 className="text-xl md:text-2xl font-black text-yellow-300 drop-shadow">🏰 ลานรวมพลนักสู้</h2>
              <span className="text-xs md:text-sm bg-slate-900/80 border border-slate-600 rounded-full px-3 py-1 font-bold">{room.mode === 'duel' ? 'ดวล 1v1' : `ทีม ${room.teamSize} vs ${room.teamSize}`}</span>
              {roomCodeLabel && <span className="text-xs md:text-sm bg-rose-900/80 border border-rose-500 rounded-full px-3 py-1 font-black tracking-widest">รหัส: {roomCodeLabel}</span>}
              <span className="text-xs text-slate-300 hidden md:inline">คลิกที่พื้นเพื่อเดิน • WASD/ลูกศรก็ได้</span>
            </div>
            {players.filter((player) => player.userId !== myId).map((player) => {
              const remote = presence.find((row) => row.userId === player.userId)
              const slotIndex = players.filter((item) => item.team === player.team && item.userId < player.userId).length
              const fallback = (player.team === myTeam ? ALLY_SLOTS : ENEMY_SLOTS)[slotIndex % 4]
              const position = clampPvpLobbyPosition(remote ? { x: remote.x, y: remote.y } : fallback)
              const { x, y } = position
              const direction = (remote?.direction || 'down') as WalkDirection
              const frame = remote?.action === 'walk' ? walkFrame % TEST_CHARACTER_SPRITE.walkFrames.length : 0
              const bubble = bubbles[player.userId]
              return (
                <div key={player.userId} className="absolute -translate-x-1/2 -translate-y-full transition-all duration-300 pointer-events-none" style={{ left: `${x}%`, top: `${y}%` }}>
                  {bubble && Date.now() - bubble.at < 8000 && (
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-white text-slate-900 text-xs font-bold rounded-2xl px-3 py-1.5 max-w-[180px] truncate shadow-lg">{bubble.text}</div>
                  )}
                  <div style={spriteStyle(player, direction, frame, LOBBY_SPRITE_SIZE)} />
                  <div className={`text-center text-xs font-black -mt-2 drop-shadow ${player.team === 0 ? 'text-sky-300' : 'text-rose-300'}`}>{player.name}</div>
                </div>
              )
            })}
            {myPlayer && (
              <div className="absolute -translate-x-1/2 -translate-y-full pointer-events-none" style={{ left: `${myPosition.x}%`, top: `${myPosition.y}%` }}>
                {bubbles[myId] && Date.now() - bubbles[myId].at < 8000 && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-yellow-200 text-slate-900 text-xs font-bold rounded-2xl px-3 py-1.5 max-w-[180px] truncate shadow-lg">{bubbles[myId].text}</div>
                )}
                <div style={spriteStyle(myPlayer, myDirection, myAction === 'walk' ? walkFrame % TEST_CHARACTER_SPRITE.walkFrames.length : 0, LOBBY_SPRITE_SIZE)} />
                <div className="text-center text-xs font-black text-yellow-300 -mt-2 drop-shadow">{myPlayer.name} (คุณ)</div>
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 max-h-36 overflow-y-auto p-3 bg-gradient-to-t from-slate-950/90 to-transparent pointer-events-none">
              {chat.slice(-5).map((item) => (
                <div key={item.id} className="text-sm drop-shadow"><span className="font-black text-amber-300">{item.name}:</span> <span className="text-slate-100">{item.text}</span></div>
              ))}
            </div>
          </div>

          <div className="w-full md:w-[360px] md:max-w-[42%] bg-slate-950/92 border-t-2 md:border-t-0 md:border-l-2 border-amber-800/60 flex flex-col overflow-y-auto">
            <div className="p-4 flex flex-col gap-3">
              {isHost && room.mode === 'team' && (
                <div className="bg-slate-900 rounded-2xl p-3 border border-slate-700">
                  <div className="text-xs font-bold text-slate-300 mb-2">⚙️ ตั้งค่าห้อง (หัวหน้า): ผู้เล่นทีมละ</div>
                  <div className="flex gap-2">
                    {PVP_TEAM_SIZES.map((size) => (
                      <button key={size} type="button" onClick={() => void service.setTeamSize(room.roomId, myId, size)} className={`flex-1 py-1.5 rounded-lg font-black text-sm border ${room.teamSize === size ? 'bg-amber-500 text-slate-950 border-yellow-300' : 'bg-slate-800 border-slate-600'}`}>{size} vs {size}</button>
                    ))}
                  </div>
                </div>
              )}
              {[0, 1].map((team) => (
                <div key={team} className={`bg-slate-900 rounded-2xl p-3 border-2 ${TEAM_COLORS[team]}`}>
                  <div className="font-black text-sm mb-2">{TEAM_NAMES[team]} ({players.filter((player) => player.team === team).length}/{room.teamSize})</div>
                  <div className="flex flex-col gap-2">
                    {players.filter((player) => player.team === team).map((player) => (
                      <div key={player.userId} className={`flex items-center gap-2.5 bg-slate-800/90 rounded-xl px-2.5 py-1.5 ${player.ready ? 'pvp-ready-ring' : ''}`}>
                        <div className="w-10 h-10 overflow-hidden rounded-lg bg-slate-700/60 flex items-end justify-center">
                          <div className="scale-[.55] origin-bottom" style={spriteStyle(player, 'down', 0, 64)} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-sm truncate">{player.userId === room.hostId ? '👑 ' : ''}{player.name}{player.userId === myId ? ' (คุณ)' : ''}</div>
                          <div className="text-[11px] text-slate-400">LV {player.level} • HP {player.maxHp}</div>
                        </div>
                        {player.userId === myId && room.mode === 'team' && (
                          <button type="button" onClick={() => void service.switchTeam(room.roomId, myId)} className="text-[11px] bg-slate-700 hover:bg-slate-600 rounded-lg px-2 py-1 font-bold">สลับทีม</button>
                        )}
                        <span className={`text-[11px] font-black ${player.ready ? 'text-emerald-300' : 'text-red-300'}`}>{player.ready ? '🟢 พร้อม' : '🔴 รอ'}</span>
                      </div>
                    ))}
                    {players.filter((player) => player.team === team).length === 0 && <div className="text-xs text-slate-500 italic">ยังไม่มีผู้เล่น...</div>}
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => myPlayer && void service.setReady(room.roomId, myId, !myPlayer.ready).catch(() => setMessage('ปรับสถานะความพร้อมไม่สำเร็จ'))}
                className={`w-full py-3 rounded-2xl font-black text-lg ${myPlayer?.ready ? 'bg-yellow-600 hover:bg-yellow-500' : 'bg-emerald-600 hover:bg-emerald-500'}`}
              >{myPlayer?.ready ? '❌ ยกเลิกความพร้อม' : '🎮 ฉันพร้อมแล้ว!'}</button>
              {isHost && (
                <div>
                  <button
                    type="button"
                    disabled={!startCheck.ok || questions.length === 0}
                    onClick={() => void service.startBattle(room.roomId, myId, questions.map((question) => question.qId)).then((result) => { if (!result.success) setMessage(result.error || '') })}
                    className="w-full py-3.5 rounded-2xl font-black text-xl bg-gradient-to-b from-orange-500 to-red-600 disabled:from-slate-700 disabled:to-slate-800 disabled:text-slate-500 shadow-lg"
                  >⚔️ เริ่มการต่อสู้!</button>
                  {!startCheck.ok && <p className="text-[11px] text-slate-400 text-center mt-1">{startCheck.reason}</p>}
                </div>
              )}
              <button type="button" onClick={() => void leave()} className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 rounded-2xl font-bold">🚪 ออกจากห้อง</button>
              {message && <p className="text-red-300 text-sm font-bold text-center">{message}</p>}
            </div>
            <form
              className="mt-auto p-3 border-t border-slate-800 flex gap-2"
              onSubmit={(event) => {
                event.preventDefault()
                if (!me || !chatText.trim()) return
                void service.sendChat(room.roomId, me, chatText.trim())
                setChatText('')
              }}
            >
              <input value={chatText} onChange={(event) => setChatText(event.target.value)} maxLength={200} placeholder="พิมพ์คุยกับเพื่อนในห้อง..." className="flex-1 px-3 py-2 rounded-xl text-slate-900 font-bold" />
              <button type="submit" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-black">ส่ง</button>
            </form>
          </div>
        </div>
      )}

      {view === 'battle' && room && room.battle && (
        <div className={`absolute inset-0 flex flex-col ${fx?.crit ? 'pvp-crit-screen' : ''}`}>
          <div className="flex items-center justify-between px-4 py-2 bg-slate-950/85 border-b-2 border-indigo-600/70">
            <div className="flex items-center gap-2 text-sm font-black text-sky-300">{TEAM_NAMES[myTeam]}<span className="text-slate-400 font-bold">({players.filter((player) => player.team === myTeam && player.hp > 0).length} รอด)</span></div>
            <div className="text-center">
              <div className="text-xs text-slate-400 font-bold">รอบที่ {room.battle.round}</div>
              <div className="w-40 md:w-64 h-2.5 bg-slate-800 rounded-full overflow-hidden mt-1">
                <div className="h-full bg-gradient-to-r from-yellow-400 to-orange-500 transition-all duration-1000" style={{ width: `${Math.max(0, Math.min(100, (timeLeft / PVP_ROUND_SECONDS) * 100))}%` }} />
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm font-black text-rose-300"><span className="text-slate-400 font-bold">({players.filter((player) => player.team !== myTeam && player.hp > 0).length} รอด)</span>{TEAM_NAMES[myTeam === 0 ? 1 : 0]}</div>
          </div>

          <div className="relative flex-1 overflow-hidden">
            {fx && (
              <div className="pvp-banner absolute top-3 left-1/2 -translate-x-1/2 z-30 bg-slate-950/90 border-2 border-yellow-500 rounded-2xl px-5 py-2 font-black text-center whitespace-nowrap">
                ⚡ {room.players[fx.attackerId]?.name || '???'} จู่โจม {room.players[fx.targetId]?.name || '???'}!
                {fx.crit && <span className="text-red-400 ml-2">คริติคอล!</span>}
                {fx.defeated && <span className="text-rose-300 ml-2">💀 ล้มแล้ว!</span>}
              </div>
            )}
            {!fx && countdown === null && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 bg-slate-950/70 border border-indigo-500/60 rounded-2xl px-5 py-1.5 font-bold text-indigo-200 text-sm whitespace-nowrap">✨ ใครตอบถูกก่อน ได้สิทธิ์โจมตีฝ่ายตรงข้าม!</div>
            )}
            {players.map((player) => {
              const allies = players.filter((item) => item.team === player.team).sort((a, b) => a.userId.localeCompare(b.userId))
              const slotIndex = allies.findIndex((item) => item.userId === player.userId)
              const isAlly = player.team === myTeam
              const slot = (isAlly ? ALLY_SLOTS : ENEMY_SLOTS)[slotIndex % 4]
              const direction: WalkDirection = isAlly ? 'right' : 'left'
              const lunge = fx?.attackerId === player.userId ? (isAlly ? 'pvp-lunge-right' : 'pvp-lunge-left') : ''
              const hit = fx?.targetId === player.userId ? 'pvp-hit' : ''
              const dead = player.hp <= 0
              return (
                <div key={player.userId} className={`absolute -translate-x-1/2 -translate-y-1/2 ${lunge}`} style={{ left: `${slot.x}%`, top: `${slot.y}%`, zIndex: Math.round(slot.y) }}>
                  {fx?.targetId === player.userId && (
                    <div key={fx.key} className="pvp-damage-pop absolute -top-8 left-1/2 -translate-x-1/2 text-3xl md:text-4xl font-black text-red-400 z-40">-{fx.damage}</div>
                  )}
                  <div className={`${hit} ${dead ? 'grayscale opacity-45 rotate-90' : ''} transition-all duration-500`} style={spriteStyle(player, direction, 0, BATTLE_SPRITE_SIZE)} />
                  <div className="w-24 -mt-3 mx-auto">
                    <div className={`text-center text-[11px] font-black truncate drop-shadow ${isAlly ? 'text-sky-200' : 'text-rose-200'}`}>{player.name}</div>
                    <HpBar hp={player.hp} maxHp={player.maxHp} small />
                    <div className="text-center text-[10px] text-slate-300 font-bold">{Math.ceil(player.hp)}/{player.maxHp}</div>
                  </div>
                </div>
              )
            })}

            {countdown !== null && (
              <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-slate-950/70 backdrop-blur-[2px]">
                <div key={countdown} className="pvp-countdown text-7xl md:text-9xl font-black text-yellow-300">
                  {countdown === PVP_COUNTDOWN_SECONDS ? 'เตรียมตัว!' : countdown > 0 ? countdown : 'สู้!!'}
                </div>
                <p className="mt-4 text-amber-200 font-bold tracking-wide">ตอบถูกและไวที่สุด = ได้เป็นฝ่ายบุก</p>
              </div>
            )}
          </div>

          {countdown === null && (
            <div className="bg-slate-950/90 border-t-2 border-indigo-600/70 p-3 md:p-4">
              {activeQuestion ? (
                <div className="max-w-4xl mx-auto">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-black text-yellow-300 text-sm md:text-base">⚡ รอบที่ {room.battle.round}</span>
                    {lockedRound === room.battle.round && <span className="text-red-300 font-black text-sm animate-pulse">❌ ตอบผิด! รอบนี้ต้องรอเพื่อนชิงจังหวะ...</span>}
                    {answeredRound === room.battle.round && <span className="text-emerald-300 font-black text-sm animate-pulse">✅ ส่งคำตอบแล้ว รอผลการชิงโจมตี...</span>}
                    <span className="bg-slate-800 px-3 py-0.5 rounded-full font-mono font-bold text-sm">{Math.max(0, timeLeft)}s</span>
                  </div>
                  <h3 className="text-lg md:text-2xl font-black mb-3">{activeQuestion.text}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {activeQuestion.options.map((option, optionIndex) => option ? (
                      <button
                        key={optionIndex}
                        type="button"
                        disabled={lockedRound === room.battle!.round || answeredRound === room.battle!.round || (myPlayer?.hp ?? 0) <= 0}
                        onClick={() => answer(optionIndex)}
                        className="p-3 md:p-3.5 text-left border-2 border-indigo-400/80 rounded-2xl bg-slate-900 hover:bg-indigo-900/60 font-bold disabled:opacity-40 transition"
                      ><span className="text-yellow-300 mr-2 font-black">{optionIndex + 1}.</span>{String(option)}</button>
                    ) : null)}
                  </div>
                  {(myPlayer?.hp ?? 0) <= 0 && <p className="text-center text-rose-300 font-black mt-2">💀 คุณถูกน็อคแล้ว — เชียร์เพื่อนต่อได้เลย!</p>}
                </div>
              ) : (
                <p className="text-center font-bold text-slate-300">กำลังโหลดคำถาม...</p>
              )}
            </div>
          )}
          <button type="button" onClick={() => void leave()} className="absolute bottom-2 left-2 z-40 bg-black/60 px-3 py-1.5 rounded-full font-bold text-xs">🏳️ ยอมแพ้ / ออก</button>
        </div>
      )}

      {view === 'result' && room && (() => {
        const outcome = outcomeForPlayer(room, myId)
        const mvpId = computeMvp(room)
        const mvp = room.players[mvpId]
        const reward = pvpMatchReward(outcome)
        const delta = rankingDelta(outcome)
        const board = [...players].sort((a, b) => battleScore(b) - battleScore(a))
        return (
          <div className="absolute inset-0 overflow-y-auto flex flex-col items-center justify-center bg-black/80 px-4 py-8 text-center">
            <div className="text-7xl mb-3">{outcome === 'win' ? '🏆' : outcome === 'draw' ? '🤝' : '💀'}</div>
            <h2 className={`text-5xl md:text-7xl font-black ${outcome === 'win' ? 'text-yellow-300' : outcome === 'draw' ? 'text-sky-300' : 'text-red-500'} drop-shadow-[0_4px_0_rgba(0,0,0,.6)]`}>
              {outcome === 'win' ? 'ชัยชนะ!' : outcome === 'draw' ? 'เสมอ!' : 'พ่ายแพ้...'}
            </h2>
            <p className="text-amber-200 font-bold mt-2">{room.winnerTeam !== null ? `${TEAM_NAMES[room.winnerTeam]} คว้าชัยในศึกนี้` : 'ศึกนี้ไม่มีผู้ชนะ'} • คะแนนอันดับ {delta.rating > 0 ? `+${delta.rating}` : delta.rating} • รางวัล +{reward.xp} XP / +{reward.coins} เหรียญ</p>
            {mvp && (
              <div className="mt-6 bg-gradient-to-b from-yellow-500/20 to-slate-900/90 border-2 border-yellow-400 rounded-3xl p-5 flex items-center gap-4">
                <div className="relative">
                  <div style={spriteStyle(mvp, 'down', 0, 104)} />
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-2xl">👑</span>
                </div>
                <div className="text-left">
                  <div className="text-yellow-300 font-black text-2xl tracking-widest">MVP</div>
                  <div className="font-black text-xl">{mvp.name}</div>
                  <div className="text-sm text-slate-300">ดาเมจ {mvp.damageDealt} • น็อค {mvp.kills} • ชิงตอบไว {mvp.answersWon} ครั้ง</div>
                </div>
              </div>
            )}
            <div className="mt-6 w-full max-w-2xl bg-slate-900/95 border border-slate-700 rounded-3xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-800 text-slate-300 font-black">
                  <tr><th className="py-2 px-3 text-left">ผู้เล่น</th><th className="px-2">ทีม</th><th className="px-2">ดาเมจ</th><th className="px-2">น็อค</th><th className="px-2">ตอบไว</th></tr>
                </thead>
                <tbody>
                  {board.map((player) => (
                    <tr key={player.userId} className={`border-t border-slate-800 ${player.userId === mvpId ? 'bg-yellow-500/10' : ''}`}>
                      <td className="py-2 px-3 text-left font-bold">{player.userId === mvpId ? '👑 ' : ''}{player.name}{player.userId === myId ? ' (คุณ)' : ''}</td>
                      <td className={player.team === 0 ? 'text-sky-300 font-bold' : 'text-rose-300 font-bold'}>{player.team === 0 ? 'อัศวิน' : 'มังกร'}</td>
                      <td className="font-mono">{player.damageDealt}</td>
                      <td className="font-mono">{player.kills}</td>
                      <td className="font-mono">{player.answersWon}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-3 mt-8">
              <button type="button" onClick={reset} className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-full font-black">🔁 กลับหน้าเลือกโหมด</button>
              <button type="button" onClick={() => { stopSubscriptions(); onExit() }} className="px-6 py-3 bg-gradient-to-r from-yellow-400 to-orange-500 text-slate-950 rounded-full font-black">🚪 ออกจากสนาม</button>
            </div>
          </div>
        )
      })()}

      {view === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 px-4 text-center">
          <p className="text-red-300 text-xl font-black">{message}</p>
          <button type="button" onClick={reset} className="mt-5 bg-blue-600 px-6 py-2 rounded-xl font-bold">กลับหน้าเลือกโหมด</button>
        </div>
      )}
    </section>
  )
}
