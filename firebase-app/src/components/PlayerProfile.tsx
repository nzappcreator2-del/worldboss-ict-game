import { useCallback, useEffect, useState } from 'react'

type Inventory = { potion?: number; magnifier?: number; badges?: string[] }
type ProfileStats = { totalScore: number; completedLessons: number; totalLessons: number; completionRate: number }

export type ProfileData = {
  id: string
  name: string
  class: string
  avatar?: string
  level: number
  xp: number
  rank: string
  coins: number
  streak?: number
  lastLogin?: unknown
  inventory?: Inventory
  stats?: ProfileStats
}

export type ProfileResult = { success: boolean; profile?: ProfileData; error?: string }
export type ProfileService = {
  getCurrentUser(): { id: string } | null
  loadProfile(userId: string): Promise<ProfileResult>
}

const badgeDefinitions: Record<string, { icon: string; title: string; description: string }> = {
  badge_perfect: { icon: '🌟', title: 'ปัญญาชน', description: 'ทำคะแนนทดสอบได้เต็ม' },
  badge_streak_7: { icon: '🔥', title: 'ผู้ไม่ย่อท้อ', description: 'เข้าเรียนต่อเนื่อง 7 วัน' },
  badge_lvl_5: { icon: '🛡️', title: 'นักสำรวจ', description: 'อัปเลเวลถึงระดับ 5' },
  badge_lvl_10: { icon: '⚔️', title: 'นักรบชั้นยอด', description: 'อัปเลเวลถึงระดับ 10' },
  badge_lvl_20: { icon: '👑', title: 'ปรมาจารย์', description: 'อัปเลเวลถึงระดับ 20' },
  badge_cert: { icon: '🎓', title: 'บัณฑิตน้อย', description: 'ผ่านด่านทั้งหมดสำเร็จ' },
}

