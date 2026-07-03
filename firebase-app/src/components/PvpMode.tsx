import { useCallback, useEffect, useRef, useState } from 'react'
import type { QuizQuestion } from './QuizQuestionView'
import { applyPvpAnswer, isPvpWinner, validPrivatePin, type PvpRole } from './pvpBattleLogic'

export type PvpUser = { id: string; name: string; avatar?: string }
export type PvpMatch = {
  success: boolean
  error?: string
  matchId: string
  role?: PvpRole
  p1Id: string
  p2Id: string | null
  p1Name: string
  p2Name: string
  p1Avatar: string
  p2Avatar: string
  p1Hp: number
  p2Hp: number
  p1Ready: boolean
  p2Ready: boolean
  status: string
}

type BasicResult = { success: boolean; status?: string; error?: string }
export type PvpService = {
  getCurrentUser(): PvpUser | null
  createOrJoinMatch(userId: string, name: string, avatar: string, roomPin: string | null): Promise<PvpMatch>
  subscribeToMatch(matchId: string, onData: (match: PvpMatch) => void, onError: (error: Error) => void): () => void
  loadQuestions(lessonId: 'PVP_MODE'): Promise<{ success: boolean; data?: QuizQuestion[]; error?: string }>
  setReady(matchId: string, userId: string, ready: boolean): Promise<PvpMatch>
  updateHp(matchId: string, userId: string, hp: number): Promise<BasicResult>
  finishMatch(matchId: string, userId: string): Promise<BasicResult>
  leaveMatch(matchId: string): Promise<BasicResult>
}

type Props = { service: PvpService; onExit(): void }
type View = 'idle' | 'select' | 'matching' | 'room' | 'loadingBattle' | 'arena' | 'waiting' | 'result' | 'error'

