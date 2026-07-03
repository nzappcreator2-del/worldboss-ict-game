import { useCallback, useEffect, useState } from 'react'

export type EconomyInventory = { potion?: number; magnifier?: number; [key: string]: unknown }
export type EconomyUser = { id: string; coins: number; avatar?: string; inventory?: EconomyInventory }
type PurchaseResult = { success: boolean; coins?: number; inventory?: EconomyInventory; error?: string }
type GachaResult = { success: boolean; coins?: number; avatar?: string; rarity?: string; error?: string }

export type EconomyService = {
  getCurrentUser(): EconomyUser | null
  buyItem(userId: string, itemId: 'potion' | 'magnifier'): Promise<PurchaseResult>
  gacha(userId: string): Promise<GachaResult>
}

type Props = {
  service: EconomyService
  onUserUpdate(user: Partial<EconomyUser>): void
}

const itemDetails = {
  potion: { name: 'ยาเติมเลือด HP', emoji: '🧪', cost: 100, description: 'ฟื้นฟู HP 30% ตอนสู้บอส', color: 'red' },
  magnifier: { name: 'แว่นขยายตัดชอยส์', emoji: '🔍', cost: 150, description: 'สุ่มตัดตัวเลือกที่ผิด 1 ข้อ', color: 'blue' },
} as const

