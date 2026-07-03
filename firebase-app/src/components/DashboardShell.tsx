import { useCallback, useEffect, useState, type ReactNode } from 'react'

export type DashboardTab = 'home' | 'profile' | 'map' | 'rank' | 'cert'

export type DashboardShellUser = {
  id: string
  name?: string
  class?: string
  avatar?: string
  xp?: number
  coins?: number
  level?: number
  rank?: string
  streak?: number
  passedLessons?: string[]
}

const tabs: Array<{ id: DashboardTab; label: string; short: string; icon: string; color: string }> = [
  { id: 'home', label: 'หน้าหลัก', short: 'Home', icon: '🏠', color: 'bg-yellow-400 border-yellow-600 text-yellow-900' },
  { id: 'profile', label: 'โปรไฟล์', short: 'Profile', icon: '👤', color: 'bg-indigo-400 border-indigo-700 text-indigo-950' },
  { id: 'map', label: 'แผนที่', short: 'Map', icon: '🗺️', color: 'bg-green-400 border-green-700 text-green-950' },
  { id: 'rank', label: 'อันดับ', short: 'Rank', icon: '🏆', color: 'bg-amber-400 border-amber-700 text-amber-950' },
  { id: 'cert', label: 'เกียรติบัตร', short: 'Cert.', icon: '📜', color: 'bg-cyan-400 border-cyan-700 text-cyan-950' },
]

