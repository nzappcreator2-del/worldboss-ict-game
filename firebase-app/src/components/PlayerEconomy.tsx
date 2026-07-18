import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { COSMETIC_CATALOG, cosmeticsState } from '../services/gameLogic'
import { COSMETIC_ICONS } from './characterAssets'
import { CharacterEquipment, LayeredHeroPreview } from './CharacterEquipment'

export type EconomyInventory = { potion?: number; magnifier?: number; [key: string]: unknown }
export type EconomyUser = { id: string; coins: number; avatar?: string; gender?: string; inventory?: EconomyInventory }
type PurchaseResult = { success: boolean; coins?: number; inventory?: EconomyInventory; error?: string }
type GachaResult = { success: boolean; coins?: number; avatar?: string; rarity?: string; error?: string }
type EquipResult = { success: boolean; equipped?: boolean; inventory?: EconomyInventory; error?: string }

export type EconomyService = {
  getCurrentUser(): EconomyUser | null
  buyItem(userId: string, itemId: 'potion' | 'magnifier'): Promise<PurchaseResult>
  gacha(userId: string): Promise<GachaResult>
  buyCosmetic?(userId: string, itemId: string): Promise<PurchaseResult>
  equipCosmetic?(userId: string, itemId: string): Promise<EquipResult>
}

type Props = {
  service: EconomyService
  onUserUpdate(user: Partial<EconomyUser>): void
}

const itemDetails = {
  potion: { name: 'ยาเติมเลือด HP', emoji: '🧪', cost: 100, description: 'ฟื้นฟู HP 30% ตอนสู้บอส', color: 'red' },
  magnifier: { name: 'แว่นขยายตัดชอยส์', emoji: '🔍', cost: 150, description: 'สุ่มตัดตัวเลือกที่ผิด 1 ข้อ', color: 'blue' },
} as const

// Real-game shop shelving: each tab groups one category, with room for future stock.
type ShopTabId = 'consumable' | 'hair' | 'outfit' | 'hat' | 'weapon' | 'accessory' | 'special'
const SHOP_TABS: { id: ShopTabId; label: string; icon: string }[] = [
  { id: 'consumable', label: 'ของใช้', icon: '🧪' },
  { id: 'hair', label: 'ทรงผม', icon: '💇' },
  { id: 'outfit', label: 'เสื้อผ้า', icon: '👕' },
  { id: 'hat', label: 'หมวก', icon: '🎩' },
  { id: 'weapon', label: 'อาวุธ', icon: '⚔️' },
  { id: 'accessory', label: 'ของตกแต่ง', icon: '💎' },
  { id: 'special', label: 'พิเศษ', icon: '✨' },
]
// Hats/weapons/accessories layer on top of the body and fit any base, so they
// stay shared across genders. hair/outfit art is composed against one LPC
// body (see characterAssets CREDITS.md); until true male-cut/female-cut art
// exists everything is tagged 'unisex' so nothing is hidden today, but the
// filter below is gender-aware so newly tagged 'male'/'female' items will
// automatically split into the right student's shelf.
const cosmeticsForTab = (tab: ShopTabId, gender?: string) => Object.values(COSMETIC_CATALOG)
  .filter((item) => item.slot === tab && item.price > 0)
  .filter((item) => item.gender === 'unisex' || item.gender === gender)
  .sort((a, b) => a.price - b.price)

// Price-derived rarity tier — purely a shop presentation layer (colored
// border/glow + Thai label) so the expanded 15-item categories still read at
// a glance, RPG-loot-table style, without needing per-item rarity data entry.
type ItemRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'
function rarityForPrice(price: number): ItemRarity {
  if (price <= 200) return 'common'
  if (price <= 350) return 'uncommon'
  if (price <= 550) return 'rare'
  if (price <= 750) return 'epic'
  return 'legendary'
}
const RARITY_LABEL: Record<ItemRarity, string> = {
  common: 'ทั่วไป',
  uncommon: 'ไม่ธรรมดา',
  rare: 'หายาก',
  epic: 'เอปิก',
  legendary: 'ตำนาน',
}

// The economy windows live under #page-dashboard, which the legacy router hides
// (display:none) while a lesson page is open — portal them to <body> so the one
// shared bag/shop works from every page, including inside lesson maps.
function BodyPortal({ children }: { children: ReactNode }) {
  return createPortal(children, document.body)
}

