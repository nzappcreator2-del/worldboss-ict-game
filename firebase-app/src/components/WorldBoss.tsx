import { useCallback, useEffect, useRef, useState } from 'react'
import { gameFileForBoss, normalizeWorldBosses, scorePresentation, validWorldBossResult, type WorldBossConfig } from './worldBossLogic'

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

function displayBoss(boss: WorldBossConfig) {
  if (boss.id === 'WB001' || boss.poseType === 'mario_fitness') return {
    title: 'มาริโอ้ฟิตเนสสะสมเหรียญ', emoji: '🍄', accent: 'text-emerald-400 border-emerald-500',
    condition: 'มาริโอ้คลาสสิก (Mario Fitness)',
    description: 'ขยับร่างกายวิ่ง กระโดดหลบอุปสรรค และเก็บเหรียญทองเพื่อทำสถิติเวลาที่เร็วที่สุด',
  }
  if (boss.id === 'WB003' || boss.poseType === 'neck_quiz') return {
    title: 'วิทยาการคำนวณ ม.2', emoji: '🧘‍♂️', accent: 'text-pink-400 border-pink-500',
    condition: 'เอียงคอซ้าย–ขวาเลือกคำตอบ',
    description: 'ใช้กล้องตรวจจับการเอียงคอเพื่อเลือกคำตอบและพิชิตคะแนนความรู้วิทยาการคำนวณ',
  }
  return {
    title: 'สมรภูมิมือปราบภัย AI', emoji: '🛡️', accent: 'text-violet-400 border-violet-500',
    condition: 'AI Safety Hand-Tracker',
    description: 'ใช้กล้องหรือเมาส์ลากแยกสถานการณ์ความปลอดภัยของ AI ให้ถูกหมวดหมู่และทำคะแนนสูงสุด',
  }
}

