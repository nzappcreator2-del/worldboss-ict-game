import { useCallback, useEffect, useState } from 'react'

export type DashboardUser = { id: string; coins?: number; xp?: number }
export type DashboardNews = { id?: string; title: string; content: string; icon?: string; type?: string; date?: string }
export type DailyStatus = { success: boolean; progress?: Record<string, number>; done?: string[]; error?: string }
export type RewardResult = { success: boolean; coins?: number; xp?: number; error?: string }

export type DashboardHomeService = {
  getCurrentUser(): DashboardUser | null
  getNews(): DashboardNews[]
  loadDailyStatus(userId: string): Promise<DailyStatus>
  claimQuest(userId: string, questId: string, coins: number, xp: number): Promise<RewardResult>
}

type Props = {
  service: DashboardHomeService
  onUserReward(reward: { coins?: number; xp?: number }): void
}

const quests = [
  { id: 'login', title: 'เช็คอินประจำวัน', description: 'เข้าสู่ระบบผจญภัยวันนี้', target: 1, reward: '🪙 20 Coins', coins: 20, xp: 0 },
  { id: 'play1', title: 'เริ่มการเดินทาง', description: 'ออกบุกโจมตีด่านต่าง ๆ 1 ครั้ง', target: 1, reward: '⭐ 15 XP', coins: 0, xp: 15 },
  { id: 'correct5', title: 'ผู้เจนจัดความรู้', description: 'สะสมการตอบคำถามถูก 5 ข้อ', target: 5, reward: '🪙 30 Coins', coins: 30, xp: 0 },
]

export function DashboardHome({ service, onUserReward }: Props) {
  const [news, setNews] = useState<DashboardNews[]>([])
  const [progress, setProgress] = useState<Record<string, number>>({})
  const [done, setDone] = useState<string[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [claiming, setClaiming] = useState<string | null>(null)
  const [claimError, setClaimError] = useState('')

  const load = useCallback(async () => {
    const user = service.getCurrentUser()
    if (!user) return
    setStatus('loading')
    setNews(service.getNews())
    try {
      const result = await service.loadDailyStatus(user.id)
      if (!result.success) throw new Error(result.error || 'load failed')
      setProgress(result.progress || {})
      setDone((result.done || []).map(String))
      setStatus('ready')
    } catch {
      setStatus('error')
    }
  }, [service])

  useEffect(() => {
    window.addEventListener('nextgen:open-home', load)
    return () => window.removeEventListener('nextgen:open-home', load)
  }, [load])

  const claim = async (quest: typeof quests[number]) => {
    const user = service.getCurrentUser()
    if (!user || claiming) return
    setClaiming(quest.id)
    setClaimError('')
    try {
      const result = await service.claimQuest(user.id, quest.id, quest.coins, quest.xp)
      if (!result.success) throw new Error(result.error || 'claim failed')
      setDone((current) => current.includes(quest.id) ? current : [...current, quest.id])
      onUserReward({ coins: result.coins, xp: result.xp })
    } catch {
      setClaimError('รับรางวัลไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setClaiming(null)
    }
  }

  return (
    <div id="dash-tab-home" className="flex-1 flex flex-col w-full h-full animate-fade-in relative z-10 md:p-4 overflow-hidden">
      <div className="flex flex-col items-center justify-center mb-4 mt-6 md:mt-2 shrink-0">
        <h2 className="rpg-title text-3xl md:text-5xl text-center drop-shadow-lg -rotate-1 border-b-4 border-indigo-200 pb-2">ประกาศข่าวสาร</h2>
      </div>
      <div className="rpg-box rpg-box-wood flex-1 w-full max-w-4xl mx-auto overflow-y-auto p-4 md:p-6 flex flex-col gap-4 relative shadow-2xl bg-[url('https://www.transparenttextures.com/patterns/wood-pattern.png')]">
        <section aria-labelledby="daily-quest-title" className="flex flex-col gap-2 shrink-0">
          <h3 id="daily-quest-title" className="font-bold text-gray-700">🎯 ภารกิจประจำวัน</h3>
          {status === 'loading' && <p className="text-center font-bold text-indigo-700 p-4">กำลังโหลดภารกิจ...</p>}
          {status === 'error' && <div className="text-center bg-white/80 rounded-xl p-4"><p className="font-bold text-red-600 mb-2">โหลดภารกิจไม่สำเร็จ</p><button type="button" onClick={load} className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-bold">ลองใหม่</button></div>}
          {status === 'ready' && <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            {quests.map((quest) => {
              const current = quest.id === 'login' ? 1 : Number(progress[quest.id] || 0)
              const finished = current >= quest.target
              const claimed = done.includes(quest.id)
              const percent = Math.min(100, (current / quest.target) * 100)
              return <article key={quest.id} className={`relative bg-white/85 border-2 rounded-2xl p-4 shadow-sm ${claimed ? 'border-green-500' : 'border-indigo-100'}`}>
                <div className="flex justify-between gap-2 mb-2"><h4 className="font-bold text-indigo-900 text-sm">{quest.title}</h4><span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-full whitespace-nowrap">{quest.reward}</span></div>
                <p className="text-[11px] text-gray-500 mb-3">{quest.description}</p>
                <div className="flex justify-between text-[10px] font-bold"><span>{finished ? 'พร้อมรับรางวัล!' : 'กำลังดำเนินการ...'}</span><span>{Math.min(current, quest.target)} / {quest.target}</span></div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden mt-1"><div className={`h-full ${finished ? 'bg-green-500' : 'bg-indigo-500'}`} style={{ width: `${percent}%` }} /></div>
                {finished && !claimed && <button type="button" disabled={claiming !== null} aria-label={`รับรางวัล ${quest.title}`} onClick={() => claim(quest)} className="mt-3 w-full py-2 bg-yellow-400 text-yellow-950 text-xs font-bold rounded-lg disabled:opacity-60">{claiming === quest.id ? 'กำลังรับ...' : '🎁 รับรางวัลเลย!'}</button>}
                {claimed && <div className="mt-3 py-2 bg-green-50 text-green-700 text-xs font-bold rounded-lg text-center">✅ เคลียร์เรียบร้อย</div>}
              </article>
            })}
          </div>}
          {claimError && <p role="alert" className="text-center text-red-700 bg-red-50 rounded-lg p-2 font-bold">{claimError}</p>}
        </section>
        <hr className="border-gray-200 border-dashed" />
        <section aria-label="ข่าวประกาศ" className="flex flex-col gap-4 mt-2">
          {status === 'ready' && news.length === 0 && <div className="text-center text-gray-800 font-bold p-8 bg-white/80 rounded-xl">ขณะนี้ยังไม่มีประกาศใหม่</div>}
          {news.map((item, index) => <article key={item.id || `${item.title}-${index}`} className="bg-white/95 border-l-[6px] border-indigo-500 rounded-xl shadow-lg border-2 border-gray-200 px-5 py-4">
            <h3 className="font-black text-lg md:text-xl text-indigo-900 mb-2">{item.icon || '📌'} {item.title}</h3>
            <p className="text-gray-700 font-bold text-sm md:text-base leading-relaxed mb-3 whitespace-pre-wrap">{item.content}</p>
            <div className="flex justify-between text-xs text-gray-500 font-bold border-t pt-2"><span>{item.type || ''}</span><span>{item.date ? `📅 อัปเดตเมื่อ: ${item.date}` : ''}</span></div>
          </article>)}
        </section>
        <div className="h-28 md:h-24 shrink-0" />
      </div>
    </div>
  )
}