// "ลองชุด" preview: current outfit with one catalog item force-equipped on top.
function tryOnInventory(rawInventory: EconomyInventory | undefined, itemId: string, gender?: string): EconomyInventory {
  const item = COSMETIC_CATALOG[itemId]
  const current = cosmeticsState(rawInventory, gender)
  if (!item) return rawInventory || {}
  return {
    ...(rawInventory || {}),
    cosmetics: {
      owned: [...current.owned, itemId],
      equipped: { ...current.equipped, [item.slot]: itemId },
    },
  }
}

// A classic RO storage row shows a fixed grid; unused slots stay visible but empty.
const RO_INVENTORY_SLOT_COUNT = 8

export function PlayerEconomy({ service, onUserUpdate }: Props) {
  const [user, setUser] = useState<EconomyUser | null>(() => service.getCurrentUser())
  const [mode, setMode] = useState<'shop' | 'inventory' | null>(null)
  const [shopTab, setShopTab] = useState<ShopTabId>('consumable')
  const [bagTab, setBagTab] = useState<'equip' | 'items'>('equip')
  const [previewItemId, setPreviewItemId] = useState<string | null>(null)
  const [showFloating, setShowFloating] = useState(false)
  const [pending, setPending] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [gachaResult, setGachaResult] = useState<{ avatar: string; rarity: string } | null>(null)
  const previousMode = useRef<'shop' | 'inventory' | null>(null)

  const open = useCallback((nextMode: 'shop' | 'inventory') => {
    const current = service.getCurrentUser()
    if (!current) {
      setNotice({ kind: 'error', text: 'กรุณาล็อกอินก่อน' })
      return
    }
    setUser({ ...current, inventory: { ...(current.inventory || {}) } })
    setNotice(null)
    setPreviewItemId(null)
    if (nextMode === 'shop') setShopTab('consumable')
    if (nextMode === 'inventory') setBagTab('equip')
    setMode(nextMode)
  }, [service])

  // Tell interested pages (the lesson pauses while the bag covers it) when the
  // bag window actually closes, regardless of which close path was used.
  useEffect(() => {
    if (previousMode.current === 'inventory' && mode !== 'inventory') {
      window.dispatchEvent(new Event('nextgen:inventory-closed'))
    }
    previousMode.current = mode
  }, [mode])

  useEffect(() => {
    const openShop = () => open('shop')
    const openInventory = () => open('inventory')
    const closeShop = () => setMode((current) => current === 'shop' ? null : current)
    const closeInventory = () => setMode((current) => current === 'inventory' ? null : current)
    const dashboardTab = (event: Event) => {
      const tab = (event as CustomEvent<string>).detail
      setShowFloating(tab !== 'home' && tab !== 'map')
    }
    window.addEventListener('nextgen:open-shop', openShop)
    window.addEventListener('nextgen:open-inventory', openInventory)
    window.addEventListener('nextgen:close-shop', closeShop)
    window.addEventListener('nextgen:close-inventory', closeInventory)
    window.addEventListener('nextgen:dashboard-tab', dashboardTab)
    return () => {
      window.removeEventListener('nextgen:open-shop', openShop)
      window.removeEventListener('nextgen:open-inventory', openInventory)
      window.removeEventListener('nextgen:close-shop', closeShop)
      window.removeEventListener('nextgen:close-inventory', closeInventory)
      window.removeEventListener('nextgen:dashboard-tab', dashboardTab)
    }
  }, [open])

  useEffect(() => {
    if (!gachaResult) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setGachaResult(null)
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [gachaResult])

  const buyItem = async (itemId: keyof typeof itemDetails) => {
    if (!user || pending) return
    const item = itemDetails[itemId]
    if (user.coins < item.cost) {
      setNotice({ kind: 'error', text: 'เหรียญไม่พอจ้า' })
      return
    }
    setPending(itemId)
    setNotice(null)
    try {
      const result = await service.buyItem(user.id, itemId)
      if (!result.success || result.coins === undefined || !result.inventory) {
        setNotice({ kind: 'error', text: result.error || 'ซื้อไอเทมไม่สำเร็จ' })
        return
      }
      const update = { coins: result.coins, inventory: result.inventory }
      setUser((current) => current ? { ...current, ...update } : current)
      onUserUpdate(update)
      setNotice({ kind: 'success', text: `ซื้อ${item.name} สำเร็จ!` })
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'การเชื่อมต่อล้มเหลว' })
    } finally {
      setPending(null)
    }
  }

  const buyGacha = async () => {
    if (!user || pending) return
    if (user.coins < 500) {
      setNotice({ kind: 'error', text: 'เหรียญไม่พอสุ่มกาชา!' })
      return
    }
    setPending('gacha')
    setNotice(null)
    try {
      const result = await service.gacha(user.id)
      if (!result.success || result.coins === undefined || !result.avatar) {
        setNotice({ kind: 'error', text: result.error || 'สุ่มอวาตาร์ไม่สำเร็จ' })
        return
      }
      const update = { coins: result.coins, avatar: result.avatar }
      setUser((current) => current ? { ...current, ...update } : current)
      onUserUpdate(update)
      setGachaResult({ avatar: result.avatar, rarity: result.rarity || 'Unknown' })
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'การเชื่อมต่อล้มเหลว' })
    } finally {
      setPending(null)
    }
  }

  const buyCosmeticItem = async (itemId: string) => {
    if (!user || pending || !service.buyCosmetic) return
    const item = COSMETIC_CATALOG[itemId]
    if (!item) return
    if (user.coins < item.price) {
      setNotice({ kind: 'error', text: 'เหรียญไม่พอจ้า' })
      return
    }
    setPending(itemId)
    setNotice(null)
    try {
      const result = await service.buyCosmetic(user.id, itemId)
      if (!result.success || result.coins === undefined || !result.inventory) {
        setNotice({ kind: 'error', text: result.error || 'ซื้อไอเทมไม่สำเร็จ' })
        return
      }
      const update = { coins: result.coins, inventory: result.inventory }
      setUser((current) => current ? { ...current, ...update } : current)
      onUserUpdate(update)
      setNotice({ kind: 'success', text: `ซื้อ${item.name} สำเร็จ! สวมใส่ให้เรียบร้อยแล้ว` })
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'การเชื่อมต่อล้มเหลว' })
    } finally {
      setPending(null)
    }
  }

  const toggleCosmeticItem = async (itemId: string) => {
    if (!user || pending || !service.equipCosmetic) return
    const item = COSMETIC_CATALOG[itemId]
    if (!item) return
    setPending(itemId)
    setNotice(null)
    try {
      const result = await service.equipCosmetic(user.id, itemId)
      if (!result.success || !result.inventory) {
        setNotice({ kind: 'error', text: result.error || 'เปลี่ยนชุดไม่สำเร็จ' })
        return
      }
      const update = { inventory: result.inventory }
      setUser((current) => current ? { ...current, ...update } : current)
      onUserUpdate(update)
      setNotice({ kind: 'success', text: result.equipped ? `สวมใส่${item.name} แล้ว!` : `ถอด${item.name} เก็บเข้าตู้แล้ว` })
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'การเชื่อมต่อล้มเหลว' })
    } finally {
      setPending(null)
    }
  }

  const itemIds = Object.keys(itemDetails) as Array<keyof typeof itemDetails>
  const decorativeSlotCount = Math.max(0, RO_INVENTORY_SLOT_COUNT - itemIds.length)
  const wardrobe = cosmeticsState(user?.inventory, user?.gender)
  const shopCosmetics = cosmeticsForTab(shopTab, user?.gender)

  return (
    <>
      {showFloating && (
        <div className="absolute bottom-[75px] right-2 sm:right-4 md:bottom-auto md:right-4 md:top-1/2 md:-translate-y-1/2 z-50 flex flex-row md:flex-col gap-2 md:gap-3 ro-float-actions">
          <button type="button" aria-label="เปิดร้านค้า" onClick={() => open('shop')} className="ro-float-btn ro-float-shop">
            <span aria-hidden="true">🏪</span><small>Shop</small>
          </button>
          <button type="button" aria-label="เปิดกระเป๋าไอเทม" onClick={() => open('inventory')} className="ro-float-btn ro-float-bag">
            <span aria-hidden="true">🎒</span><small>Bag</small>
          </button>
        </div>
      )}

      {notice && !mode && <BodyPortal><div role="alert" className="ro-toast-alert">{notice.text}</div></BodyPortal>}

      {mode === 'shop' && user && (
        <BodyPortal>
        <div role="dialog" aria-label="ร้านค้าลับ" aria-modal="true" className="ro-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setMode(null) }}>
          <div className="ro-shop-window">
            <header className="ro-shop-header">
              <div className="ro-shop-npc">
                <span className="ro-shop-npc-portrait" aria-hidden="true">🧝‍♀️</span>
                <div><b>แม่ค้าอิซซี่</b><small>“ยินดีต้อนรับนักผจญภัย! แวะดูของดีๆ ก่อนออกเดินทางไหมจ๊ะ?”</small></div>
              </div>
              <button type="button" aria-label="ปิดร้านค้า" onClick={() => setMode(null)} className="ro-modal-close">×</button>
            </header>
            <nav className="ro-shop-tabs" aria-label="หมวดหมู่สินค้า">
              {SHOP_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  aria-label={`หมวด${tab.label}`}
                  aria-pressed={shopTab === tab.id}
                  className={`ro-shop-tab${shopTab === tab.id ? ' active' : ''}`}
                  onClick={() => { setShopTab(tab.id); setNotice(null); setPreviewItemId(null) }}
                >
                  <span aria-hidden="true">{tab.icon}</span> {tab.label}
                </button>
              ))}
            </nav>
            <div className="ro-shop-body">
              <div className="ro-shop-topline">
                {shopTab !== 'consumable' && shopTab !== 'special' && (
                  <div className="ro-shop-preview-box">
                    <span className="ro-shop-preview-chip">
                      <LayeredHeroPreview
                        inventory={previewItemId ? tryOnInventory(user.inventory, previewItemId, user.gender) : user.inventory}
                        gender={user.gender}
                        size={84}
                        testId="wardrobe-preview"
                      />
                    </span>
                    <small data-testid="tryon-label">
                      {previewItemId ? `กำลังลอง: ${COSMETIC_CATALOG[previewItemId]?.name}` : 'คลิกสินค้าเพื่อลองชุด'}
                    </small>
                  </div>
                )}
                <div className="ro-coin-chip"><span>เหรียญของคุณ:</span><b>🪙 <span>{user.coins}</span></b></div>
              </div>
              {notice && <div role="status" className={`ro-shop-notice ro-notice-${notice.kind}`}>{notice.text}</div>}
              <div className="ro-shop-grid">
                {shopTab === 'special' && (
                  <div className="ro-shop-item ro-tint-fortune">
                    <div className="ro-shop-icon" aria-hidden="true">🔮</div>
                    <h4>สุ่มอวาตาร์</h4>
                    <p>ได้อวาตาร์ตัวใหม่สุดแรร์!</p>
                    <button type="button" aria-label="สุ่มอวาตาร์ ราคา 500 เหรียญ" disabled={pending !== null} onClick={() => void buyGacha()} className="ro-shop-buy">🪙 500</button>
                  </div>
                )}
                {shopTab === 'consumable' && itemIds.map((itemId) => {
                  const item = itemDetails[itemId]
                  return (
                    <div key={itemId} className={`ro-shop-item ro-tint-${item.color}`}>
                      <div className="ro-shop-icon" aria-hidden="true">{item.emoji}</div>
                      <h4>{item.name}</h4>
                      <p>{item.description}</p>
                      <button type="button" aria-label={`ซื้อ${item.name} ราคา ${item.cost} เหรียญ`} disabled={pending !== null} onClick={() => void buyItem(itemId)} className="ro-shop-buy">🪙 {item.cost}</button>
                    </div>
                  )
                })}
                {shopCosmetics.map((item) => {
                  const owned = wardrobe.owned.includes(item.id)
                  const trying = previewItemId === item.id
                  const rarity = rarityForPrice(item.price)
                  return (
                    <div
                      key={item.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`ลองชุด${item.name}`}
                      className={`ro-shop-item ro-cosmetic-item ro-rarity-${rarity}${trying ? ' ro-cosmetic-trying' : ''}`}
                      onClick={() => setPreviewItemId(item.id)}
                      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setPreviewItemId(item.id) }}
                    >
                      <span className="ro-cosmetic-badge ro-rarity-chip">{RARITY_LABEL[rarity]}</span>
                      {trying && <span className="ro-cosmetic-badge ro-trying-badge">👀 กำลังลอง</span>}
                      <div className="ro-shop-icon ro-cosmetic-icon" aria-hidden="true">
                        <img src={COSMETIC_ICONS[item.id]} alt="" draggable={false} />
                      </div>
                      <h4>{item.name}</h4>
                      <p>{item.description}</p>
                      {owned
                        ? <span className="ro-owned-chip">✓ ซื้อแล้ว — สวมใส่ได้ในกระเป๋า</span>
                        : <button type="button" aria-label={`ซื้อ${item.name} ราคา ${item.price} เหรียญ`} disabled={pending !== null} onClick={(event) => { event.stopPropagation(); setPreviewItemId(item.id); void buyCosmeticItem(item.id) }} className="ro-shop-buy">🪙 {item.price}</button>}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
        </BodyPortal>
      )}

      {mode === 'inventory' && user && (
        <BodyPortal>
        <div role="dialog" aria-label="กระเป๋าไอเทม" aria-modal="true" className="ro-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setMode(null) }}>
          <div className="ro-inv-window">
            <header className="ro-inv-header">
              <h3>🎒 กระเป๋าไอเทม</h3>
              <button type="button" aria-label="ปิดกระเป๋าไอเทม" onClick={() => setMode(null)} className="ro-modal-close">×</button>
            </header>
            <nav className="ro-shop-tabs" aria-label="หมวดหมู่กระเป๋า">
              <button type="button" aria-label="หมวดสวมใส่" aria-pressed={bagTab === 'equip'} className={`ro-shop-tab${bagTab === 'equip' ? ' active' : ''}`} onClick={() => { setBagTab('equip'); setNotice(null) }}>
                <span aria-hidden="true">🧍</span> สวมใส่
              </button>
              <button type="button" aria-label="หมวดของใช้" aria-pressed={bagTab === 'items'} className={`ro-shop-tab${bagTab === 'items' ? ' active' : ''}`} onClick={() => { setBagTab('items'); setNotice(null) }}>
                <span aria-hidden="true">🧪</span> ของใช้
              </button>
            </nav>
            <div className="ro-inv-body">
              {notice && <div role="status" className={`ro-shop-notice ro-notice-${notice.kind}`}>{notice.text}</div>}
              {bagTab === 'equip' && (
                <CharacterEquipment
                  inventory={user.inventory}
                  gender={user.gender}
                  pending={pending !== null}
                  onToggle={(itemId) => void toggleCosmeticItem(itemId)}
                />
              )}
              {bagTab === 'items' && (
                <>
                  <div className="ro-inv-grid">
                    {itemIds.map((itemId) => {
                      const item = itemDetails[itemId]
                      const count = Number(user.inventory?.[itemId]) || 0
                      return (
                        <div key={itemId} className={`ro-inv-slot ro-tint-${item.color}`}>
                          <span className="ro-inv-icon" aria-hidden="true">{item.emoji}</span>
                          <b className="ro-inv-name">{item.name}</b>
                          <em className="ro-inv-qty">x{count}</em>
                          <small className="ro-inv-use">ใช้ในศึกปะทะบอส</small>
                        </div>
                      )
                    })}
                    {Array.from({ length: decorativeSlotCount }, (_, index) => (
                      <div key={`empty-${index}`} className="ro-inv-slot empty" aria-hidden="true" />
                    ))}
                  </div>
                  <p className="ro-inv-hint">✨ ไอเทมจะเปิดให้ใช้งานอัตโนมัติเมื่อตอนต่อสู้กับบอส</p>
                </>
              )}
            </div>
          </div>
        </div>
        </BodyPortal>
      )}

      {gachaResult && (
        <BodyPortal>
        <div role="dialog" aria-label="ผลการสุ่มอวาตาร์" aria-modal="true" onClick={(event) => { if (event.target === event.currentTarget) setGachaResult(null) }} className="ro-modal-backdrop ro-gacha-backdrop">
          <div className="ro-gacha-window">
            <h3>🎉 ยินดีด้วย!</h3><div className="ro-gacha-avatar">{gachaResult.avatar}</div><div className="ro-gacha-rarity">ได้ตัวละครระดับ {gachaResult.rarity}!</div><p>อวาตาร์ของคุณเปลี่ยนเป็น {gachaResult.avatar} แล้ว</p>
            <button type="button" onClick={() => setGachaResult(null)} className="ro-gacha-confirm">ว้าว! ขอบคุณครับ 🎁</button>
          </div>
        </div>
        </BodyPortal>
      )}
    </>
  )
}