export function DashboardShell({ getCurrentUser, onNavigate, onLogout, home, profile, map, rank, cert, economy }: {
  getCurrentUser(): DashboardShellUser | null
  onNavigate(tab: DashboardTab): void
  onLogout(): void
  home?: ReactNode
  profile?: ReactNode
  map?: ReactNode
  rank?: ReactNode
  cert?: ReactNode
  economy?: ReactNode
}) {
  const [user, setUser] = useState<DashboardShellUser | null>(() => getCurrentUser())
  const [active, setActive] = useState<DashboardTab>('home')

  const refreshUser = useCallback(() => setUser(getCurrentUser()), [getCurrentUser])

  useEffect(() => {
    const changeTab = (event: Event) => {
      const tab = (event as CustomEvent<string>).detail as DashboardTab
      if (tabs.some((item) => item.id === tab)) setActive(tab)
    }
    window.addEventListener('nextgen:user-updated', refreshUser)
    window.addEventListener('nextgen:dashboard-tab', changeTab)
    return () => {
      window.removeEventListener('nextgen:user-updated', refreshUser)
      window.removeEventListener('nextgen:dashboard-tab', changeTab)
    }
  }, [refreshUser])

  const navigate = (tab: DashboardTab) => { setActive(tab); onNavigate(tab) }
  const xp = Number(user?.xp) || 0
  const level = Number(user?.level) || Math.floor(xp / 100) + 1
  const levelXp = xp % 100

  return <section id="page-dashboard" className="absolute inset-0 hidden h-full w-full flex-1 overflow-hidden bg-transparent">
    <header className="pointer-events-none absolute left-0 right-0 top-4 z-20 flex flex-col items-center justify-between gap-2 px-2 md:flex-row md:items-start md:gap-0 md:px-6">
      <div className="hidden w-20 md:block lg:w-32" />
      <div className="pointer-events-auto relative mx-auto flex h-16 w-[95%] items-center rounded-full border-4 border-yellow-600 bg-yellow-100 shadow-[0_8px_0_#b45309] transition-transform hover:-translate-y-1 sm:w-[90%] md:mx-0 md:h-20 md:w-full md:max-w-sm">
        <div className="absolute -left-6 flex h-20 w-20 items-center justify-center rounded-2xl border-4 border-yellow-500 bg-gradient-to-br from-indigo-100 to-purple-200 text-4xl shadow-lg md:-left-8 md:h-24 md:w-24 md:text-5xl">{user?.avatar || '🧙‍♂️'}</div>
        <div className="ml-14 flex flex-1 flex-col justify-center px-3 sm:ml-16 md:ml-20 md:px-4"><div className="mb-1 flex items-end justify-between"><h3 className="w-24 truncate text-sm font-black tracking-wide text-yellow-900 sm:w-32 sm:text-lg md:w-40 md:text-xl">{user?.name || 'PlayerName'}</h3><span className="rounded border border-red-200 bg-red-100 px-2 py-0.5 text-[10px] font-black text-red-600 shadow-sm sm:text-xs">{user?.class || 'Class'}</span></div>
          <div className="relative flex h-5 w-full items-center overflow-hidden rounded-full border-2 border-yellow-800 bg-yellow-900 shadow-inner md:h-6"><div className="absolute inset-y-0 left-0 bg-gradient-to-r from-orange-400 to-yellow-400 transition-all duration-700" style={{ width: `${levelXp}%` }} /><div className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-white drop-shadow md:text-xs">Level <span className="mx-1 text-sm text-yellow-200">{level}</span> ({levelXp}/100)</div></div>
        </div>
      </div>
      <div className="pointer-events-auto mt-1 flex w-[98%] flex-row flex-wrap items-center justify-center gap-1 drop-shadow-md sm:gap-2 md:mt-0 md:w-48 md:flex-col md:items-end md:justify-start">
        <Stat icon="⭐" value={xp} tone="amber" label="XP" /><Stat icon="🪙" value={Number(user?.coins) || 0} tone="yellow" label="Coins" /><Stat icon="🛡️" value={user?.rank || 'BRONZE'} tone="slate" label="Rank" /><Stat icon="🔥" value={`${Number(user?.streak) || 0} วัน`} tone="orange" label="Streak" /><Stat icon="📖" value={`${user?.passedLessons?.length || 0} ด่าน`} tone="emerald" label="Progress" />
      </div>
    </header>

    <nav className="absolute bottom-2 left-1/2 z-50 flex w-auto max-w-[95%] -translate-x-1/2 flex-row items-center justify-center gap-2 overflow-x-auto rounded-2xl border-2 border-white/50 bg-white/70 px-3 py-2 shadow-lg backdrop-blur-md md:bottom-auto md:left-4 md:top-1/2 md:max-w-none md:-translate-x-0 md:-translate-y-1/2 md:flex-col md:gap-3 md:rounded-3xl md:bg-white/40 md:py-4">
      {tabs.map((tab) => <button type="button" aria-label={tab.label} aria-pressed={active === tab.id} key={tab.id} onClick={() => navigate(tab.id)} className={`ui-jelly-btn group flex h-[50px] w-[50px] flex-shrink-0 flex-col items-center justify-center rounded-xl border-[3px] outline-none sm:h-12 sm:w-12 md:h-16 md:w-16 md:rounded-2xl md:border-4 ${tab.color} ${active === tab.id ? 'ring-4 ring-white/80' : ''}`}><span className="text-xl transition-transform group-hover:-translate-y-1 sm:text-2xl md:text-3xl">{tab.icon}</span><span className="mt-0.5 text-[7px] font-black sm:text-[8px] md:text-[10px]">{tab.short}</span></button>)}
      <div className="my-0.5 h-8 w-1 flex-shrink-0 rounded-full bg-white/50 md:my-1 md:h-1 md:w-full" />
      <button type="button" aria-label="ออกจากเกม" onClick={onLogout} className="ui-jelly-btn group flex h-[50px] w-[50px] flex-shrink-0 flex-col items-center justify-center rounded-xl border-[3px] border-rose-700 bg-rose-400 text-rose-950 outline-none sm:h-12 sm:w-12 md:h-16 md:w-16 md:rounded-2xl md:border-4"><span className="text-xl sm:text-2xl md:text-3xl">🚪</span><span className="text-[7px] font-black sm:text-[8px] md:text-[10px]">Exit</span></button>
    </nav>

    <div id="react-economy-root" className="contents">{economy}</div>
    <main className="pointer-events-none absolute bottom-24 left-2 right-2 top-24 z-10 flex items-center justify-center overflow-hidden drop-shadow-xl md:bottom-16 md:left-24 md:right-24 xl:left-32 xl:right-32"><div className="pointer-events-auto relative flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl p-2 pb-20 transition-all duration-300 md:rounded-3xl md:p-4 md:pb-4 md:pl-20">
      <div id="react-home-root" className={active === 'home' ? 'contents' : 'hidden'}>{home}</div>
      <div id="react-profile-root" className={active === 'profile' ? 'contents' : 'hidden'}>{profile}</div>
      <div id="react-map-root" className={active === 'map' ? 'contents' : 'hidden'}>{map}</div>
      <div id="react-rank-root" className={active === 'rank' ? 'contents' : 'hidden'}>{rank}</div>
      <div id="react-cert-root" className={active === 'cert' ? 'contents' : 'hidden'}>{cert}</div>
    </div></main>

    <div className="pointer-events-auto absolute bottom-4 left-1/2 z-30 w-[92%] max-w-sm -translate-x-1/2 sm:w-auto sm:max-w-none md:bottom-6"><div className="flex items-center justify-center gap-2 rounded-[30px] border-[3px] border-blue-500 bg-blue-300/80 p-2 shadow-[0_10px_20px_rgba(0,0,0,0.2)] backdrop-blur-md md:gap-4 md:rounded-[40px] md:border-4 md:p-3">
      <button type="button" aria-label="เปิดกระเป๋า" onClick={() => window.dispatchEvent(new Event('nextgen:open-inventory'))} className="ui-jelly-btn flex h-12 w-12 items-center justify-center rounded-full border-[3px] border-indigo-700 bg-indigo-400 text-xl md:h-14 md:w-14 md:border-4 md:text-2xl">🎒</button>
      <button type="button" aria-label="เริ่มการผจญภัย" onClick={() => navigate('map')} className="ui-jelly-btn flex flex-1 items-center justify-center gap-2 rounded-full border-[3px] border-green-800 bg-gradient-to-b from-green-300 to-green-500 px-6 py-2 text-xl font-black text-white shadow-[0_8px_0_#166534] active:translate-y-2 active:shadow-none sm:flex-none md:border-4 md:px-12 md:py-3 md:text-3xl">▶️ <span>เริ่มการผจญภัย</span></button>
      <button type="button" aria-label="เปิดร้านค้า" onClick={() => window.dispatchEvent(new Event('nextgen:open-shop'))} className="ui-jelly-btn flex h-12 w-12 items-center justify-center rounded-full border-[3px] border-fuchsia-700 bg-fuchsia-400 text-xl md:h-14 md:w-14 md:border-4 md:text-2xl">🎁</button>
    </div></div>
  </section>
}

