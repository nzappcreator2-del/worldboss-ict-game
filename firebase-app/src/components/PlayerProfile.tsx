import { useCallback, useEffect, useState } from 'react'
import {
  HERO_STAT_KEYS,
  heroCombatProfile,
  remainingStatPoints,
  sanitizeHeroStats,
  type HeroStatKey,
} from '../services/heroStats'
import { levelProgress } from '../services/levelSystem'
import { CharacterEquipment } from './CharacterEquipment'
import profileCommandRoom from '../assets/generated/profile-command-room.jpg'

type Inventory = { potion?: number; magnifier?: number; badges?: string[]; stats?: Record<string, number> }
type ProfileStats = { totalScore: number; completedLessons: number; totalLessons: number; completionRate: number }

export type ProfileData = {
  id: string
  name: string
  class: string
  avatar?: string
  gender?: string
  level: number
  xp: number
  rank: string
  coins: number
  streak?: number
  lastLogin?: unknown
  inventory?: Inventory
  stats?: ProfileStats
}

export type StatAllocationResult = { success: boolean; inventory?: Inventory; remaining?: number; error?: string }
export type ProfileResult = { success: boolean; profile?: ProfileData; error?: string }
export type ProfileService = {
  getCurrentUser(): { id: string } | null
  loadProfile(userId: string): Promise<ProfileResult>
  allocateStat?(userId: string, key: HeroStatKey): Promise<StatAllocationResult>
  equipCosmetic?(userId: string, itemId: string): Promise<{ success: boolean; equipped?: boolean; inventory?: Inventory; error?: string }>
}

const STAT_LABELS: Record<HeroStatKey, { title: string; effect: string }> = {
  str: { title: 'STR', effect: '+2 ATK ต่อแต้ม' },
  vit: { title: 'VIT', effect: '+6 HP สูงสุด ต่อแต้ม' },
  dex: { title: 'DEX', effect: 'ยกพื้นความแรงขั้นต่ำ' },
  luk: { title: 'LUK', effect: '+0.5% โอกาสคริ ต่อแต้ม' },
}

const badgeDefinitions: Record<string, { icon: string; title: string; description: string }> = {
  badge_perfect: { icon: '🌟', title: 'ปัญญาชน', description: 'ทำคะแนนทดสอบได้เต็ม' },
  badge_streak_7: { icon: '🔥', title: 'ผู้ไม่ย่อท้อ', description: 'เข้าเรียนต่อเนื่อง 7 วัน' },
  badge_lvl_5: { icon: '🛡️', title: 'นักสำรวจ', description: 'อัปเลเวลถึงระดับ 5' },
  badge_lvl_10: { icon: '⚔️', title: 'นักรบชั้นยอด', description: 'อัปเลเวลถึงระดับ 10' },
  badge_lvl_20: { icon: '👑', title: 'ปรมาจารย์', description: 'อัปเลเวลถึงระดับ 20' },
  badge_cert: { icon: '🎓', title: 'บัณฑิตน้อย', description: 'ผ่านด่านทั้งหมดสำเร็จ' },
}

export function PlayerProfile({ service, onUserUpdate, onClose }: { service: ProfileService; onUserUpdate?(update: { inventory: Inventory }): void; onClose?(): void }) {
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

  const applyStatAllocation = useCallback((inventory: Inventory) => {
    setProfile((current) => current ? { ...current, inventory } : current)
    onUserUpdate?.({ inventory })
  }, [onUserUpdate])

  return (
    <div id="dash-tab-profile" className="ro-profile-page">
      <header className="ro-profile-command-header">
        <img src={profileCommandRoom} alt="" draggable={false} />
        <div className="ro-profile-command-copy">
          <span>HERO COMMAND</span>
          <h1>สมุดบันทึกผู้กล้า</h1>
          <p>พัฒนาสเตตัส ตรวจสอบอุปกรณ์ และติดตามเส้นทางแห่งความรู้</p>
        </div>
        <button type="button" className="feature-close-button" aria-label="ปิดหน้าโปรไฟล์" onClick={() => onClose?.()}><span aria-hidden="true">×</span><b>ปิด</b></button>
      </header>
      {status === 'idle' && <div className="ro-profile-status-screen">เปิด Profile เพื่อดูข้อมูลผู้กล้า</div>}
      {status === 'loading' && (
        <div className="ro-profile-status-screen">
          <div className="ro-profile-spinner" aria-hidden="true" />
          <span>กำลังเปิดข้อมูลผู้กล้า...</span>
        </div>
      )}
      {status === 'error' && (
        <div className="ro-profile-status-screen ro-profile-status-error">
          <div className="ro-profile-status-icon" aria-hidden="true">⚠️</div>
          <p>โหลดโปรไฟล์ไม่สำเร็จ</p>
          <button type="button" onClick={load} className="ro-profile-retry-btn">ลองใหม่</button>
        </div>
      )}
      {status === 'ready' && profile && <ProfileContent profile={profile} service={service} onStatAllocated={applyStatAllocation} />}
    </div>
  )
}

