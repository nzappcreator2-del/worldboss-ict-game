import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { HERO_STAT_KEYS, heroCombatProfile, remainingStatPoints, sanitizeHeroStats, type HeroStatKey } from '../services/heroStats'
import { levelProgress } from '../services/levelSystem'
import { LESSON_PLAYER_BASE_DAMAGE } from './lessonCombatLogic'
import { characterLayerImages } from './characterAssets'
import { CharacterEquipment } from './CharacterEquipment'
import { TEST_CHARACTER_SPRITE, spriteBackgroundPosition } from './dashboardCharacter'

// THE hero profile — one game-styled window shared by every surface. It mounts
// at <body> level (App overlay root), so the dashboard portrait, the lesson HUD
// portrait, and anything else can open the exact same screen with
// `nextgen:open-hero-profile`. Closing fires `nextgen:hero-profile-closed` so a
// paused lesson knows to resume.

export type HeroProfileInventory = { potion?: number; magnifier?: number; stats?: unknown; cosmetics?: unknown }
export type HeroProfileUser = {
  id: string
  name?: string
  avatar?: string
  gender?: string
  xp?: number
  coins?: number
  level?: number
  rank?: string
  inventory?: HeroProfileInventory
}

export type HeroProfileService = {
  getCurrentUser(): HeroProfileUser | null
  allocateStat?(userId: string, key: HeroStatKey): Promise<{ success: boolean; inventory?: HeroProfileInventory; remaining?: number; error?: string }>
  equipCosmetic?(userId: string, itemId: string): Promise<{ success: boolean; equipped?: boolean; inventory?: HeroProfileInventory; error?: string }>
}

type Props = {
  service: HeroProfileService
  onUserUpdate?(update: { inventory: HeroProfileInventory }): void
}

const STAT_LABELS: Record<HeroStatKey, { name: string; effect: string }> = {
  str: { name: 'STR พลังโจมตี', effect: '+2 ATK ต่อแต้ม' },
  vit: { name: 'VIT พลังชีวิต', effect: '+6 HP สูงสุดต่อแต้ม' },
  dex: { name: 'DEX ความแม่นยำ', effect: 'ดาเมจนิ่งขึ้นต่อแต้ม' },
  luk: { name: 'LUK คริติคอล', effect: 'ติดคริง่ายขึ้นต่อแต้ม' },
}

export function HeroProfile({ service, onUserUpdate }: Props) {
  const [user, setUser] = useState<HeroProfileUser | null>(null)
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState('')

  const close = useCallback(() => {
    setUser(null)
    window.dispatchEvent(new Event('nextgen:hero-profile-closed'))
  }, [])

  useEffect(() => {
    const open = () => {
      const current = service.getCurrentUser()
      if (!current) return
      setNotice('')
      setUser({ ...current })
    }
    window.addEventListener('nextgen:open-hero-profile', open)
    return () => window.removeEventListener('nextgen:open-hero-profile', open)
  }, [service])

  useEffect(() => {
    if (!user) return
    const sync = () => {
      const fresh = service.getCurrentUser()
      if (fresh) setUser({ ...fresh })
    }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') close() }
    window.addEventListener('nextgen:user-updated', sync)
    window.addEventListener('keydown', escape)
    return () => {
      window.removeEventListener('nextgen:user-updated', sync)
      window.removeEventListener('keydown', escape)
    }
  }, [close, service, user])

  const mutate = async (action: 'stat' | 'equip', key: string) => {
    if (!user || pending) return
    setPending(true)
    setNotice('')
    try {
      const result = action === 'stat'
        ? await service.allocateStat?.(user.id, key as HeroStatKey)
        : await service.equipCosmetic?.(user.id, key)
      if (!result?.success || !result.inventory) {
        setNotice(result?.error || 'บันทึกไม่สำเร็จ กรุณาลองใหม่')
        return
      }
      setUser((current) => current ? { ...current, inventory: result.inventory } : current)
      onUserUpdate?.({ inventory: result.inventory })
    } catch {
      setNotice('บันทึกไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ต')
    } finally {
      setPending(false)
    }
  }

  if (!user) return null

  const xpProgress = levelProgress(user.xp)
  const heroStats = sanitizeHeroStats(user.inventory?.stats)
  const statPointsLeft = remainingStatPoints({ level: xpProgress.level, inventory: user.inventory })
  const combat = heroCombatProfile(user.inventory?.stats)
  const portraitStyle: CSSProperties = {
    width: '72px',
    height: '72px',
    backgroundImage: characterLayerImages(user.inventory, user.gender),
    backgroundRepeat: 'no-repeat',
    backgroundSize: `${TEST_CHARACTER_SPRITE.columns * 72}px ${TEST_CHARACTER_SPRITE.rows * 72}px`,
    backgroundPosition: spriteBackgroundPosition(TEST_CHARACTER_SPRITE, 'down', 0, 72),
    imageRendering: 'pixelated',
  }

  return createPortal(
    <div className="lesson-modal-backdrop" role="dialog" aria-modal="true" aria-label="โปรไฟล์ตัวละคร" onMouseDown={(event) => { if (event.target === event.currentTarget) close() }}>
      <article className="lesson-char-panel" data-testid="hero-profile-panel">
        <button type="button" className="lesson-modal-close" aria-label="ปิดโปรไฟล์" onClick={close}>×</button>
        <div className="lesson-char-head">
          <span className="lesson-char-portrait" aria-hidden="true"><i style={portraitStyle} /></span>
          <div className="lesson-char-identity">
            <h3>{user.name || 'ผู้กล้า'} Lv.{xpProgress.level}</h3>
            <p>{user.rank || 'BRONZE'} · 🪙 {user.coins ?? 0} เหรียญ</p>
            <span className="lesson-bar lesson-bar-xp"><i style={{ width: `${xpProgress.percent}%` }} /><em>EXP {xpProgress.intoLevel}/{xpProgress.requiredXp || 'MAX'}</em></span>
          </div>
        </div>
        <div className="lesson-char-readout">
          <span>❤️ HP สูงสุด {combat.maxHp}</span>
          <span>⚔️ ATK {LESSON_PLAYER_BASE_DAMAGE + combat.bonusAttack}</span>
          <span>🧪 ยา x{Number(user.inventory?.potion) || 0}</span>
        </div>
        <div className="lesson-char-stats">
          <b>แต้มสเตตัสคงเหลือ: {statPointsLeft}</b>
          {notice && <em className="lesson-char-notice">{notice}</em>}
          {HERO_STAT_KEYS.map((key) => (
            <div key={key} className="lesson-char-stat-row">
              <span>{STAT_LABELS[key].name}</span>
              <small>{STAT_LABELS[key].effect}</small>
              <strong>{heroStats[key]}</strong>
              <button
                type="button"
                aria-label={`เพิ่มแต้ม ${key.toUpperCase()}`}
                disabled={pending || statPointsLeft <= 0 || !service.allocateStat}
                onClick={() => void mutate('stat', key)}
              >+</button>
            </div>
          ))}
        </div>
        <div className="lesson-char-equip" data-testid="hero-profile-equipment">
          <b>ชุดสวมใส่</b>
          <CharacterEquipment
            inventory={user.inventory}
            gender={user.gender}
            pending={pending}
            onToggle={undefined}
            showWardrobe={false}
            previewSize={72}
          />
        </div>
        <small className="lesson-char-hint">เลเวลอัพได้จากการตีมอนสเตอร์ ทำใบงาน และปราบบอส · แต้มสเตตัส +3 ทุกเลเวล · ซื้อชุดได้ที่ร้านค้า</small>
      </article>
    </div>,
    document.body,
  )
}
