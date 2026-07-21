import { useCallback, useEffect, useState } from 'react'
import { applyCyberChoice, cyberReward, type CyberRun } from './cyberSafetyLogic'

export type CyberScenario = {
  id: string
  timeOfDay?: string
  title: string
  text: string
  opt1: string
  opt2: string
  answerIdx: number
  feedbackWrong?: string
  feedbackRight?: string
  imageSvg?: string
}

export type CyberUser = { id: string; name: string; avatar?: string; coins: number; xp: number }
type LoadResult = { success: boolean; data?: CyberScenario[]; error?: string }
type SaveResult = { success: boolean; coins?: number; xp?: number; level?: number; rank?: string; error?: string }
export type CyberSafetyService = {
  getCurrentUser(): CyberUser | null
  loadScenarios(): Promise<LoadResult>
  saveResult(userId: string, shield: number, coins: number, xp: number): Promise<SaveResult>
}

type Props = { service: CyberSafetyService; onExit(): void; onUserUpdate(user: Partial<CyberUser> & { level?: number; rank?: string }): void }
type View = 'idle' | 'cover' | 'loading' | 'story' | 'choices' | 'feedback' | 'victory' | 'error'
const initialRun: CyberRun = { shield: 100, coins: 0, xp: 0, attempts: 0 }

const safeImage = (raw?: string) => {
  try {
    const url = new URL(raw || '')
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : ''
  } catch { return '' }
}

