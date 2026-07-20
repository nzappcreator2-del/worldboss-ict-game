import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import leaderboardHall from '../assets/generated/leaderboard-hall.jpg'

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

export function Leaderboard({ service, onClose }: { service: LeaderboardService; onClose?(): void }) {
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

  return (
    <div id="dash-tab-rank" className="leaderboard-page">
      <section className="leaderboard-window">
        <header className="leaderboard-hero">
          <img src={leaderboardHall} alt="" draggable={false} />
          <div className="leaderboard-hero-copy">
            <span>HALL OF CHAMPIONS</span>
            <h1>ทำเนียบผู้กล้า</h1>
            <p>เกียรติยศของนักเรียนและกิลด์ที่พิชิตด่านความรู้</p>
          </div>
          <button type="button" className="feature-close-button" aria-label="ปิดหน้าจัดอันดับ" onClick={() => onClose?.()}><span aria-hidden="true">×</span><b>ปิด</b></button>
          <nav className="leaderboard-tabs" aria-label="ประเภทตารางอันดับ">
            <button type="button" aria-label="ผู้กล้าเดี่ยว" aria-pressed={mode === 'individual'} onClick={() => switchMode('individual')} className={mode === 'individual' ? 'active' : ''}>⚔️ ผู้กล้าเดี่ยว</button>
            <button type="button" aria-label="อันดับกิลด์" aria-pressed={mode === 'guild'} onClick={() => switchMode('guild')} className={mode === 'guild' ? 'active' : ''}>🏰 อันดับกิลด์</button>
          </nav>
        </header>

        <main className="leaderboard-content">
          {status === 'idle' && <StatusCard icon="🏆" title="พร้อมเปิดทำเนียบ" copy="เลือกเมนูอันดับเพื่อเรียกข้อมูลล่าสุด" />}
          {status === 'loading' && <StatusCard icon="✦" title="กำลังรวบรวมเกียรติยศ" copy="โปรดรอสักครู่..." spinning />}
          {status === 'error' && <StatusCard icon="⚠️" title="โหลดอันดับไม่สำเร็จ" copy="การเชื่อมต่อขัดข้อง กรุณาลองอีกครั้ง"><button type="button" onClick={() => load(mode)}>ลองใหม่</button></StatusCard>}
          {status === 'ready' && entries.length === 0 && <StatusCard icon="📜" title="ยังไม่มีรายชื่อในทำเนียบ" copy={mode === 'individual' ? 'ยังไม่มีข้อมูลผู้เล่น' : 'ยังไม่มีข้อมูลกิลด์'} />}
          {status === 'ready' && entries.length > 0 && <>
            <div className="leaderboard-podium" aria-label="สามอันดับแรก">
              {entries.slice(0, 3).map((entry, index) => {
                const player = mode === 'individual' ? entry as RankedPlayer : null
                const guild = mode === 'guild' ? entry as RankedGuild : null
                const mine = player ? player.id === user?.id : guild?.name === user?.class
                return <article key={player?.id || guild?.name} data-place={index + 1} className={mine ? 'mine' : ''}>
                  <span className="leaderboard-medal" aria-hidden="true">{['♛', '◆', '●'][index]}</span>
                  <div className="leaderboard-avatar" aria-hidden="true">{player?.avatar || '🏰'}</div>
                  <h2>{player?.name || guild?.name}</h2>
                  <p>{Number(player?.xp ?? guild?.totalXp).toLocaleString()} XP</p>
                  <b>อันดับ {index + 1}</b>
                </article>
              })}
            </div>
            <div className="leaderboard-list" aria-label="รายชื่ออันดับทั้งหมด">
              {entries.map((entry, index) => mode === 'individual'
                ? <PlayerRow key={(entry as RankedPlayer).id} player={entry as RankedPlayer} index={index} mine={(entry as RankedPlayer).id === user?.id} />
                : <GuildRow key={(entry as RankedGuild).name} guild={entry as RankedGuild} index={index} mine={(entry as RankedGuild).name === user?.class} />)}
            </div>
          </>}
        </main>
      </section>
    </div>
  )
}

function StatusCard({ icon, title, copy, spinning = false, children }: { icon: string; title: string; copy: string; spinning?: boolean; children?: ReactNode }) {
  return <div className="leaderboard-status"><span className={spinning ? 'spinning' : ''} aria-hidden="true">{icon}</span><h2>{title}</h2><p>{copy}</p>{children}</div>
}

function PlayerRow({ player, index, mine }: { player: RankedPlayer; index: number; mine: boolean }) {
  return <article className={`leaderboard-row ${mine ? 'mine' : ''}`}>
    <div className="leaderboard-place">{index + 1}</div>
    <div className="leaderboard-row-avatar" aria-hidden="true">{player.avatar || '🧙‍♂️'}</div>
    <div className="leaderboard-row-copy"><h3>{player.name} {mine && <span>คุณ</span>}</h3><p>{player.class} • {player.rank}</p></div>
    <div className="leaderboard-score"><b>{Number(player.xp).toLocaleString()} XP</b><span>Lv.{player.level}</span></div>
  </article>
}

function GuildRow({ guild, index, mine }: { guild: RankedGuild; index: number; mine: boolean }) {
  return <article className={`leaderboard-row ${mine ? 'mine' : ''}`}>
    <div className="leaderboard-place">{index + 1}</div>
    <div className="leaderboard-row-avatar" aria-hidden="true">🏰</div>
    <div className="leaderboard-row-copy"><h3>{guild.name} {mine && <span>กิลด์ของคุณ</span>}</h3><p>สมาชิก {guild.memberCount} คน</p></div>
    <div className="leaderboard-score"><b>{Number(guild.totalXp).toLocaleString()} XP</b><span>Guild Power</span></div>
  </article>
}
