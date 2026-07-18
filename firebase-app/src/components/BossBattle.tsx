import { useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import bossArena from '../assets/lesson-zone-boss.webp'
import warriorSprite from '../assets/lesson-corrupted-warrior.png'
import { characterLayerImages } from './characterAssets'
import { QuizQuestionView, type QuizQuestion } from './QuizQuestionView'
import {
  TEST_CHARACTER_SPRITE,
  directionForKey,
  directionTowardTarget,
  spriteBackgroundPosition,
  type CharacterPosition,
  type WalkDirection,
} from './dashboardCharacter'
import { applyBattleAnswer, applySkirmishExchange, battleOutcome, bossSkillDelayMs, healPlayer, selectBossSkillQuestionIndex, starsForScore, type BattleState } from './quizLogic'
import { PLAYER_ATTACK_FRAME_COLUMNS, useBattleActors } from './useBattleActors'
import { VirtualJoystick } from './VirtualJoystick'

type BattleLesson = { id: string; title: string; icon?: string }
type Inventory = { potion?: number; magnifier?: number }
export type BattleUser = {
  id: string
  avatar?: string
  gender?: string
  xp: number
  coins: number
  level: number
  rank: string
  passedLessons?: string[]
  inventory?: Inventory
}
type ProgressStats = { xp: number; coins?: number; level: number; rank: string; gainedXp: number; alreadyPassed: boolean }
type Result<T> = { success: boolean; data?: T; error?: string }

export type BattleService = {
  getCurrentUser(): BattleUser | null
  getTimerPerQuestion(): number
  loadQuestions(lessonId: string): Promise<Result<QuizQuestion[]>>
  saveProgress(userId: string, lessonId: string, status: 'Passed' | 'Failed', score: number, maxScore: number): Promise<{ success: boolean; stats?: ProgressStats; error?: string }>
  consumeItem(userId: string, itemId: 'potion' | 'magnifier'): Promise<{ success: boolean; inventory?: Inventory; error?: string }>
  trackDailyProgress?(type: 'play1' | 'correct5', questionId?: string): void
}

type Props = {
  service: BattleService
  onFinish(): void
  onUserUpdate(user: Partial<BattleUser>): void
  random?: () => number
  skillDelayMs?: number
}

type BattleResult = { passed: boolean; percent: number; score: number; total: number; reason: string; stars: number; stats?: ProgressStats; saveError?: string }
type BattlePhase = 'skirmish' | 'question'
const initialBattle: BattleState = { bossHp: 100, playerHp: 100, score: 0, combo: 1 }
const formatTime = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`
const PLAYER_START_POSITION: CharacterPosition = { x: 36, y: 70 }
const BOSS_POSITION: CharacterPosition = { x: 68, y: 62 }
const BOSS_ATTACK_RANGE = 13
const attackRows: Record<WalkDirection, number> = { up: 55, left: 58, down: 61, right: 64 }
const bossWalkRows: Record<WalkDirection, number> = { up: 8, left: 9, down: 10, right: 11 }
const bossAttackRows: Record<WalkDirection, number> = { up: 12, left: 13, down: 14, right: 15 }

export function BossBattle({ service, onFinish, onUserUpdate, random = Math.random, skillDelayMs }: Props) {
  const [lesson, setLesson] = useState<BattleLesson | null>(null)
  const [user, setUser] = useState<BattleUser | null>(null)
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [index, setIndex] = useState(0)
  const [remainingQuestionIndexes, setRemainingQuestionIndexes] = useState<number[]>([])
  const [battle, setBattle] = useState<BattleState>(initialBattle)
  const [phase, setPhase] = useState<BattlePhase>('skirmish')
  const [timeLeft, setTimeLeft] = useState(0)
  const [hiddenChoices, setHiddenChoices] = useState<number[]>([])
  const [usedMagnifier, setUsedMagnifier] = useState(false)
  const [consumingItem, setConsumingItem] = useState<'potion' | 'magnifier' | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error' | 'result'>('idle')
  const [error, setError] = useState('')
  const [result, setResult] = useState<BattleResult | null>(null)
  const [impact, setImpact] = useState<'player' | 'boss' | null>(null)
  const [combatNotice, setCombatNotice] = useState('')
  const battleRef = useRef(battle)
  battleRef.current = battle
  const arenaActive = status === 'ready' && phase === 'skirmish'
  const {
    worldRef, position, direction, frame, playerAction,
    bossPosition, bossDirection, bossFrame, bossAction,
    positionRef, bossPositionRef, heldDirectionRef,
    startHeldMove, stopHeldMove, stopPointerMove, walkToClientPoint,
    playAttackAnimation, playBossAttackAnimation, reset: resetActors,
  } = useBattleActors({
    active: arenaActive,
    playerStart: PLAYER_START_POSITION,
    bossStart: BOSS_POSITION,
    attackRange: BOSS_ATTACK_RANGE,
  })

  // Battle mutations go through the ref so death transitions can be detected
  // outside of React state updaters (updaters may be invoked more than once).
  const commitBattle = useCallback((next: BattleState) => {
    battleRef.current = next
    setBattle(next)
  }, [])

  const complete = useCallback(async (intendedWin: boolean, reason: string, finalBattle: BattleState, targetLesson: BattleLesson, targetUser: BattleUser, total: number) => {
    const outcome = battleOutcome(intendedWin, finalBattle.score, total)
    const finalReason = intendedWin && !outcome.passed
      ? `คุณทำคะแนนได้ ${Math.floor(outcome.percent)}% (ต้องการ 60% ขึ้นไปเพื่อผ่านด่าน)`
      : reason
    const nextResult: BattleResult = { ...outcome, score: finalBattle.score, total, reason: finalReason, stars: starsForScore(finalBattle.score, total) }
    setResult(nextResult)
    setStatus('result')
    try {
      const saved = await service.saveProgress(targetUser.id, targetLesson.id, outcome.passed ? 'Passed' : 'Failed', finalBattle.score, total)
      if (!saved.success || !saved.stats) throw new Error(saved.error || 'save failed')
      const passedLessons = outcome.passed && !targetUser.passedLessons?.includes(targetLesson.id)
        ? [...(targetUser.passedLessons || []), targetLesson.id]
        : targetUser.passedLessons
      const update = { ...saved.stats, passedLessons }
      setResult((current) => current ? { ...current, stats: saved.stats } : current)
      onUserUpdate(update)
    } catch {
      setResult((current) => current ? { ...current, saveError: 'บันทึกผลไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ต' } : current)
    }
  }, [onUserUpdate, service])

  const moveToPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button')) return
    walkToClientPoint(event.clientX, event.clientY, event.currentTarget)
  }

  const moveToMouse = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (typeof window.PointerEvent !== 'undefined') return
    if ((event.target as HTMLElement).closest('button')) return
    walkToClientPoint(event.clientX, event.clientY, event.currentTarget)
  }

  const attackBoss = useCallback(() => {
    if (status !== 'ready' || phase !== 'skirmish' || !lesson || !user) return
    const facing = directionTowardTarget(positionRef.current, bossPositionRef.current)
    playAttackAnimation(facing)
    const distance = Math.hypot(bossPositionRef.current.x - positionRef.current.x, bossPositionRef.current.y - positionRef.current.y)
    if (distance > BOSS_ATTACK_RANGE) {
      setCombatNotice('เข้าใกล้บอสก่อนถึงจะโจมตีโดน')
      return
    }
    setCombatNotice('')
    setImpact('boss')
    const current = battleRef.current
    const next = applySkirmishExchange(current, questions.length, remainingQuestionIndexes.length)
    commitBattle(next)
    if (current.playerHp > 0 && next.playerHp <= 0) {
      void complete(false, 'พ่ายแพ้! ถูกบอสโต้กลับจนพลังชีวิตหมด', next, lesson, user, questions.length)
    }
    window.setTimeout(() => setImpact('player'), 180)
  }, [bossPositionRef, commitBattle, complete, lesson, phase, playAttackAnimation, positionRef, questions.length, remainingQuestionIndexes.length, status, user])

  const start = useCallback(async (targetLesson: BattleLesson) => {
    const currentUser = service.getCurrentUser()
    if (!currentUser) {
      setError('ไม่พบข้อมูลผู้เล่น')
      setStatus('error')
      return
    }
    setLesson(targetLesson)
    setUser(currentUser)
    setQuestions([])
    setIndex(0)
    setRemainingQuestionIndexes([])
    commitBattle(initialBattle)
    setPhase('skirmish')
    setHiddenChoices([])
    setUsedMagnifier(false)
    setConsumingItem(null)
    setResult(null)
    setImpact(null)
    resetActors()
    setCombatNotice('')
    setError('')
    setStatus('loading')
    try {
      const loaded = await service.loadQuestions(targetLesson.id)
      if (!loaded.success) throw new Error(loaded.error || 'load failed')
      const data = loaded.data || []
      if (data.length === 0) {
        setError('ไม่พบคำถามสำหรับด่านนี้')
        setStatus('error')
        return
      }
      setQuestions(data)
      setRemainingQuestionIndexes(data.map((_, questionIndex) => questionIndex))
      setTimeLeft(Math.max(1, service.getTimerPerQuestion()) * data.length)
      setPhase('skirmish')
      setStatus('ready')
      service.trackDailyProgress?.('play1')
    } catch {
      setError('โหลดคำถามไม่สำเร็จ')
      setStatus('error')
    }
  }, [commitBattle, resetActors, service])

  useEffect(() => {
    if (!impact) return
    const timer = window.setTimeout(() => setImpact(null), 520)
    return () => window.clearTimeout(timer)
  }, [impact])

  useEffect(() => {
    if (status !== 'ready' || phase !== 'skirmish' || questions.length === 0 || remainingQuestionIndexes.length === 0 || !lesson || !user) return
    const skirmishTimer = window.setInterval(() => {
      const bossPos = bossPositionRef.current
      const playerPos = positionRef.current
      const distance = Math.hypot(bossPos.x - playerPos.x, bossPos.y - playerPos.y)

      if (distance <= BOSS_ATTACK_RANGE) {
        playBossAttackAnimation(directionTowardTarget(bossPos, playerPos))
        setImpact('player')
        const current = battleRef.current
        const next = applySkirmishExchange(current, questions.length, remainingQuestionIndexes.length)
        commitBattle(next)
        if (current.playerHp > 0 && next.playerHp <= 0) {
          void complete(false, 'พ่ายแพ้! ถูกบอสโจมตีปกติจนพลังชีวิตหมด', next, lesson, user, questions.length)
        }
      }
    }, 720)
    return () => {
      window.clearInterval(skirmishTimer)
    }
  }, [bossPositionRef, commitBattle, complete, lesson, phase, positionRef, questions.length, remainingQuestionIndexes, status, user, playBossAttackAnimation])

  useEffect(() => {
    if (status !== 'ready' || phase !== 'skirmish' || questions.length === 0 || remainingQuestionIndexes.length === 0) return
    const skillTimer = window.setTimeout(() => {
      const selected = selectBossSkillQuestionIndex(remainingQuestionIndexes, random)
      if (selected < 0) return
      setIndex(selected)
      setHiddenChoices([])
      setUsedMagnifier(false)
      setImpact(null)
      setPhase('question')
      stopHeldMove()
      stopPointerMove()
    }, skillDelayMs ?? bossSkillDelayMs(random))
    return () => window.clearTimeout(skillTimer)
  }, [phase, questions.length, random, remainingQuestionIndexes, skillDelayMs, status, stopHeldMove, stopPointerMove])

  useEffect(() => {
    const listener = (event: Event) => {
      const target = (event as CustomEvent<BattleLesson>).detail
      if (target?.id) void start(target)
    }
    window.addEventListener('nextgen:start-battle', listener)
    return () => window.removeEventListener('nextgen:start-battle', listener)
  }, [start])

  useEffect(() => {
    const move = (event: KeyboardEvent) => {
      if (!lesson || status !== 'ready' || phase !== 'skirmish') return
      if (event.code === 'Space') {
        event.preventDefault()
        attackBoss()
        return
      }
      const nextDirection = directionForKey(event.key)
      if (!nextDirection) return
      event.preventDefault()
      startHeldMove(nextDirection)
    }
    const stopMove = (event: KeyboardEvent) => {
      const nextDirection = directionForKey(event.key)
      if (nextDirection && heldDirectionRef.current === nextDirection) stopHeldMove()
    }
    window.addEventListener('keydown', move)
    window.addEventListener('keyup', stopMove)
    return () => {
      window.removeEventListener('keydown', move)
      window.removeEventListener('keyup', stopMove)
    }
  }, [attackBoss, heldDirectionRef, lesson, phase, startHeldMove, status, stopHeldMove])

  useEffect(() => {
    if (status !== 'ready' || phase !== 'question' || !lesson || !user) return
    const timer = window.setInterval(() => {
      setTimeLeft((current) => {
        if (current > 1) return current - 1
        window.clearInterval(timer)
        void complete(false, 'หมดเวลา!', battleRef.current, lesson, user, questions.length)
        return 0
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [complete, lesson, phase, questions.length, status, user])

  const answer = (correct: boolean) => {
    if (status !== 'ready' || phase !== 'question' || !lesson || !user) return
    const currentQuestion = questions[index]
    if (!currentQuestion) return
    const nextRemaining = remainingQuestionIndexes.filter((questionIndex) => questionIndex !== index)
    const resolved = applyBattleAnswer(battleRef.current, correct, questions.length)
    const finalRemaining = nextRemaining.length === remainingQuestionIndexes.length
      ? remainingQuestionIndexes.slice(1)
      : nextRemaining
    setImpact(correct ? 'boss' : 'player')
    commitBattle(resolved)
    setRemainingQuestionIndexes(finalRemaining)
    if (correct) service.trackDailyProgress?.('correct5', currentQuestion.qId)
    if (resolved.playerHp <= 0) {
      void complete(false, 'พ่ายแพ้! พลังชีวิตหมดจากสกิลบอส', resolved, lesson, user, questions.length)
      return
    }
    if (finalRemaining.length === 0) {
      const percent = questions.length > 0 ? (resolved.score / questions.length) * 100 : 0
      const finalBattle = percent >= 60 ? { ...resolved, bossHp: 0 } : resolved
      commitBattle(finalBattle)
      void complete(true, 'จบการต่อสู้!', finalBattle, lesson, user, questions.length)
      return
    }
    setHiddenChoices([])
    setUsedMagnifier(false)
    setPhase('skirmish')
  }

  const consume = async (itemId: 'potion' | 'magnifier') => {
    if (!user || !user.inventory || consumingItem || Number(user.inventory[itemId] || 0) <= 0) return
    if (itemId === 'potion' && battle.playerHp >= 100) return
    if (itemId === 'magnifier') {
      const question = questions[index]
      if ((question.pattern || 'choice') !== 'choice' || usedMagnifier) return
      const wrong = question.options.map((_, optionIndex) => optionIndex).find((optionIndex) => optionIndex !== question.answer && !hiddenChoices.includes(optionIndex))
      if (wrong === undefined) return
      setHiddenChoices((current) => [...current, wrong])
      setUsedMagnifier(true)
    }
    setConsumingItem(itemId)
    try {
      const consumed = await service.consumeItem(user.id, itemId)
      if (!consumed.success) throw new Error(consumed.error || 'consume failed')
      if (itemId === 'potion') commitBattle({ ...battleRef.current, playerHp: healPlayer(battleRef.current.playerHp) })
      const inventory = consumed.inventory || { ...user.inventory, [itemId]: Number(user.inventory[itemId] || 0) - 1 }
      setUser((current) => current ? { ...current, inventory } : current)
      onUserUpdate({ inventory })
    } catch {
      if (itemId === 'magnifier') {
        setHiddenChoices([])
        setUsedMagnifier(false)
      }
    } finally {
      setConsumingItem(null)
    }
  }

  const finish = () => {
    setLesson(null)
    setStatus('idle')
    setResult(null)
    onFinish()
  }

  if (!lesson) return <section id="page-boss-battle" className="hidden" />
  const question = phase === 'question' ? questions[index] : undefined
  const displayedQuestionNumber = Math.min(questions.length, questions.length - remainingQuestionIndexes.length + 1)
  const playerStyle: CSSProperties = {
    left: `${position.x}%`,
    top: `${position.y}%`,
    transitionDuration: '0ms',
    transitionProperty: 'none',
    backgroundImage: characterLayerImages(user?.inventory, user?.gender),
    backgroundRepeat: 'no-repeat',
    backgroundSize: `${TEST_CHARACTER_SPRITE.columns * 104}px ${TEST_CHARACTER_SPRITE.rows * 104}px`,
    backgroundPosition: playerAction === 'attack'
      ? `${-PLAYER_ATTACK_FRAME_COLUMNS[frame % PLAYER_ATTACK_FRAME_COLUMNS.length] * 104}px ${-attackRows[direction] * 104}px`
      : spriteBackgroundPosition(TEST_CHARACTER_SPRITE, direction, frame, 104),
  }
  const bossStyle: CSSProperties = {
    left: `${bossPosition.x}%`,
    top: `${bossPosition.y}%`,
    transitionDuration: '0ms',
    transitionProperty: 'none',
  }
  const bossSpriteStyle: CSSProperties = {
    backgroundImage: `url(${warriorSprite})`,
    backgroundSize: `${24 * 170}px ${90 * 170}px`,
    backgroundPosition: bossAction === 'attack'
      ? `${-(bossFrame % 6) * 170}px ${-bossAttackRows[bossDirection] * 170}px`
      : bossAction === 'walk'
      ? `${-(bossFrame % 9) * 170}px ${-bossWalkRows[bossDirection] * 170}px`
      : `${0}px ${-bossWalkRows[bossDirection] * 170}px`,
  }

  return (
    <section id="page-boss-battle" style={{ display: 'block', backgroundImage: `linear-gradient(rgba(7, 9, 18, .18), rgba(7, 9, 18, .8)), url(${bossArena})` }} className="boss-battle-page fixed inset-0 w-screen h-screen z-50 overflow-y-auto custom-scrollbar">
      <div className="max-w-5xl mx-auto w-full min-h-full flex flex-col p-4 md:p-6 pb-12">
        <div className="flex justify-between items-center mb-4 bg-gray-900/90 text-white p-4 rounded-2xl backdrop-blur-md shadow-lg border border-gray-700">
          <div className="font-bold">⏱️ เวลา: <span className="text-red-400 text-2xl font-black">{formatTime(timeLeft)}</span></div>
          <div className="font-bold">🔥 ดาเมจทวีคูณ: <span className="text-yellow-400 text-2xl font-black">x{battle.combo.toFixed(1)}</span></div>
        </div>

        <div data-testid="boss-arena" data-phase={phase} data-question-number={displayedQuestionNumber} data-impact={impact || undefined} className="boss-arena boss-map-arena rpg-box p-3 md:p-4 mb-6 relative overflow-hidden bg-gray-900/50 border-4 border-amber-900">
          <div ref={worldRef} data-testid="boss-battle-world" className="boss-battle-world" onPointerDown={moveToPointer} onMouseDown={moveToMouse}>
            {status === 'ready' && phase === 'skirmish' && <div data-testid="boss-skirmish-panel" className="boss-map-banner"><b>สนามบอส</b><span>เดินเข้าใกล้แล้วกดโจมตี · บอสจะสุ่มคำถามเป็นสกิลใหญ่</span><small>เหลือคำถาม {remainingQuestionIndexes.length}/{questions.length}</small></div>}
            <div className="boss-map-health boss-map-player-health"><b>ผู้เล่น</b><span><i style={{ width: `${Math.max(0, battle.playerHp)}%` }} /></span><strong>{Math.ceil(Math.max(0, battle.playerHp))} / 100</strong></div>
            <div className="boss-map-health boss-map-boss-health"><b>บอส</b><span><i style={{ width: `${Math.max(0, battle.bossHp)}%` }} /></span><strong>{Math.ceil(Math.max(0, battle.bossHp))} / 100</strong></div>
            <button type="button" data-testid="boss-map-target" aria-label="โจมตีบอสในสนาม" className="boss-map-target" style={bossStyle} onClick={attackBoss}>
              <span
                data-testid="battle-boss-sprite"
                data-action={bossAction}
                data-direction={bossDirection}
                aria-label="บอส"
                className="lesson-boss-sprite boss-map-boss-sprite"
                style={bossSpriteStyle}
              />
            </button>
            <div data-testid="battle-player-sprite" data-direction={direction} data-action={playerAction} aria-label="ผู้เล่น" className="lesson-player-sprite boss-map-player-sprite" style={playerStyle}>
              {playerAction === 'attack' && <span data-testid="boss-slash-effect" className="lesson-player-slash" aria-hidden="true" />}
            </div>
            <div className="boss-map-controls">
              <button type="button" data-testid="boss-attack-button" onClick={attackBoss}>⚔️ โจมตีบอส</button>
              <small>WASD / Arrow · Spacebar</small>
              {combatNotice && <p>{combatNotice}</p>}
            </div>
            {arenaActive && (
              <div className="boss-joystick-dock">
                <VirtualJoystick label="จอยสติ๊กควบคุมตัวละคร" onDirection={(direction) => (direction ? startHeldMove(direction) : stopHeldMove())} />
              </div>
            )}
          </div>
          {status === 'ready' && phase === 'skirmish' && <div data-testid="boss-skirmish-panel" className="absolute left-1/2 top-4 z-20 w-[min(480px,78%)] -translate-x-1/2 rounded-2xl border-4 border-amber-500 bg-[#1d1424ee] p-4 text-center text-white shadow-2xl"><b className="block text-xl text-yellow-200">บอสโจมตีปกติ!</b><span className="text-sm">สุ่มจังหวะสกิลใหญ่เป็นคำถาม · ตอบถูกสะท้อนดาเมจ ตอบผิดโดนหนัก</span><small className="mt-2 block text-amber-200">เหลือคำถาม {remainingQuestionIndexes.length}/{questions.length}</small></div>}
          <Combatant kind="player" hp={battle.playerHp} color="green" label="ผู้เล่น" />
          <div className="boss-skill-charge"><b>สกิลบอสกำลังชาร์จ</b><span>ตอบถูกเพื่อสะท้อนพลัง!</span></div>
          <Combatant kind="boss" hp={battle.bossHp} color="red" label="บอส" />
        </div>

        {status === 'loading' && <div className="rpg-box bg-white p-8 text-center font-bold">กำลังเรียกบอส...</div>}
        {status === 'error' && <div className="rpg-box bg-white p-8 text-center"><p className="font-bold text-red-600 mb-4">{error}</p><button type="button" onClick={() => void start(lesson)} className="btn-action bg-blue-600 text-white px-6 py-2 rounded-xl">ลองใหม่</button></div>}
        {status === 'ready' && question && <div className="rpg-box border-4 border-[#8B5A2B] bg-[#fdf5e6] p-6 md:p-8 flex-auto flex flex-col min-h-[300px]"><div className="text-sm font-bold text-amber-900 bg-amber-100 px-4 py-1.5 rounded-full self-start mb-4">คำถามที่ <span className="text-lg">{index + 1}</span>/{questions.length}</div><h3 className="text-xl md:text-2xl font-bold text-gray-800 mb-4">{question.text}</h3>{question.image && <img src={question.image} alt="ภาพประกอบคำถาม" className="max-h-80 mx-auto mb-6 rounded-2xl object-contain" />}<QuizQuestionView question={question} hiddenChoices={hiddenChoices} onAnswer={answer} /><div className="mt-4 flex gap-2 justify-center border-t border-gray-200 pt-3"><button type="button" disabled={Boolean(consumingItem) || !user?.inventory?.potion || battle.playerHp >= 100} onClick={() => void consume('potion')} className="px-3 py-1.5 bg-red-100 disabled:opacity-40 text-red-800 border-2 border-red-300 rounded-lg font-bold">🧪 ยาพยาบาล ({user?.inventory?.potion || 0})</button><button type="button" disabled={Boolean(consumingItem) || !user?.inventory?.magnifier || usedMagnifier || (question.pattern || 'choice') !== 'choice'} onClick={() => void consume('magnifier')} className="px-3 py-1.5 bg-purple-100 disabled:opacity-40 text-purple-800 border-2 border-purple-300 rounded-lg font-bold">🔍 ตัดช้อยส์ ({user?.inventory?.magnifier || 0})</button></div></div>}

        {status === 'result' && result && <div className="fixed inset-0 bg-gray-900/95 z-[70] flex flex-col items-center justify-center p-8 text-center border-4 border-yellow-500"><div className="text-8xl mb-4">{result.passed ? '🎉' : '💀'}</div><h2 className={`text-4xl font-black mb-3 ${result.passed ? 'text-yellow-300' : 'text-red-500'}`}>{result.passed ? 'ปราบบอสสำเร็จ!' : 'พ่ายแพ้...'}</h2><div aria-label={`${result.stars} ดาว`} className="text-5xl mb-4">{[1, 2, 3].map((star) => <span key={star} className={star <= result.stars ? '' : 'opacity-20'}>⭐</span>)}</div><p className="text-xl font-black text-white mb-3">ตอบถูก {result.score}/{result.total} ข้อ</p><p className="text-white mb-3">{result.reason}</p>{result.stats && <p className="text-green-400 font-bold mb-4">ได้รับ +{result.stats.gainedXp} XP</p>}{result.saveError && <p className="text-red-300 font-bold mb-4">{result.saveError}</p>}<button type="button" onClick={finish} className="btn-arcade py-4 px-10 text-xl font-black">กลับแผนที่ผจญภัย</button></div>}
      </div>
    </section>
  )
}

function Combatant({ kind, hp, color, label }: { kind: 'player' | 'boss'; hp: number; color: 'green' | 'red'; label: string }) {
  void kind
  void hp
  void color
  void label
  return null
}