export function PlayerEconomy({ service, onUserUpdate }: Props) {
  const [user, setUser] = useState<EconomyUser | null>(() => service.getCurrentUser())
  const [mode, setMode] = useState<'shop' | 'inventory' | null>(null)
  const [showFloating, setShowFloating] = useState(false)
  const [pending, setPending] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [gachaResult, setGachaResult] = useState<{ avatar: string; rarity: string } | null>(null)

  const open = useCallback((nextMode: 'shop' | 'inventory') => {
    const current = service.getCurrentUser()
    if (!current) {
      setNotice({ kind: 'error', text: 'กรุณาล็อกอินก่อน' })
      return
    }
    setUser({ ...current, inventory: { ...(current.inventory || {}) } })
    setNotice(null)
    setMode(nextMode)
  }, [service])

  useEffect(() => {
    const openShop = () => open('shop')
    const openInventory = () => open('inventory')
    const closeShop = () => setMode((current) => current === 'shop' ? null : current)
    const closeInventory = () => setMode((current) => current === 'inventory' ? null : current)
    const dashboardTab = (event: Event) => setShowFloating((event as CustomEvent<string>).detail !== 'home')
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

  return (
    <>
      {showFloating && (
        <div className="absolute bottom-[75px] right-2 sm:right-4 md:bottom-auto md:right-4 md:top-1/2 md:-translate-y-1/2 z-50 flex flex-row md:flex-col gap-2 md:gap-3">
          <button type="button" aria-label="เปิดร้านค้า" onClick={() => open('shop')} className="ui-jelly-btn bg-fuchsia-400 hover:bg-fuchsia-300 w-14 h-14 md:w-16 md:h-16 rounded-2xl flex flex-col items-center justify-center border-4 border-fuchsia-700 pulse-glow shadow-lg">
            <span className="text-2xl md:text-3xl">🎁</span><span className="text-[8px] md:text-[10px] font-black text-fuchsia-900">Shop</span>
          </button>
          <button type="button" aria-label="เปิดกระเป๋าไอเทม" onClick={() => open('inventory')} className="ui-jelly-btn bg-indigo-400 hover:bg-indigo-300 w-14 h-14 md:w-16 md:h-16 rounded-2xl flex flex-col items-center justify-center border-4 border-indigo-700 shadow-lg">
            <span className="text-2xl md:text-3xl">🎒</span><span className="text-[8px] md:text-[10px] font-black text-indigo-900">Bag</span>
          </button>
        </div>
      )}

      {notice && !mode && <div role="alert" className="fixed top-4 left-1/2 -translate-x-1/2 z-[130] bg-white border-2 border-red-400 rounded-xl px-5 py-3 font-bold text-red-700 shadow-xl">{notice.text}</div>}

      {mode === 'shop' && user && (
        <div role="dialog" aria-label="ร้านค้าลับ" aria-modal="true" className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-gradient-to-br from-yellow-50 to-orange-100 rounded-3xl max-w-xl w-full border-4 border-yellow-500 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-gradient-to-r from-yellow-400 to-orange-500 p-4 flex justify-between items-center border-b-4 border-orange-600 relative overflow-hidden">
              <div className="absolute -right-4 -bottom-4 opacity-30 text-7xl">🎁</div>
              <h3 className="text-3xl font-black text-white drop-shadow-md relative z-10">🎁 ร้านค้าลับ</h3>
              <button type="button" aria-label="ปิดร้านค้า" onClick={() => setMode(null)} className="text-white hover:text-red-200 text-4xl leading-none font-bold relative z-10">×</button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 text-center">
              <div className="bg-white/80 p-3 rounded-2xl border-2 border-yellow-300 inline-block mb-4 shadow-sm">
                <span className="font-bold text-gray-700">เหรียญของคุณ: </span><span className="text-2xl font-black text-yellow-600 ml-2">🪙 <span>{user.coins}</span></span>
              </div>
              {notice && <div role="status" className={`mb-4 rounded-xl px-4 py-2 font-bold ${notice.kind === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{notice.text}</div>}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-white rounded-2xl p-5 border-4 border-fuchsia-300 shadow flex flex-col items-center">
                  <div className="text-5xl mb-3">🔮</div><h4 className="font-bold text-xl text-fuchsia-800">สุ่มอวาตาร์</h4><p className="text-xs text-gray-500 mt-1 mb-3">ได้อวาตาร์ตัวใหม่สุดแรร์!</p>
                  <button type="button" aria-label="สุ่มอวาตาร์ ราคา 500 เหรียญ" disabled={pending !== null} onClick={() => void buyGacha()} className="mt-auto px-4 py-2 bg-gradient-to-r from-fuchsia-500 to-pink-500 disabled:opacity-50 text-white font-bold rounded-xl shadow w-full">🪙 500</button>
                </div>
                {(Object.keys(itemDetails) as Array<keyof typeof itemDetails>).map((itemId) => {
                  const item = itemDetails[itemId]
                  return (
                    <div key={itemId} className={`bg-white rounded-2xl p-5 border-4 border-${item.color}-300 shadow flex flex-col items-center`}>
                      <div className="text-5xl mb-3">{item.emoji}</div><h4 className={`font-bold text-xl text-${item.color}-800`}>{item.name}</h4><p className="text-xs text-gray-500 mt-1 mb-3">{item.description}</p>
                      <button type="button" aria-label={`ซื้อ${item.name} ราคา ${item.cost} เหรียญ`} disabled={pending !== null} onClick={() => void buyItem(itemId)} className={`mt-auto px-4 py-2 bg-${item.color}-500 disabled:opacity-50 text-white font-bold rounded-xl shadow w-full`}>🪙 {item.cost}</button>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {mode === 'inventory' && user && (
        <div role="dialog" aria-label="กระเป๋าไอเทม" aria-modal="true" className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-gradient-to-br from-indigo-50 to-purple-100 rounded-3xl max-w-sm w-full border-4 border-indigo-500 shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-indigo-500 to-purple-600 p-4 flex justify-between items-center border-b-4 border-indigo-800">
              <h3 className="text-2xl font-black text-white">🎒 กระเป๋าไอเทม</h3>
              <button type="button" aria-label="ปิดกระเป๋าไอเทม" onClick={() => setMode(null)} className="text-white hover:text-red-200 text-4xl leading-none font-bold">×</button>
            </div>
            <div className="p-6 space-y-4">
              {(Object.keys(itemDetails) as Array<keyof typeof itemDetails>).map((itemId) => {
                const item = itemDetails[itemId]
                return <div key={itemId} className="bg-white rounded-2xl p-4 flex items-center gap-4 border-2 shadow-sm"><div className="text-4xl">{item.emoji}</div><div className="flex-1"><h4 className="font-bold text-gray-800">{item.name}</h4><p className="text-xs text-gray-500">ใช้ในศึกปะทะบอส</p></div><div className="text-2xl font-black bg-gray-50 w-12 h-12 rounded-full flex items-center justify-center">x{Number(user.inventory?.[itemId]) || 0}</div></div>
              })}
              <p className="text-sm text-gray-500 font-medium text-center">✨ ไอเทมจะเปิดให้ใช้งานอัตโนมัติเมื่อตอนต่อสู้กับบอส</p>
            </div>
          </div>
        </div>
      )}

      {gachaResult && (
        <div role="dialog" aria-label="ผลการสุ่มอวาตาร์" aria-modal="true" onClick={(event) => { if (event.target === event.currentTarget) setGachaResult(null) }} className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl border-4 border-gray-800 shadow-2xl max-w-sm w-full p-8 text-center">
            <h3 className="text-2xl font-black text-gray-800">🎉 ยินดีด้วย!</h3><div className="text-8xl my-4">{gachaResult.avatar}</div><div className="text-xl font-bold text-indigo-600">ได้ตัวละครระดับ {gachaResult.rarity}!</div><p className="text-gray-500 my-4">อวาตาร์ของคุณเปลี่ยนเป็น {gachaResult.avatar} แล้ว</p>
            <button type="button" onClick={() => setGachaResult(null)} className="bg-indigo-600 text-white rounded-xl px-8 py-3 font-black w-full">ว้าว! ขอบคุณครับ 🎁</button>
          </div>
        </div>
      )}
    </>
  )
}