function StatusWindow({ profile, service, onStatAllocated }: { profile: ProfileData; service: ProfileService; onStatAllocated(inventory: Inventory): void }) {
  const [pendingKey, setPendingKey] = useState<HeroStatKey | null>(null)
  const [error, setError] = useState('')
  const stats = sanitizeHeroStats(profile.inventory?.stats)
  const remaining = remainingStatPoints(profile)
  const combat = heroCombatProfile(profile.inventory?.stats)

  const allocate = async (key: HeroStatKey) => {
    if (!service.allocateStat || pendingKey || remaining <= 0) return
    setPendingKey(key)
    setError('')
    try {
      const result = await service.allocateStat(profile.id, key)
      if (!result.success || !result.inventory) {
        setError(result.error || 'อัปสเตตัสไม่สำเร็จ')
        return
      }
      onStatAllocated(result.inventory)
    } catch {
      setError('การเชื่อมต่อล้มเหลว')
    } finally {
      setPendingKey(null)
    }
  }

  return (
    <div className="ro-profile-panel ro-profile-status-panel">
      <div className="ro-profile-panel-header">
        <h3>📜 หน้าต่างสเตตัส</h3>
        <span className="ro-profile-points-chip">แต้มคงเหลือ {remaining}</span>
      </div>
      {error && <p role="alert" className="ro-profile-error-text">{error}</p>}
      <div className="ro-profile-status-grid">
        {HERO_STAT_KEYS.map((key) => (
          <div key={key} className="ro-profile-status-row">
            <div className="ro-profile-status-info">
              <div className="ro-profile-status-title">{STAT_LABELS[key].title} <span className="ro-profile-status-value">{stats[key]}</span></div>
              <div className="ro-profile-status-effect">{STAT_LABELS[key].effect}</div>
            </div>
            <button
              type="button"
              aria-label={`เพิ่ม ${STAT_LABELS[key].title}`}
              disabled={!service.allocateStat || pendingKey !== null || remaining <= 0}
              onClick={() => void allocate(key)}
              className="ro-profile-stat-btn"
            >+</button>
          </div>
        ))}
      </div>
      <div className="ro-profile-effect-row">
        <span className="ro-profile-effect-chip">❤️ HP สูงสุด {combat.maxHp}</span>
        <span className="ro-profile-effect-chip">⚔️ พลังโจมตี +{combat.bonusAttack}</span>
        <span className="ro-profile-effect-chip">🎯 คริ {(100 - combat.critThreshold * 100).toFixed(1)}%</span>
        <span className="ro-profile-effect-chip">🌀 ดาเมจขั้นต่ำ +{combat.varianceFloor}</span>
      </div>
    </div>
  )
}

// "ตู้เสื้อผ้าผู้กล้า" — the same paper-doll equipment screen used by the bag and
// the in-lesson profile, so the hero can be dressed from any of them.
function WardrobePanel({ profile }: { profile: ProfileData }) {
  return (
    <div className="ro-profile-panel ro-profile-wardrobe-panel" data-testid="profile-wardrobe">
      <h3>🧍 อุปกรณ์สวมใส่</h3>
      <CharacterEquipment
        inventory={profile.inventory}
        gender={profile.gender}
        pending={false}
        onToggle={undefined}
        showWardrobe={false}
        previewSize={96}
      />
    </div>
  )
}

