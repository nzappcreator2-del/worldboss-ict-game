import type { CSSProperties } from 'react'
import { COSMETIC_CATALOG, cosmeticsState, type CosmeticSlot } from '../services/gameLogic'
import { COSMETIC_ICONS, characterLayerImages } from './characterAssets'
import { TEST_CHARACTER_SPRITE, spriteBackgroundPosition } from './dashboardCharacter'

// Shared paper-doll equipment screen (bag, in-lesson profile, dashboard profile):
// live layered preview + the five equip slots + the wardrobe of owned pieces.
// Equip/unequip always flows through onToggle -> firestoreApi.equipCosmeticItem.

const EQUIP_SLOT_INFO: { slot: CosmeticSlot; label: string; empty: string }[] = [
  { slot: 'hair', label: 'ทรงผม', empty: '💇' },
  { slot: 'outfit', label: 'เสื้อผ้า', empty: '👕' },
  { slot: 'hat', label: 'หมวก', empty: '🎩' },
  { slot: 'weapon', label: 'อาวุธ', empty: '⚔️' },
  { slot: 'accessory', label: 'ของตกแต่ง', empty: '💎' },
]

export function LayeredHeroPreview({ inventory, gender, size, testId = 'wardrobe-preview' }: { inventory: unknown; gender?: string; size: number; testId?: string }) {
  const style: CSSProperties = {
    width: `${size}px`,
    height: `${size}px`,
    backgroundImage: characterLayerImages(inventory, gender),
    backgroundSize: `${TEST_CHARACTER_SPRITE.columns * size}px ${TEST_CHARACTER_SPRITE.rows * size}px`,
    backgroundPosition: spriteBackgroundPosition(TEST_CHARACTER_SPRITE, 'down', 0, size),
    backgroundRepeat: 'no-repeat',
    imageRendering: 'pixelated',
  }
  return <span data-testid={testId} className="ro-equip-preview" style={style} aria-hidden="true" />
}

type Props = {
  inventory: unknown
  gender?: string
  pending?: boolean
  onToggle?(itemId: string): void
  previewSize?: number
  showWardrobe?: boolean
}

export function CharacterEquipment({ inventory, gender, pending, onToggle, previewSize = 96, showWardrobe = true }: Props) {
  const wardrobe = cosmeticsState(inventory, gender)
  const stored = wardrobe.owned
  return (
    <div className="ro-character-equipment">
      <section className="ro-equip-doll" aria-label="อุปกรณ์สวมใส่">
        <div className="ro-equip-doll-row">
          <LayeredHeroPreview inventory={inventory} gender={gender} size={previewSize} />
          <div className="ro-equip-slots">
            {EQUIP_SLOT_INFO.map(({ slot, label, empty }) => {
              const itemId = wardrobe.equipped[slot]
              const item = itemId ? COSMETIC_CATALOG[itemId] : undefined
              if (!item || !itemId || !onToggle) {
                return (
                  <span key={slot} className={`ro-equip-slot${item ? ' filled' : ' empty'}`} title={item ? item.name : `ยังไม่มี${label}`}>
                    {item && itemId ? <img src={COSMETIC_ICONS[itemId]} alt={item.name} draggable={false} /> : <i aria-hidden="true">{empty}</i>}
                    <small>{label}</small>
                  </span>
                )
              }
              return (
                <button
                  key={slot}
                  type="button"
                  aria-label={`ถอด${item.name}`}
                  title={`${item.name} · คลิกเพื่อถอด`}
                  disabled={pending}
                  onClick={() => onToggle(itemId)}
                  className="ro-equip-slot filled"
                >
                  <img src={COSMETIC_ICONS[itemId]} alt="" draggable={false} />
                  <small>{label}</small>
                </button>
              )
            })}
          </div>
        </div>
      </section>

      {showWardrobe && (
        <section className="ro-wardrobe" aria-label="ตู้เสื้อผ้า">
          <h4 className="ro-inv-section-title">🗄️ ตู้เสื้อผ้า</h4>
          {stored.length === 0
            ? <p className="ro-wardrobe-empty">ของที่ถอดเก็บจะมารออยู่ที่นี่ · หาชุดใหม่ได้ที่ร้านค้า 🏪</p>
            : (
              <div className="ro-wardrobe-grid">
                {stored.map((itemId) => {
                  const item = COSMETIC_CATALOG[itemId]
                  const isEquipped = wardrobe.equipped[item.slot] === itemId
                  return (
                    <button
                      key={itemId}
                      type="button"
                      aria-label={isEquipped ? `${item.name} (ใช้งานอยู่)` : `สวมใส่${item.name}`}
                      title={`${item.name} · ${isEquipped ? 'กำลังใช้งาน' : 'คลิกเพื่อใช้งาน'}`}
                      disabled={isEquipped || pending || !onToggle}
                      onClick={() => onToggle?.(itemId)}
                      className={`ro-wardrobe-item${isEquipped ? ' active' : ''}`}
                    >
                      <div className="ro-wardrobe-item-wrapper">
                        <img src={COSMETIC_ICONS[itemId]} alt="" draggable={false} />
                        {isEquipped && <span className="ro-equipped-badge">ใช้งานอยู่</span>}
                      </div>
                      <small>{item.name}</small>
                    </button>
                  )
                })}
              </div>
            )}
        </section>
      )}
    </div>
  )
}
