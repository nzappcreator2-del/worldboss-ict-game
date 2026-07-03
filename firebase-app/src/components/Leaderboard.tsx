import { useCallback, useEffect, useRef, useState } from 'react'

export type RankedPlayer = {
  id: string
  name: string
  class: string
  xp: number
  level: number
  rank: string
  avatar?: string
  badges?: string[]
}

export type RankedGuild = { name: string; totalXp: number; memberCount: number }
export type PlayerResult = { success: boolean; data?: RankedPlayer[]; error?: string }
export type GuildResult = { success: boolean; data?: RankedGuild[]; error?: string }

export type LeaderboardService = {
  getCurrentUser(): { id: string; class: string } | null
  loadPlayers(): Promise<PlayerResult>
  loadGuilds(): Promise<GuildResult>
}

type Mode = 'individual' | 'guild'
type Entry = RankedPlayer | RankedGuild

export function Leaderboard({ service }: { service: LeaderboardService }) {
  const [mode, setMode] = useState<Mode>('individual')
  const [entries, setEntries] = useState<Entry[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const requestId = useRef(0)

  const load = useCallback(async (target: Mode = mode) => {
    const id = ++requestId.current
    setStatus('loading')
    try {
      const result = target === 'individual' ? await service.loadPlayers() : await service.loadGuilds()
      if (id !== requestId.current) return
      if (!result.success) throw new Error(result.error || 'load failed')
      setEntries(result.data || [])
      setStatus('ready')
    } catch {
      if (id === requestId.current) setStatus('error')
    }
  }, [mode, service])

  useEffect(() => {
    const open = () => void load(mode)
    window.addEventListener('nextgen:open-leaderboard', open)
    return () => window.removeEventListener('nextgen:open-leaderboard', open)
  }, [load, mode])

  const switchMode = (next: Mode) => {
    if (next === mode) return
    setMode(next)
    setEntries([])
    void load(next)
  }

  const user = service.getCurrentUser()
  const medals = ['🥇', '🥈', '🥉']
  const podiumHeights = ['h-28', 'h-20', 'h-16']

  return (
    <div id="dash-tab-rank" className="flex flex-1 flex-col items-center justify-start p-4 overflow-hidden">
      <div className="rpg-box rpg-box-yellow w-full max-w-2xl h-full mb-32 overflow-hidden flex flex-col relative bg-white/90 shadow-2xl">
        <header className="bg-gradient-to-r from-yellow-500 to-orange-500 p-5 text-white flex justify-between items-center border-b-4 border-yellow-700 shrink-0 flex-wrap gap-2">
          <h3 className="font-black text-3xl flex items-center gap-2 drop-shadow-md">🏆 หอเกียรติยศ</h3>
          <div className="flex bg-white/30 p-1 rounded-xl shadow-inner border border-white/20">
            <button type="button" aria-label="ผู้กล้าเดี่ยว" aria-pressed={mode === 'individual'} onClick={() => switchMode('individual')} className={`px-3 py-1.5 font-bold rounded-lg text-sm ${mode === 'individual' ? 'bg-yellow-100 text-yellow-900 shadow-sm' : 'text-white opacity-80'}`}>👦 ผู้กล้าเดี่ยว</button>
            <button type="button" aria-label="อันดับกิลด์" aria-pressed={mode === 'guild'} onClick={() => switchMode('guild')} className={`px-3 py-1.5 font-bold rounded-lg text-sm ${mode === 'guild' ? 'bg-yellow-100 text-yellow-900 shadow-sm' : 'text-white opacity-80'}`}>🏯 อันดับกิลด์</button>
          </div>
        </header>
        <div className="p-6 flex-1 overflow-y-auto pb-10">
          {status === 'loading' && <div className="text-center text-gray-500 font-bold p-8">กำลังโหลดข้อมูล... ⏳</div>}
          {status === 'error' && <div className="text-center p-8"><p className="text-red-600 font-bold mb-3">โหลดอันดับไม่สำเร็จ</p><button type="button" onClick={() => load(mode)} className="px-5 py-2 bg-indigo-600 text-white rounded-xl font-bold">ลองใหม่</button></div>}
          {status === 'ready' && entries.length === 0 && <div className="text-center text-gray-500 p-8">{mode === 'individual' ? 'ยังไม่มีข้อมูลผู้เล่น' : 'ยังไม่มีข้อมูลกิลด์'}</div>}
          {status === 'ready' && entries.length > 0 && <>
            <div className="flex items-end justify-center gap-4 mb-8 py-4" aria-label="สามอันดับแรก">
              {entries.slice(0, 3).map((entry, index) => {
                const player = mode === 'individual' ? entry as RankedPlayer : null
                const guild = mode === 'guild' ? entry as RankedGuild : null
                const mine = player ? player.id === user?.id : guild?.name === user?.class
                return <div key={player?.id || guild?.name} className={`flex flex-col items-center w-1/3 ${index === 0 ? 'order-2' : index === 1 ? 'order-1' : 'order-3'}`}>
                  <div className={`mb-1 ${index === 0 ? 'text-4xl' : 'text-3xl'}`}>{player?.avatar || '🏰'}</div>
                  <span className={`text-xs font-bold truncate max-w-full ${mine ? 'text-indigo-700' : 'text-gray-800'}`}>{player?.name || guild?.name}</span>
                  <span className="text-[10px] text-amber-700 font-bold">{player?.xp ?? guild?.totalXp} XP</span>
                  <div className={`w-full bg-gradient-to-t from-yellow-300 to-yellow-500 ${podiumHeights[index]} rounded-t-xl mt-2 flex items-start justify-center pt-2 shadow-md ${mine ? 'ring-2 ring-indigo-500' : ''}`}><span className="text-2xl">{medals[index]}</span></div>
                </div>
              })}
            </div>
            <div className="space-y-3">
              {entries.map((entry, index) => mode === 'individual'
                ? <PlayerRow key={(entry as RankedPlayer).id} player={entry as RankedPlayer} index={index} mine={(entry as RankedPlayer).id === user?.id} />
                : <GuildRow key={(entry as RankedGuild).name} guild={entry as RankedGuild} index={index} mine={(entry as RankedGuild).name === user?.class} />)}
            </div>
          </>}
        </div>
      </div>
    </div>
  )
}

function PlayerRow({ player, index, mine }: { player: RankedPlayer; index: number; mine: boolean }) {
  return <article className={`flex items-center gap-4 p-3 rounded-xl bg-gradient-to-r from-gray-100 to-gray-50 border shadow-sm ${mine ? 'ring-2 ring-indigo-500' : ''}`}>
    <div className="w-8 text-center font-black text-lg text-gray-500">{index + 1}</div>
    <div className="text-2xl w-10 text-center">{player.avatar || '🧙‍♂️'}</div>
    <div className="flex-1 min-w-0"><div className="font-bold text-gray-800 truncate">{player.name} {mine && <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">คุณ</span>}</div><div className="text-xs text-gray-500">{player.class} • {player.rank}</div></div>
    <div className="text-right"><div className="font-black text-indigo-600">{player.xp} <span className="text-xs text-gray-400">XP</span></div><div className="text-xs text-gray-500">Lv.{player.level}</div></div>
  </article>
}

function GuildRow({ guild, index, mine }: { guild: RankedGuild; index: number; mine: boolean }) {
  return <article className={`flex items-center gap-4 p-3 rounded-xl bg-gradient-to-r from-gray-100 to-gray-50 border shadow-sm ${mine ? 'ring-2 ring-indigo-500' : ''}`}>
    <div className="w-8 text-center font-black text-lg text-gray-500">{index + 1}</div><div className="text-2xl">🏯</div>
    <div className="flex-1"><div className="font-bold text-gray-800">{guild.name} {mine && <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">กิลด์ของคุณ</span>}</div><div className="text-xs text-gray-500">สมาชิก {guild.memberCount} คน</div></div>
    <div className="font-black text-indigo-600">{guild.totalXp} <span className="text-xs text-gray-400">XP</span></div>
  </article>
}
