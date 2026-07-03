import { useCallback, useEffect, useState } from 'react'
import { QuizQuestionView, type QuizQuestion } from './QuizQuestionView'
import { applyBattleAnswer, battleOutcome, healPlayer, starsForScore, type BattleState } from './quizLogic'

type BattleLesson = { id: string; title: string; icon?: string }
type Inventory = { potion?: number; magnifier?: number }
export type BattleUser = {
  id: string
  avatar?: string
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
}

type BattleResult = { passed: boolean; percent: number; score: number; total: number; reason: string; stars: number; stats?: ProgressStats; saveError?: string }
const initialBattle: BattleState = { bossHp: 100, playerHp: 100, score: 0, combo: 1 }
const formatTime = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`

export function BossBattle({ service, onFinish, onUserUpdate }: Props) {
  const [lesson, setLesson] = useState<BattleLesson | null>(null)
  const [user, setUser] = useState<BattleUser | null>(null)
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [index, setIndex] = useState(0)
  const [battle, setBattle] = useState<BattleState>(initialBattle)
  const [timeLeft, setTimeLeft] = useState(0)
  const [hiddenChoices, setHiddenChoices] = useState<number[]>([])
  const [usedMagnifier, setUsedMagnifier] = useState(false)
  const [consumingItem, setConsumingItem] = useState<'potion' | 'magnifier' | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error' | 'result'>('idle')
  const [error, setError] = useState('')
  const [result, setResult] = useState<BattleResult | null>(null)

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
    setBattle(initialBattle)
    setHiddenChoices([])
    setUsedMagnifier(false)
    setConsumingItem(null)
    setResult(null)
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
      setTimeLeft(Math.max(1, service.getTimerPerQuestion()) * data.length)
      setStatus('ready')
      service.trackDailyProgress?.('play1')
    } catch {
      setError('โหลดคำถามไม่สำเร็จ')
      setStatus('error')
    }
  }, [service])

  useEffect(() => {
    const listener = (event: Event) => {
      const target = (event as CustomEvent<BattleLesson>).detail
      if (target?.id) void start(target)
    }
    window.addEventListener('nextgen:start-battle', listener)
    return () => window.removeEventListener('nextgen:start-battle', listener)
  }, [start])

  useEffect(() => {
    if (status !== 'ready' || !lesson || !user) return
    const timer = window.setInterval(() => {
      setTimeLeft((current) => {
        if (current > 1) return current - 1
        void complete(false, 'หมดเวลา!', battle, lesson, user, questions.length)
        return 0
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [battle, complete, lesson, questions.length, status, user])

  const answer = (correct: boolean) => {
    if (status !== 'ready' || !lesson || !user) return
    const next = applyBattleAnswer(battle, correct, questions.length)
    setBattle(next)
    if (correct) service.trackDailyProgress?.('correct5', questions[index].qId)
    if (next.bossHp <= 0) void complete(true, 'ชัยชนะ!', next, lesson, user, questions.length)
    else if (next.playerHp <= 0) void complete(false, 'คุณพ่ายแพ้! พลังชีวิตหมด', next, lesson, user, questions.length)
    else if (index + 1 >= questions.length) void complete(true, 'จบการต่อสู้!', next, lesson, user, questions.length)
    else {
      setIndex((current) => current + 1)
      setHiddenChoices([])
      setUsedMagnifier(false)
    }
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
      if (itemId === 'potion') setBattle((current) => ({ ...current, playerHp: healPlayer(current.playerHp) }))
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
  const question = questions[index]

  return (
    <section id="page-boss-battle" style={{ display: 'block' }} className="fixed inset-0 w-screen h-screen z-50 overflow-y-auto custom-scrollbar">
      <div className="max-w-4xl mx-auto w-full min-h-full flex flex-col p-4 md:p-6 pb-12">
        <div className="flex justify-between items-center mb-4 bg-gray-900/90 text-white p-4 rounded-2xl backdrop-blur-md shadow-lg border border-gray-700">
          <div className="font-bold">⏱️ เวลา: <span className="text-red-400 text-2xl font-black">{formatTime(timeLeft)}</span></div>
          <div className="font-bold">🔥 ดาเมจทวีคูณ: <span className="text-yellow-400 text-2xl font-black">x{battle.combo.toFixed(1)}</span></div>
        </div>

        <div className="rpg-box p-4 md:p-6 mb-6 relative overflow-hidden bg-gray-900/60 border-4 border-gray-700 min-h-[250px] flex justify-between items-end" style={{ backgroundImage: "linear-gradient(to top, rgba(17,24,39,.9), rgba(17,24,39,.2)), url('https://i.postimg.cc/FzQY8SYS/chakt-w-lakhr-t-xs-k-bbxs.png')", backgroundSize: 'cover' }}>
          <Combatant emoji={user?.avatar || '🧙‍♂️'} hp={battle.playerHp} color="green" label="ผู้เล่น" />
          <div className="text-4xl font-black text-yellow-500 pb-10 z-10">VS</div>
          <Combatant emoji={lesson.icon || '🐉'} hp={battle.bossHp} color="red" label="บอส" />
        </div>

        {status === 'loading' && <div className="rpg-box bg-white p-8 text-center font-bold">กำลังเรียกบอส...</div>}
        {status === 'error' && <div className="rpg-box bg-white p-8 text-center"><p className="font-bold text-red-600 mb-4">{error}</p><button type="button" onClick={() => void start(lesson)} className="btn-action bg-blue-600 text-white px-6 py-2 rounded-xl">ลองใหม่</button></div>}
        {status === 'ready' && question && <div className="rpg-box border-4 border-[#8B5A2B] bg-[#fdf5e6] p-6 md:p-8 flex-auto flex flex-col min-h-[300px]"><div className="text-sm font-bold text-amber-900 bg-amber-100 px-4 py-1.5 rounded-full self-start mb-4">คำถามที่ <span className="text-lg">{index + 1}</span>/{questions.length}</div><h3 className="text-xl md:text-2xl font-bold text-gray-800 mb-4">{question.text}</h3>{question.image && <img src={question.image} alt="ภาพประกอบคำถาม" className="max-h-80 mx-auto mb-6 rounded-2xl object-contain" />}<QuizQuestionView question={question} hiddenChoices={hiddenChoices} onAnswer={answer} /><div className="mt-4 flex gap-2 justify-center border-t border-gray-200 pt-3"><button type="button" disabled={Boolean(consumingItem) || !user?.inventory?.potion || battle.playerHp >= 100} onClick={() => void consume('potion')} className="px-3 py-1.5 bg-red-100 disabled:opacity-40 text-red-800 border-2 border-red-300 rounded-lg font-bold">🧪 ยาพยาบาล ({user?.inventory?.potion || 0})</button><button type="button" disabled={Boolean(consumingItem) || !user?.inventory?.magnifier || usedMagnifier || (question.pattern || 'choice') !== 'choice'} onClick={() => void consume('magnifier')} className="px-3 py-1.5 bg-purple-100 disabled:opacity-40 text-purple-800 border-2 border-purple-300 rounded-lg font-bold">🔍 ตัดช้อยส์ ({user?.inventory?.magnifier || 0})</button></div></div>}

        {status === 'result' && result && <div className="fixed inset-0 bg-gray-900/95 z-[70] flex flex-col items-center justify-center p-8 text-center border-4 border-yellow-500"><div className="text-8xl mb-4">{result.passed ? '🎉' : '💀'}</div><h2 className={`text-4xl font-black mb-3 ${result.passed ? 'text-yellow-300' : 'text-red-500'}`}>{result.passed ? 'ปราบบอสสำเร็จ!' : 'พ่ายแพ้...'}</h2><div aria-label={`${result.stars} ดาว`} className="text-5xl mb-4">{[1, 2, 3].map((star) => <span key={star} className={star <= result.stars ? '' : 'opacity-20'}>⭐</span>)}</div><p className="text-xl font-black text-white mb-3">ตอบถูก {result.score}/{result.total} ข้อ</p><p className="text-white mb-3">{result.reason}</p>{result.stats && <p className="text-green-400 font-bold mb-4">ได้รับ +{result.stats.gainedXp} XP</p>}{result.saveError && <p className="text-red-300 font-bold mb-4">{result.saveError}</p>}<button type="button" onClick={finish} className="btn-arcade py-4 px-10 text-xl font-black">กลับแผนที่ผจญภัย</button></div>}
      </div>
    </section>
  )
}

function Combatant({ emoji, hp, color, label }: { emoji: string; hp: number; color: 'green' | 'red'; label: string }) {
  const safeHp = Math.max(0, hp)
  return <div className="w-2/5 flex flex-col items-center relative z-10"><div className="w-full bg-gray-950 rounded-full h-7 mb-2 overflow-hidden border-2 border-gray-700 relative"><div className={`h-full transition-all ${color === 'green' ? 'bg-gradient-to-r from-green-600 to-emerald-400' : 'bg-gradient-to-r from-red-600 to-orange-500'}`} style={{ width: `${safeHp}%` }} /><span className="absolute inset-0 flex items-center justify-center text-white text-sm font-black">{Math.ceil(safeHp)} / 100</span></div><div aria-label={label} className="text-7xl md:text-8xl drop-shadow-lg">{emoji}</div></div>
}