export function PlayerProfile({ service }: { service: ProfileService }) {
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')

  const load = useCallback(async () => {
    const current = service.getCurrentUser()
    if (!current) return
    setStatus('loading')
    try {
      const result = await service.loadProfile(current.id)
      if (!result.success || !result.profile) throw new Error(result.error || 'load failed')
      setProfile(result.profile)
      setStatus('ready')
    } catch {
      setStatus('error')
    }
  }, [service])

  useEffect(() => {
    window.addEventListener('nextgen:open-profile', load)
    return () => window.removeEventListener('nextgen:open-profile', load)
  }, [load])

  return (
    <div id="dash-tab-profile" className="flex flex-1 flex-col w-full h-full animate-fade-in relative z-10 md:p-4 overflow-y-auto overflow-x-hidden pb-32">
      {status === 'idle' && <div className="flex items-center justify-center h-64 text-indigo-600 font-bold">เปิด Profile เพื่อดูข้อมูลผู้กล้า</div>}
      {status === 'loading' && <div className="flex flex-col items-center justify-center h-64"><div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" /><span className="text-indigo-600 font-bold mt-3">กำลังเปิดข้อมูลผู้กล้า...</span></div>}
      {status === 'error' && <div className="flex flex-col items-center justify-center h-64 text-center"><div className="text-4xl mb-2">⚠️</div><p className="text-red-600 font-bold">โหลดโปรไฟล์ไม่สำเร็จ</p><button type="button" onClick={load} className="mt-4 px-5 py-2 bg-indigo-600 text-white rounded-xl font-bold">ลองใหม่</button></div>}
      {status === 'ready' && profile && <ProfileContent profile={profile} />}
    </div>
  )
}

function ProfileContent({ profile }: { profile: ProfileData }) {
  const stats = profile.stats || { totalScore: 0, completedLessons: 0, totalLessons: 0, completionRate: 0 }
  const inventory = profile.inventory || {}
  const badges = Array.isArray(inventory.badges) ? inventory.badges.map(String) : []
  const lessonBadgeCount = badges.filter((badge) => badge.startsWith('badge_lesson_')).length
  const normalBadges = [...new Set(badges.filter((badge) => !badge.startsWith('badge_lesson_')))]
  const hasCertificate = badges.includes('badge_cert')
  const completion = Math.min(100, Number(stats.completionRate) || 0)

  return <>
    <section className="flex flex-col md:flex-row gap-6 mb-8 items-center md:items-end animate-slide-up">
      <div className="relative">
        <div className={`relative w-32 h-32 md:w-40 md:h-40 rounded-full border-[5px] flex items-center justify-center text-7xl md:text-8xl p-4 ${hasCertificate ? 'border-yellow-300 ring-8 ring-yellow-400/50 bg-yellow-50' : 'border-white shadow-xl bg-white'}`}>{profile.avatar || '👤'}</div>
        <div className={`absolute -bottom-2 -right-2 w-12 h-12 rounded-full border-4 border-white flex items-center justify-center font-black text-lg shadow-lg ${hasCertificate ? 'bg-yellow-500 text-amber-950' : 'bg-indigo-600 text-white'}`}>{profile.level || 1}</div>
      </div>
      <div className="flex-1 text-center md:text-left">
        <h2 aria-label={profile.name} className="text-3xl md:text-5xl font-black text-gray-800 uppercase flex justify-center md:justify-start items-center gap-2">{profile.name}{hasCertificate && <span title="บัณฑิตน้อย">🎓</span>}</h2>
        <div className="flex flex-wrap justify-center md:justify-start gap-2 mt-2"><span className="bg-indigo-50 px-3 py-1 rounded-full text-sm font-bold">🛡️ ชั้นเรียน {profile.class || '-'}</span><span className="bg-indigo-600 px-3 py-1 rounded-full text-sm font-bold text-white">⚔️ {profile.rank || 'BRONZE'}</span></div>
        <div className="w-full max-w-md mx-auto md:mx-0 mt-4"><div className="flex justify-between text-xs font-bold text-indigo-600"><span>ความก้าวหน้า XP</span><span>{Number(profile.xp || 0).toLocaleString()} XP</span></div><div className="h-5 bg-white/80 rounded-full border-2 border-indigo-100 p-0.5"><div className="h-full bg-gradient-to-r from-indigo-400 to-indigo-600 rounded-full" style={{ width: `${Number(profile.xp || 0) % 100}%` }} /></div></div>
      </div>
    </section>

    <section aria-label="สถิติผู้เล่น" className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-5">
      <StatCard icon="🔥" value={stats.totalScore} label="คะแนนรวม" color="amber" />
      <StatCard icon="📚" value={`${stats.completedLessons} / ${stats.totalLessons}`} label="ด่านที่ผ่าน" color="emerald" />
      <StatCard icon="📈" value={`${completion}%`} label="ความสำเร็จ" color="indigo" />
      <StatCard icon="💰" value={profile.coins || 0} label="เหรียญทอง" color="yellow" />
    </section>

    <section className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-5">
      <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-[2.5rem] p-8 text-white shadow-2xl flex flex-col items-center justify-center"><h3 className="text-xs font-bold opacity-80 mb-4 uppercase tracking-widest">ความสำเร็จในภารกิจ</h3><div className="w-36 h-36 rounded-full border-[14px] border-white/20 flex items-center justify-center text-4xl font-black shadow-inner">{completion}%</div></div>
      <div className="md:col-span-2 bg-white/95 rounded-[2.5rem] p-8 border-2 border-indigo-100 shadow-xl">
        <h3 className="text-indigo-950 font-black mb-5 text-lg">🎒 ไอเทมปัจจุบัน</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><ItemCard icon="🧪" name="Health Potion" count={Number(inventory.potion) || 0} unit="ขวด" /><ItemCard icon="🔍" name="Magnifier Tool" count={Number(inventory.magnifier) || 0} unit="ชิ้น" /></div>
        <div className="mt-6 pt-5 border-t border-indigo-100 flex justify-between text-sm"><span className="font-bold text-indigo-600">เข้าใช้งานล่าสุด</span><span className="font-black text-indigo-950">{formatDate(profile.lastLogin)}</span></div>
      </div>
      <div className="md:col-span-3 bg-white/95 rounded-[2.5rem] p-8 border-2 border-amber-100 shadow-xl">
        <h3 className="text-amber-950 font-black mb-6 text-xl">🏆 คลังเหรียญตราความสำเร็จ</h3>
        {normalBadges.length === 0 && lessonBadgeCount === 0
          ? <div className="text-center p-8 bg-gray-50 border-2 border-dashed border-gray-200 rounded-3xl text-gray-400 font-bold">ยังไม่มีเหรียญตรา</div>
          : <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {normalBadges.map((badge) => <BadgeCard key={badge} badge={badgeDefinitions[badge] || { icon: '✨', title: 'เหรียญปริศนา', description: 'ความสำเร็จพิเศษ' }} />)}
            {lessonBadgeCount > 0 && <BadgeCard badge={{ icon: '🏅', title: 'ผู้พิชิต', description: `ผ่านการทดสอบ ${lessonBadgeCount} ด่าน` }} count={lessonBadgeCount} />}
          </div>}
      </div>
    </section>
    <div className="h-12" />
  </>
}

function StatCard({ icon, value, label, color }: { icon: string; value: string | number; label: string; color: string }) {
  return <div className={`bg-white/95 p-4 md:p-6 rounded-[2rem] border-2 border-${color}-200 shadow-lg flex flex-col items-center text-center`}><div className="text-3xl md:text-4xl mb-2">{icon}</div><div className={`text-2xl md:text-3xl font-black text-${color}-600`}>{value}</div><div className={`text-[10px] md:text-xs font-bold text-${color}-500 uppercase mt-1`}>{label}</div></div>
}

function ItemCard({ icon, name, count, unit }: { icon: string; name: string; count: number; unit: string }) {
  return <div className="bg-indigo-50/50 p-5 rounded-3xl border border-indigo-100 flex items-center gap-4"><div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center text-3xl shadow-sm">{icon}</div><div><div className="text-[10px] text-indigo-400 font-bold uppercase">{name}</div><div className="text-xl font-black text-indigo-950">{count} <span className="text-sm text-gray-500">{unit}</span></div></div></div>
}

function BadgeCard({ badge, count }: { badge: { icon: string; title: string; description: string }; count?: number }) {
  return <article className="relative bg-gradient-to-b from-white to-amber-50 p-4 rounded-3xl border border-amber-200 text-center shadow-md">{count && count > 1 ? <span className="absolute top-2 right-2 bg-amber-500 text-white text-[10px] font-black px-2 py-0.5 rounded-md">x{count}</span> : null}<div className="w-16 h-16 mx-auto bg-gradient-to-br from-amber-100 to-amber-300 rounded-full flex items-center justify-center text-3xl mb-3">{badge.icon}</div><h4 className="font-black text-amber-900 text-sm">{badge.title}</h4><p className="text-[10px] text-amber-800 mt-1">{badge.description}</p></article>
}

function formatDate(value: unknown) {
  if (!value) return 'ไม่ระบุ'
  try {
    const candidate = typeof value === 'object' && value && 'toDate' in value ? (value as { toDate(): Date }).toDate() : new Date(String(value))
    if (Number.isNaN(candidate.getTime())) return String(value)
    return candidate.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' })
  } catch {
    return String(value)
  }
}