export function PvpMode({ service, onExit }: Props) {
  const [view, setView] = useState<View>('idle')
  const [pin, setPin] = useState('')
  const [message, setMessage] = useState('')
  const [match, setMatch] = useState<PvpMatch | null>(null)
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [questionIndex, setQuestionIndex] = useState(0)
  const [myHp, setMyHp] = useState(100)
  const [timeLeft, setTimeLeft] = useState(15)
  const [forfeitOpen, setForfeitOpen] = useState(false)
  const unsubscribeRef = useRef<null | (() => void)>(null)
  const matchIdRef = useRef('')
  const roleRef = useRef<PvpRole>('Player1')
  const battleStartedRef = useRef(false)
  const answerRef = useRef<(selectedIndex: number) => void>(() => undefined)

  const stopSubscription = useCallback(() => {
    unsubscribeRef.current?.()
    unsubscribeRef.current = null
  }, [])

  const reset = useCallback(() => {
    stopSubscription()
    matchIdRef.current = ''
    battleStartedRef.current = false
    setPin('')
    setMessage('')
    setMatch(null)
    setQuestions([])
    setQuestionIndex(0)
    setMyHp(100)
    setForfeitOpen(false)
    setView('select')
  }, [stopSubscription])

  useEffect(() => {
    window.addEventListener('nextgen:open-pvp', reset)
    return () => {
      window.removeEventListener('nextgen:open-pvp', reset)
      stopSubscription()
    }
  }, [reset, stopSubscription])

  const beginBattle = useCallback(async (nextMatch: PvpMatch) => {
    if (battleStartedRef.current) {
      setMatch(nextMatch)
      return
    }
    battleStartedRef.current = true
    setView('loadingBattle')
    setMatch(nextMatch)
    try {
      const result = await service.loadQuestions('PVP_MODE')
      const data = (result.data || []).slice(0, 5)
      if (!result.success || data.length === 0) throw new Error(result.error || 'no questions')
      const role = roleRef.current
      setMyHp(role === 'Player1' ? nextMatch.p1Hp : nextMatch.p2Hp)
      setQuestions(data)
      setQuestionIndex(0)
      setView('arena')
    } catch {
      battleStartedRef.current = false
      setMessage('โหลดคำถาม PVP ไม่สำเร็จ')
      setView('error')
    }
  }, [service])

  const onMatch = useCallback((nextMatch: PvpMatch) => {
    if (!nextMatch.success) return
    setMatch(nextMatch)
    if (nextMatch.status === 'WAITING' || nextMatch.status === 'LOBBY') setView('room')
    else if (nextMatch.status === 'PLAYING') void beginBattle(nextMatch)
    else if (nextMatch.status === 'FINISHED') setView('result')
    else if (nextMatch.status === 'CANCELLED') {
      stopSubscription()
      setMessage('ห้องถูกยกเลิก หรือคู่ต่อสู้ออกจากห้อง')
      setView('error')
    }
  }, [beginBattle, stopSubscription])

  const join = async (roomPin: string | null) => {
    const user = service.getCurrentUser()
    if (!user) return
    if (roomPin !== null && !validPrivatePin(roomPin)) {
      setMessage('กรุณากรอกรหัสตัวเลข 4 หลัก')
      return
    }
    setMessage('')
    setView('matching')
    try {
      const result = await service.createOrJoinMatch(user.id, user.name, user.avatar || '🧙‍♂️', roomPin)
      if (!result.success || !result.matchId || !result.role) throw new Error(result.error || 'matchmaking failed')
      matchIdRef.current = result.matchId
      roleRef.current = result.role
      setMatch(result)
      setView('room')
      stopSubscription()
      unsubscribeRef.current = service.subscribeToMatch(result.matchId, onMatch, () => {
        setMessage('การเชื่อมต่อห้องประลองขัดข้อง')
        setView('error')
      })
    } catch {
      setMessage('ค้นหาห้องประลองไม่สำเร็จ')
      setView('error')
    }
  }

  const toggleReady = async () => {
    const user = service.getCurrentUser()
    if (!user || !match) return
    const current = roleRef.current === 'Player1' ? match.p1Ready : match.p2Ready
    try {
      const result = await service.setReady(match.matchId, user.id, !current)
      if (!result.success) throw new Error(result.error || 'ready failed')
      onMatch({ ...result, role: roleRef.current })
    } catch {
      setMessage('ปรับสถานะความพร้อมไม่สำเร็จ')
    }
  }

  const answer = useCallback((selectedIndex: number) => {
    const user = service.getCurrentUser()
    const question = questions[questionIndex]
    const matchId = matchIdRef.current
    if (!user || !question || !matchId) return
    const correct = selectedIndex === question.answer
    const nextHp = applyPvpAnswer(myHp, correct)
    setMyHp(nextHp)
    if (!correct) void service.updateHp(matchId, user.id, nextHp)
    if (questionIndex + 1 >= questions.length) {
      setView('waiting')
      void service.finishMatch(matchId, user.id)
    } else setQuestionIndex((current) => current + 1)
  }, [myHp, questionIndex, questions, service])
  answerRef.current = answer

  useEffect(() => {
    if (view !== 'arena') return
    setTimeLeft(15)
    const timer = window.setInterval(() => {
      setTimeLeft((current) => {
        if (current > 1) return current - 1
        window.clearInterval(timer)
        answerRef.current(-1)
        return 0
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [questionIndex, view])

  const leaveRoom = async () => {
    const matchId = matchIdRef.current
    stopSubscription()
    if (matchId) await service.leaveMatch(matchId)
    reset()
  }

  const forfeit = async () => {
    const user = service.getCurrentUser()
    const matchId = matchIdRef.current
    if (user && matchId) await service.updateHp(matchId, user.id, 0)
    if (matchId) await service.leaveMatch(matchId)
    stopSubscription()
    setForfeitOpen(false)
    onExit()
  }

  const finish = () => {
    stopSubscription()
    onExit()
  }

  if (view === 'idle') return <section id="page-pvp" className="hidden" />
  const role = roleRef.current
  const me = match ? role === 'Player1' ? { name: match.p1Name, avatar: match.p1Avatar, hp: myHp } : { name: match.p2Name, avatar: match.p2Avatar, hp: myHp } : null
  const opponent = match ? role === 'Player1' ? { name: match.p2Name, avatar: match.p2Avatar, hp: match.p2Hp } : { name: match.p1Name, avatar: match.p1Avatar, hp: match.p1Hp } : null
  const currentReady = match ? role === 'Player1' ? match.p1Ready : match.p2Ready : false
  const winner = match ? isPvpWinner(role, match) : false

  return <section id="page-pvp" className="flex-1 absolute inset-0 w-full h-full overflow-hidden bg-slate-950 text-white">
    {view === 'select' && <div className="absolute inset-0 flex flex-col items-center justify-center z-40 bg-slate-950/80 px-4 overflow-y-auto"><h2 className="text-4xl md:text-6xl font-black mb-3 text-yellow-300">ศึกประลองความรู้ PVP</h2><p className="text-amber-200 font-bold mb-8">🔥 Real-time 1v1 บน Firestore 🔥</p><div className="flex flex-col md:flex-row gap-6 w-full max-w-3xl"><ModeCard icon="⚡" title="สุ่มท้าสู้ด่วน" text="จับคู่กับผู้เล่นที่กำลังรอในระบบ"><button type="button" onClick={() => void join(null)} className="w-full py-3.5 bg-gradient-to-b from-blue-500 to-indigo-600 font-black rounded-2xl">⚔️ เข้าประลองด่วน</button></ModeCard><ModeCard icon="🔒" title="ห้องส่วนตัว" text="สร้างหรือเข้าห้องด้วยรหัส 4 หลัก"><input value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="กรอกรหัสห้อง 4 หลัก" className="w-full px-4 py-3 text-center text-slate-900 text-2xl font-black rounded-xl mb-3" /><button type="button" onClick={() => void join(pin)} className="w-full py-3.5 bg-gradient-to-b from-red-500 to-rose-600 font-black rounded-2xl">⚔️ เข้าห้องท้าสู้ส่วนตัว</button></ModeCard></div>{message && <p className="text-red-300 font-bold mt-4">{message}</p>}<button type="button" onClick={onExit} className="mt-8 px-8 py-3 bg-slate-800 rounded-full font-bold">🚪 กลับสู่ Lobby</button></div>}
    {view === 'matching' && <Center><div className="text-6xl animate-spin mb-4">⌛</div><h2 className="text-3xl font-black">กำลังค้นหาห้องประลอง...</h2><button type="button" onClick={() => void leaveRoom()} className="mt-6 px-6 py-2 bg-red-600 rounded-full font-bold">ยกเลิกการค้นหา</button></Center>}
    {view === 'room' && match && <Center><h2 className="text-4xl font-black text-yellow-300 mb-6">ห้องเตรียมพร้อมประลอง ⚔️</h2><div className="flex gap-5 items-stretch w-full max-w-2xl"><PlayerCard name={match.p1Name} avatar={match.p1Avatar} ready={match.p1Ready} /><div className="self-center text-3xl font-black text-yellow-400">VS</div><PlayerCard name={match.p2Id ? match.p2Name : 'กำลังหาคู่ประลอง...'} avatar={match.p2Id ? match.p2Avatar : '❓'} ready={match.p2Ready} waiting={!match.p2Id} /></div>{match.p2Id && <button type="button" onClick={() => void toggleReady()} className={`w-full max-w-sm mt-6 py-4 ${currentReady ? 'bg-yellow-600' : 'bg-emerald-600'} font-black text-xl rounded-2xl`}>{currentReady ? '❌ ยกเลิกความพร้อม' : '🎮 ฉันพร้อมแล้ว!'}</button>}<button type="button" onClick={() => void leaveRoom()} className="mt-4 px-6 py-2 bg-gray-800 rounded-full font-bold">ออกจากห้องประลอง</button>{message && <p className="text-red-300 mt-3">{message}</p>}</Center>}
    {view === 'loadingBattle' && <Center><div className="text-6xl animate-spin">⚔️</div><p className="font-bold mt-4">กำลังเตรียมคำถาม...</p></Center>}
    {view === 'arena' && me && opponent && questions[questionIndex] && <div className="flex flex-col h-full"><div className="flex justify-between p-4 bg-black/50 border-b-2 border-indigo-500"><ArenaPlayer {...me} /><div className="self-center text-4xl font-black text-yellow-500">VS</div><ArenaPlayer {...opponent} right /></div><div className="flex-1 flex items-center justify-center p-4 overflow-y-auto"><div className="bg-white text-gray-800 p-6 md:p-8 rounded-3xl border-4 border-indigo-400 w-full max-w-3xl"><div className="flex justify-between mb-4"><span className="font-bold">ข้อที่ {questionIndex + 1}/{questions.length}</span><span className="bg-gray-800 text-white px-3 py-1 rounded-full font-mono">00:{timeLeft.toString().padStart(2, '0')}</span></div><h3 className="text-xl md:text-3xl font-black mb-6">{questions[questionIndex].text}</h3><div className="grid grid-cols-1 md:grid-cols-2 gap-4">{questions[questionIndex].options.map((option, optionIndex) => option ? <button key={optionIndex} type="button" onClick={() => answer(optionIndex)} className="p-4 text-left border-2 border-indigo-400 rounded-2xl bg-white hover:bg-indigo-50 font-bold"><span className="mr-3">{optionIndex + 1}.</span>{String(option)}</button> : null)}</div></div></div><button type="button" onClick={() => setForfeitOpen(true)} className="absolute bottom-4 left-4 bg-black/60 px-4 py-2 rounded-full font-bold">🏳️ ขอยอมแพ้ / ออกจากห้อง</button></div>}
    {view === 'waiting' && <Center><div className="text-6xl animate-pulse">⌛</div><p className="text-xl font-bold mt-4">ตอบครบแล้ว กำลังรอคู่แข่งสรุปผล...</p></Center>}
    {view === 'result' && match && <Center><div className="text-8xl mb-5">{winner ? '🏆' : '💀'}</div><h2 className={`text-6xl font-black ${winner ? 'text-yellow-300' : 'text-red-500'}`}>{winner ? 'ชัยชนะ!' : 'พ่ายแพ้...'}</h2><p className="text-xl text-yellow-200 mt-4">{winner ? 'คุณปราบคู่ต่อสู้ได้สำเร็จ!' : 'คุณถูกสยบในการประลองครั้งนี้'}</p><button type="button" onClick={finish} className="mt-8 px-8 py-4 bg-gradient-to-r from-yellow-400 to-orange-500 text-black font-black text-xl rounded-full">กลับไปหน้า Lobby 🚪</button></Center>}
    {view === 'error' && <Center><p className="text-red-300 text-xl font-black">{message}</p><button type="button" onClick={reset} className="mt-5 bg-blue-600 px-6 py-2 rounded-xl font-bold">กลับหน้าเลือกโหมด</button></Center>}
    {forfeitOpen && <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4"><div className="bg-white text-gray-800 rounded-3xl p-8 max-w-md text-center"><h3 className="text-3xl font-black text-red-600">ยอมแพ้?</h3><p className="my-4 font-bold">ออกจากการประลองแล้วจะถูกปรับแพ้ทันที</p><div className="flex gap-3"><button type="button" onClick={() => setForfeitOpen(false)} className="flex-1 bg-gray-200 py-3 rounded-xl font-bold">สู้ต่อ</button><button type="button" onClick={() => void forfeit()} className="flex-1 bg-red-600 text-white py-3 rounded-xl font-bold">ยืนยันยอมแพ้</button></div></div></div>}
  </section>
}

function Center({ children }: { children: React.ReactNode }) { return <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 px-4 text-center">{children}</div> }
function ModeCard({ icon, title, text, children }: { icon: string; title: string; text: string; children: React.ReactNode }) { return <div className="flex-1 bg-slate-900 border-2 border-amber-700 rounded-3xl p-8 text-center"><div className="text-6xl mb-4">{icon}</div><h3 className="text-3xl font-black mb-3">{title}</h3><p className="text-slate-300 mb-6">{text}</p>{children}</div> }
function PlayerCard({ name, avatar, ready, waiting }: { name: string; avatar: string; ready: boolean; waiting?: boolean }) { return <div className="flex-1 bg-slate-900 border border-indigo-500/40 rounded-3xl p-6"><div className="text-6xl">{avatar || '🧙‍♂️'}</div><h4 className="text-xl font-bold mt-2">{name}</h4><div className={`mt-2 text-sm font-black ${ready ? 'text-emerald-300' : 'text-red-300'}`}>{waiting ? '⏳ รอผู้เล่น' : ready ? '🟢 พร้อมประลอง!' : '🔴 กำลังเตรียมตัว'}</div></div> }
function ArenaPlayer({ name, avatar, hp, right }: { name: string; avatar: string; hp: number; right?: boolean }) { return <div className={`flex gap-3 items-center ${right ? 'flex-row-reverse text-right' : ''}`}><div className="text-5xl">{avatar || '🧙‍♂️'}</div><div><div className="font-bold">{name}</div><div className="w-28 md:w-48 h-4 bg-gray-800 rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-red-600 to-red-400" style={{ width: `${Math.max(0, hp)}%` }} /></div><div className="text-xs">{Math.ceil(Math.max(0, hp))} / 100</div></div></div> }