const statTones = {
  amber: { frame: 'border-amber-500', badge: 'border-amber-600 bg-amber-300', text: 'text-amber-800' },
  yellow: { frame: 'border-yellow-500', badge: 'border-yellow-600 bg-yellow-300', text: 'text-yellow-800' },
  slate: { frame: 'border-slate-500', badge: 'border-slate-600 bg-slate-300', text: 'text-slate-800' },
  orange: { frame: 'border-orange-500', badge: 'border-orange-600 bg-orange-300', text: 'text-orange-800' },
  emerald: { frame: 'border-emerald-500', badge: 'border-emerald-600 bg-emerald-300', text: 'text-emerald-800' },
} as const

function Stat({ icon, value, tone, label }: { icon: string; value: string | number; tone: keyof typeof statTones; label: string }) {
  const classes = statTones[tone]
  return <div aria-label={`${label}: ${value}`} className={`flex h-10 max-w-[140px] flex-shrink-0 items-center rounded-full border-2 bg-white py-1 pl-1 pr-3 shadow sm:h-12 sm:border-4 ${classes.frame}`}><div className={`-ml-2 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border ${classes.badge} text-sm sm:h-10 sm:w-10 sm:text-xl`}>{icon}</div><div className={`ml-1 min-w-[30px] truncate text-center text-xs font-black ${classes.text} sm:min-w-[50px] sm:text-sm`}>{value}</div></div>
}