export function WorldBoss({
  service,
  onExit,
  onUserUpdate,
  openGame = (url) => window.open(url, '_blank'),
  createSession = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
}: Props) {
  const [bosses, setBosses] = useState<WorldBossConfig[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [leaderboardId, setLeaderboardId] = useState<string | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([])
  const [leaderboardLoading, setLeaderboardLoading] = useState(false)
  const [notice, setNotice] = useState('')
  const activeGame = useRef<{ session: string; popup: Window } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    setNotice('')
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
        setNotice(`บันทึกสถิติสำเร็จ: ${shown.value} ${shown.unit} • +${result.rewardCoins || 0} เหรียญ • +${result.rewardXp || 0} XP`)
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
    setNotice('เปิดสมรภูมิในแท็บใหม่แล้ว เมื่อจบเกมระบบจะบันทึกผลกลับ Firestore อัตโนมัติ')
  }

  const currentUser = service.getCurrentUser()

  return (
    <div id="page-world-boss" className="hidden flex-1 flex-col relative z-20 p-4 md:p-8 h-full overflow-y-auto text-white">
      <div className="flex items-center justify-between mb-6 gap-3">
        <button type="button" aria-label="กลับห้องโถงหลัก" onClick={onExit} className="btn-action text-purple-800 font-black bg-purple-100 hover:bg-purple-200 px-5 py-2.5 rounded-xl shadow-sm">← กลับห้องโถงหลัก</button>
        <h2 className="rpg-title text-2xl md:text-3xl text-white drop-shadow-lg">📸 มินิเกมตรวจจับท่าทาง</h2>
      </div>

      <div className="rpg-box bg-slate-900/90 p-5 rounded-3xl border-4 border-amber-600/80 shadow-lg w-full max-w-4xl mx-auto mb-6">
        <h3 className="font-black text-amber-400 text-lg mb-2">📖 คู่มือผู้กล้า (AI Camera Guide)</h3>
        <p className="text-xs md:text-sm text-slate-200 font-bold">อนุญาตสิทธิ์กล้อง ยืนในที่มีแสงเพียงพอ และจัดร่างกายให้อยู่ในกรอบ ระบบยังรองรับเมาส์/คีย์บอร์ดตามแต่ละมินิเกม</p>
      </div>

      {notice && <div role="status" className="max-w-4xl w-full mx-auto mb-4 bg-emerald-950/90 border-2 border-emerald-500 text-emerald-200 rounded-xl px-4 py-3 font-bold text-center">{notice}</div>}
      {error && <div role="alert" className="max-w-4xl w-full mx-auto mb-4 bg-red-950/90 border-2 border-red-500 text-red-200 rounded-xl px-4 py-3 font-bold text-center">{error}</div>}
      {loading && <div className="text-center p-12 font-bold text-purple-200">🔮 กำลังเปิดประตูมิติและโหลดข้อมูลบอส...</div>}
      {!loading && !error && bosses.length === 0 && <div className="text-center p-12 bg-slate-900 rounded-3xl">⚔️ ขณะนี้เวิลด์บอสทั้งหมดกำลังพักฟื้นพลัง</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full max-w-7xl mx-auto mb-8">
        {bosses.map((boss) => {
          const display = displayBoss(boss)
          const localBest = currentUser ? localStorage.getItem(`wb_best_time_${currentUser.id}_${boss.id}`) : null
          return (
            <article key={boss.id} className={`rpg-box bg-slate-900/95 p-6 rounded-3xl border-4 ${display.accent.split(' ')[1]} flex flex-col shadow-xl`}>
              <div className="flex gap-4 items-start"><div className="text-6xl">{display.emoji}</div><div className="flex-1"><span className="text-[10px] font-black px-2 py-1 rounded-full border border-slate-600">MINI-GAME</span><h3 className={`font-black text-xl mt-2 ${display.accent.split(' ')[0]}`}>{display.title}</h3><p className="text-xs text-emerald-300 mt-2">🎯 {display.condition}</p></div></div>
              <p className="text-xs text-gray-300 leading-relaxed mt-4 flex-1">{display.description}</p>
              <div className="grid grid-cols-2 gap-3 my-5 bg-slate-950/50 p-3 rounded-2xl text-xs"><div><span className="text-gray-500 block">รางวัลสูงสุด</span><b className="text-yellow-400">🪙 +{boss.rewardCoins}</b> <b className="text-indigo-400">⭐ +{boss.rewardXp}</b></div><div className="text-right"><span className="text-gray-500 block">บันทึกของท่าน</span><b>{localBest || 'ยังไม่มีสถิติ'}</b></div></div>
              <div className="flex gap-3"><button type="button" aria-label={`เริ่มเล่น ${display.title}`} onClick={() => start(boss)} className="flex-1 py-3 bg-gradient-to-r from-purple-500 to-indigo-600 text-white font-black rounded-xl border-b-4 border-indigo-800">⚔️ เริ่มเล่น</button><button type="button" aria-label={`ดูอันดับ ${display.title}`} onClick={() => void showLeaderboard(boss.id)} className="px-4 py-3 bg-slate-700 text-white font-black rounded-xl">🏆</button></div>
            </article>
          )
        })}
      </div>

      {leaderboardId && (
        <section aria-label="ตารางอันดับ World Boss" className="w-full max-w-4xl mx-auto bg-white text-gray-800 rounded-3xl border-4 border-purple-500 overflow-hidden shadow-2xl mb-8">
          <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-4 text-white flex justify-between items-center"><h3 className="font-black">🏆 ทำเนียบสถิติที่ดีที่สุด (Top 10)</h3><button type="button" aria-label="ปิดตารางอันดับ" onClick={() => setLeaderboardId(null)}>×</button></div>
          {leaderboardId.startsWith('WB002') && <div className="flex justify-center flex-wrap gap-2 p-3 bg-slate-900">{wb002Tabs.map(([id, label]) => <button type="button" key={id} aria-label={label} onClick={() => void showLeaderboard(id)} className={`px-3 py-1.5 text-xs font-black rounded-lg border ${leaderboardId === id ? 'bg-cyan-400 text-slate-950' : 'bg-slate-800 text-cyan-300'}`}>{label}</button>)}</div>}
          {leaderboardLoading ? <div className="p-8 text-center font-bold">กำลังโหลดทำเนียบผู้กล้า...</div> : leaderboard.length === 0 ? <div className="p-8 text-center">ยังไม่มีผู้กล้าพิชิตบอสตัวนี้</div> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-purple-50"><th className="p-3">อันดับ</th><th className="p-3 text-left">ผู้กล้า</th><th className="p-3">ชั้น</th><th className="p-3 text-right">สถิติ</th><th className="p-3">วันที่</th></tr></thead><tbody>{leaderboard.map((row, index) => { const shown = scorePresentation(leaderboardId, row.bestTime); return <tr key={`${row.userId}-${index}`} className={row.userId === currentUser?.id ? 'bg-yellow-100 font-bold' : ''}><td className="p-3 text-center">{['🥇', '🥈', '🥉'][index] || index + 1}</td><td className="p-3">{row.name}{row.userId === currentUser?.id ? ' (คุณ)' : ''}</td><td className="p-3 text-center">{row.className}</td><td className="p-3 text-right text-purple-700 font-mono font-black">{shown.value} {shown.unit}</td><td className="p-3 text-center text-xs text-gray-500">{row.date}</td></tr>})}</tbody></table></div>}
        </section>
      )}
    </div>
  )
}
