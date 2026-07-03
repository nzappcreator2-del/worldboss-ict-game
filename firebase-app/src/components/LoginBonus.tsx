import { useCallback, useEffect, useRef, useState } from 'react'

export type LoginBonusResult = {
  success: boolean
  isNew?: boolean
  streak?: number
  coinsGained?: number
  totalCoins?: number
  error?: string
}

export type LoginBonusService = {
  getCurrentUser(): { id: string } | null
  claim(userId: string): Promise<LoginBonusResult>
}

export function LoginBonus({ service, onUserUpdate }: {
  service: LoginBonusService
  onUserUpdate(update: { coins?: number; streak?: number }): void
}) {
  const [reward, setReward] = useState<LoginBonusResult | null>(null)
  const [error, setError] = useState('')
  const inFlight = useRef(false)

  const claim = useCallback(async () => {
    const user = service.getCurrentUser()
    if (!user || inFlight.current) return
    inFlight.current = true
    setReward(null)
    setError('')
    try {
      const result = await service.claim(user.id)
      if (!result.success) throw new Error(result.error || 'รับของขวัญประจำวันไม่สำเร็จ')
      if (!result.isNew) return
      setReward(result)
      onUserUpdate({ coins: result.totalCoins, streak: result.streak })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'รับของขวัญประจำวันไม่สำเร็จ')
    } finally {
      inFlight.current = false
    }
  }, [onUserUpdate, service])

  useEffect(() => {
    window.addEventListener('nextgen:login-complete', claim)
    return () => window.removeEventListener('nextgen:login-complete', claim)
  }, [claim])

  return <>
    {reward && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md" role="dialog" aria-label="ของขวัญประจำวัน" aria-modal="true">
      <div className="relative w-full max-w-sm animate-bounce-in rounded-[2rem] border-4 border-gray-800 bg-[#f8f9fa] p-8 text-center shadow-[0_25px_60px_rgba(0,0,0,0.5)]">
        <div className="absolute -top-16 left-1/2 h-48 w-48 -translate-x-1/2 animate-pulse rounded-full bg-yellow-400/20 blur-3xl" />
        <h3 className="mb-2 font-mali text-2xl font-black text-gray-800">ของขวัญวันนี้! 🎁</h3>
        <div className="relative my-6"><div className="animate-float text-[5rem]">💰</div><div className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-indigo-600 px-4 py-1 text-sm font-bold text-white shadow-lg">+{reward.coinsGained || 0} Coins</div></div>
        <div className="mb-6 rounded-2xl border-2 border-dashed border-indigo-200 bg-white p-4"><p className="mb-1 text-sm text-gray-600">สะสมความต่อเนื่อง</p><div className="font-mali text-2xl font-black text-indigo-600">🔥 {reward.streak || 0} วันแล้ว!</div></div>
        <button type="button" onClick={() => setReward(null)} className="w-full rounded-xl bg-indigo-600 py-3 font-bold text-white shadow-[0_4px_0_#4338ca] transition-all active:translate-y-1 active:shadow-none">เข้าสู่การผจญภัย</button>
      </div>
    </div>}
    {error && <div role="alert" className="fixed bottom-5 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-3 rounded-xl border-2 border-red-400 bg-red-50 px-4 py-3 font-bold text-red-700 shadow-xl"><span>{error}</span><button type="button" aria-label="ปิดข้อผิดพลาดของขวัญประจำวัน" onClick={() => setError('')}>×</button></div>}
  </>
}