export function CyberSafety({ service, onExit, onUserUpdate }: Props) {
  const [view, setView] = useState<View>('idle')
  const [scenarios, setScenarios] = useState<CyberScenario[]>([])
  const [index, setIndex] = useState(0)
  const [run, setRun] = useState(initialRun)
  const [correct, setCorrect] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')

  const open = useCallback(() => {
    setView('cover')
    setScenarios([])
    setIndex(0)
    setRun(initialRun)
    setFeedback('')
    setSaved(false)
    setSaveError('')
  }, [])

  const exit = useCallback(() => {
    setView('idle')
    onExit()
  }, [onExit])

  useEffect(() => {
    window.addEventListener('nextgen:open-cyber-safety', open)
    return () => window.removeEventListener('nextgen:open-cyber-safety', open)
  }, [open])

  const start = async () => {
    setView('loading')
    setSaveError('')
    try {
      const result = await service.loadScenarios()
      if (!result.success || !result.data?.length) throw new Error(result.error || 'no scenarios')
      setScenarios(result.data)
      setIndex(0)
      setRun(initialRun)
      setView('story')
    } catch {
      setView('error')
    }
  }

  const choose = (selected: number) => {
    const scenario = scenarios[index]
    if (!scenario) return
    const isCorrect = selected === Number(scenario.answerIdx)
    const reward = cyberReward(run.attempts)
    setRun((current) => applyCyberChoice(current, isCorrect))
    setCorrect(isCorrect)
    setFeedback(isCorrect
      ? `🎉 ${run.attempts > 0 ? 'แก้ตัวสำเร็จ' : 'ตอบถูกครั้งแรก'} (+${reward.coins} Coins)\n\n${scenario.feedbackRight || ''}`
      : `🚨 Cyber Shield เสียหาย!\n\n${scenario.feedbackWrong || ''}`)
    setView('feedback')
  }

  const continueAfterFeedback = () => {
    if (!correct) {
      setView('choices')
      return
    }
    if (index + 1 >= scenarios.length) {
      setView('victory')
      return
    }
    setIndex((current) => current + 1)
    setRun((current) => ({ ...current, attempts: 0 }))
    setView('story')
  }

  const save = async () => {
    const user = service.getCurrentUser()
    if (!user || saved) return
    setSaveError('')
    try {
      const result = await service.saveResult(user.id, run.shield, run.coins, run.xp)
      if (!result.success) throw new Error(result.error || 'save failed')
      setSaved(true)
      onUserUpdate({ coins: result.coins, xp: result.xp, level: result.level, rank: result.rank })
    } catch {
      setSaveError('บันทึกผลไม่สำเร็จ กรุณาลองใหม่')
    }
  }

  if (view === 'idle') return <section id="page-cyber-safety" className="hidden" />
  const scenario = scenarios[index]
  const background = safeImage(scenario?.imageSvg)

  return (
    // Fullscreen fixed overlay (see #page-cyber-safety CSS): scenario art
    // bleeds edge to edge, and with no art the game backdrop shows through
    // instead of a solid black slab.
    <section id="page-cyber-safety" className="cyber-safety-page flex flex-col items-center justify-start overflow-y-auto py-8 px-4" style={background ? { backgroundImage: `linear-gradient(rgba(15,23,42,.2),rgba(15,23,42,.4)),url('${background}')`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
      {view === 'cover' && <div className="w-full max-w-lg z-10 my-auto text-center text-white"><h2 className="text-4xl md:text-5xl font-black mb-6">ผู้พิทักษ์ภัยไซเบอร์</h2><div className="glass-card bg-slate-950/80 border-4 border-cyan-400 rounded-3xl p-8"><div className="text-8xl mb-5 animate-bounce">🛡️</div><p className="text-cyan-100 font-bold mb-6">ช่วย “น้องเซฟ” ตัดสินใจแก้สถานการณ์จำลอง และรักษา Cyber Shield ให้ปลอดภัย!</p><div className="grid grid-cols-3 gap-2 mb-6"><Info icon="🛡️" label="Shield" value="100%" /><Info icon="🪙" label="รางวัล" value="+20 / ด่าน" /><Info icon="📖" label="ภารกิจ" value="ภัยไซเบอร์" /></div><button type="button" onClick={() => void start()} className="w-full py-4 bg-gradient-to-r from-cyan-400 to-indigo-500 text-white font-black rounded-2xl border-b-8 border-blue-800">🎮 เริ่มภารกิจปกป้องภัยไซเบอร์</button><button type="button" onClick={exit} className="mt-4 text-cyan-300 font-bold underline">กลับหน้าหลักเลือกโหมด</button></div></div>}
      {view === 'loading' && <div className="glass-card p-8 max-w-lg text-center my-auto z-10"><div className="w-12 h-12 border-4 border-cyan-200 border-t-cyan-600 rounded-full animate-spin mx-auto mb-4" /><p className="font-black">กำลังโหลดภารกิจ...</p></div>}
      {view === 'error' && <div className="glass-card bg-white p-8 max-w-lg text-center my-auto z-10"><p className="text-red-600 font-black mb-4">โหลดภารกิจไม่สำเร็จ</p><button type="button" onClick={() => void start()} className="bg-blue-600 text-white font-bold px-6 py-2 rounded-xl">ลองใหม่</button><button type="button" onClick={exit} className="block mx-auto mt-4 underline">กลับ Lobby</button></div>}
      {['story', 'choices', 'feedback'].includes(view) && scenario && <div className="w-full max-w-4xl min-h-full flex flex-col justify-between z-10">
        <div className="flex flex-wrap gap-3 bg-slate-950/85 border-2 border-cyan-500 p-3 rounded-2xl text-white self-start"><span>🕒 {scenario.timeOfDay || 'ทั่วไป'}</span><span>Cyber Shield: {run.shield}%</span><span>🪙 {run.coins}</span></div>
        <div className="flex-1 flex items-center justify-center py-8">{view === 'choices' && <div className="w-full flex flex-col gap-3">{[scenario.opt1, scenario.opt2].map((option, optionIndex) => <button key={optionIndex} type="button" onClick={() => choose(optionIndex)} className="w-full bg-black/95 hover:bg-white hover:text-black text-white border border-white/40 font-bold rounded-3xl py-4 px-6">{option}</button>)}</div>}</div>
        <div data-testid="cyber-event-panel" style={{ backgroundColor: 'rgba(2, 6, 23, 0.96)' }} className={`bg-slate-950 border-4 shadow-2xl ${view === 'feedback' ? correct ? 'border-emerald-400' : 'border-rose-400' : 'border-cyan-300'} p-6 rounded-3xl text-white`}><div className="text-cyan-200 text-lg font-black mb-3">📖 เหตุการณ์: {scenario.title}</div><p className="whitespace-pre-wrap text-base md:text-lg text-white font-bold leading-relaxed drop-shadow-md">{view === 'feedback' ? feedback : scenario.text || 'ไม่พบรายละเอียดเหตุการณ์'}</p><div className="flex flex-wrap gap-3 justify-between items-center border-t border-white/20 pt-3 mt-4"><span className="font-bold text-white">{service.getCurrentUser()?.avatar || '🧙‍♂️'} คู่หูผู้พิทักษ์</span>{view === 'story' && <button type="button" onClick={() => setView('choices')} className="bg-gradient-to-r from-cyan-300 to-blue-400 text-slate-950 px-5 py-2.5 rounded-xl font-black shadow-lg">ร่วมตัดสินใจ</button>}{view === 'feedback' && <button type="button" onClick={continueAfterFeedback} className="bg-gradient-to-r from-cyan-300 to-blue-400 text-slate-950 px-5 py-2.5 rounded-xl font-black shadow-lg">{correct ? index + 1 >= scenarios.length ? 'สรุปผล' : 'เดินทางต่อไป' : 'เลือกใหม่'}</button>}</div></div>
        <button type="button" onClick={exit} className="mt-4 text-white/80 font-bold underline">กลับหน้าหลักเลือกโหมด (ไม่บันทึกแต้ม)</button>
      </div>}
      {view === 'victory' && <div className="w-full max-w-lg bg-gradient-to-b from-sky-500 to-blue-700 border-4 border-cyan-200 rounded-3xl p-6 text-center text-white z-10 my-auto"><div className="text-7xl mb-4">🛡️</div><h3 className="text-4xl font-black mb-2">ผู้พิทักษ์ภัยไซเบอร์!</h3><p className="text-cyan-100 font-bold mb-6">คุณช่วยน้องเซฟผ่านเหตุการณ์อันตรายบนโลกออนไลน์ครบแล้ว</p><div className="bg-sky-950/50 rounded-2xl p-5 mb-6"><p className="text-yellow-300 font-black">+{run.coins} Coins</p><p className="text-cyan-300 font-black">+{run.xp} EXP</p><p className="mt-2 font-bold">Cyber Shield: {run.shield}%</p></div>{saveError && <p className="text-red-200 font-bold mb-3">{saveError}</p>}<button type="button" disabled={saved} onClick={() => void save()} className="w-full py-4 bg-gradient-to-r from-yellow-400 to-yellow-500 disabled:opacity-60 text-yellow-950 font-black text-xl rounded-2xl">{saved ? '✅ บันทึกแล้ว' : '💾 ยืนยันบันทึกผลและรางวัล'}</button><button type="button" onClick={exit} className="w-full py-3 mt-3 bg-black/20 font-bold rounded-xl">กลับสู่หน้าหลัก</button></div>}
    </section>
  )
}

function Info({ icon, label, value }: { icon: string; label: string; value: string }) {
  return <div className="bg-sky-950/60 border border-sky-400/30 rounded-2xl p-2"><div className="text-2xl">{icon}</div><div className="text-[10px] font-black text-cyan-300">{label}</div><div className="text-xs font-bold">{value}</div></div>
}