function ProfileContent({ profile, service, onStatAllocated }: { profile: ProfileData; service: ProfileService; onStatAllocated(inventory: Inventory): void }) {
  const stats = profile.stats || { totalScore: 0, completedLessons: 0, totalLessons: 0, completionRate: 0 }
  const inventory = profile.inventory || {}
  const badges = Array.isArray(inventory.badges) ? inventory.badges.map(String) : []
  const lessonBadgeCount = badges.filter((badge) => badge.startsWith('badge_lesson_')).length
  const normalBadges = [...new Set(badges.filter((badge) => !badge.startsWith('badge_lesson_')))]
  const hasCertificate = badges.includes('badge_cert')
  const completion = Math.min(100, Number(stats.completionRate) || 0)

  return <>
    <section className="ro-profile-header">
      <div className="ro-profile-avatar-wrap">
        <div className={`ro-profile-avatar${hasCertificate ? ' ro-profile-avatar-cert' : ''}`}>{profile.avatar || '👤'}</div>
        <div className="ro-profile-level-badge">{profile.level || 1}</div>
      </div>
      <div className="ro-profile-identity">
        <h2 aria-label={profile.name} className="ro-profile-name">{profile.name}{hasCertificate && <span title="บัณฑิตน้อย">🎓</span>}</h2>
        <div className="ro-profile-chip-row">
          <span className="ro-profile-chip">🛡️ ชั้นเรียน {profile.class || '-'}</span>
          <span className="ro-profile-chip ro-profile-chip-rank">⚔️ {profile.rank || 'BRONZE'}</span>
        </div>
        <div className="ro-profile-xp-wrap">
          <div className="ro-profile-xp-bar-wrap">
            <div className="ro-profile-xp-label"><span>ความก้าวหน้า XP</span><span>{Number(profile.xp || 0).toLocaleString()} XP</span></div>
            <div className="ro-profile-xp-bar"><i style={{ width: `${levelProgress(profile.xp).percent}%` }} /></div>
          </div>
        </div>
      </div>
    </section>

    <section aria-label="สถิติผู้เล่น" className="ro-profile-stat-row">
      <StatCard icon="🔥" value={stats.totalScore} label="คะแนนรวม" color="amber" />
      <StatCard icon="📚" value={`${stats.completedLessons} / ${stats.totalLessons}`} label="ด่านที่ผ่าน" color="emerald" />
      <StatCard icon="📈" value={`${completion}%`} label="ความสำเร็จ" color="indigo" />
      <StatCard icon="💰" value={profile.coins || 0} label="เหรียญทอง" color="yellow" />
    </section>

    <section className="ro-profile-content-grid">
      <div className="ro-profile-panel ro-profile-mission-panel">
        <h3>ความสำเร็จในภารกิจ</h3>
        <div className="ro-profile-mission-ring">{completion}%</div>
      </div>
      <div className="ro-profile-panel ro-profile-items-panel">
        <h3>🎒 ไอเทมปัจจุบัน</h3>
        <div className="ro-profile-item-grid">
          <ItemCard icon="🧪" name="Health Potion" count={Number(inventory.potion) || 0} unit="ขวด" />
          <ItemCard icon="🔍" name="Magnifier Tool" count={Number(inventory.magnifier) || 0} unit="ชิ้น" />
        </div>
        <div className="ro-profile-last-login"><span>เข้าใช้งานล่าสุด</span><span>{formatDate(profile.lastLogin)}</span></div>
      </div>
      <StatusWindow profile={profile} service={service} onStatAllocated={onStatAllocated} />
      <WardrobePanel profile={profile} />
      <div className="ro-profile-panel ro-profile-badge-panel">
        <h3>🏆 คลังเหรียญตราความสำเร็จ</h3>
        {normalBadges.length === 0 && lessonBadgeCount === 0
          ? <div className="ro-profile-empty-state">ยังไม่มีเหรียญตรา</div>
          : <div className="ro-profile-badge-case">
            {normalBadges.map((badge) => <BadgeCard key={badge} badge={badgeDefinitions[badge] || { icon: '✨', title: 'เหรียญปริศนา', description: 'ความสำเร็จพิเศษ' }} />)}
            {lessonBadgeCount > 0 && <BadgeCard badge={{ icon: '🏅', title: 'ผู้พิชิต', description: `ผ่านการทดสอบ ${lessonBadgeCount} ด่าน` }} count={lessonBadgeCount} />}
          </div>}
      </div>
    </section>
  </>
}

function StatCard({ icon, value, label, color }: { icon: string; value: string | number; label: string; color: string }) {
  return (
    <div className="ro-profile-stat-plate" data-tone={color}>
      <span className="ro-profile-stat-icon" aria-hidden="true">{icon}</span>
      <span className="ro-profile-stat-value">{value}</span>
      <span className="ro-profile-stat-label">{label}</span>
    </div>
  )
}

function ItemCard({ icon, name, count, unit }: { icon: string; name: string; count: number; unit: string }) {
  return (
    <div className="ro-profile-item-slot">
      <span className="ro-profile-item-icon" aria-hidden="true">{icon}</span>
      <div className="ro-profile-item-info">
        <div className="ro-profile-item-name">{name}</div>
        <div className="ro-profile-item-count">{count} <span>{unit}</span></div>
      </div>
    </div>
  )
}

function BadgeCard({ badge, count }: { badge: { icon: string; title: string; description: string }; count?: number }) {
  return (
    <article className="ro-profile-badge-medal">
      {count && count > 1 ? <span className="ro-profile-badge-count">x{count}</span> : null}
      <div className="ro-profile-badge-icon" aria-hidden="true">{badge.icon}</div>
      <h4>{badge.title}</h4>
      <p>{badge.description}</p>
    </article>
  )
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
