import { useCallback, useEffect, useRef, useState } from 'react'
import { createCertificateDownload, drawCertificateCanvas } from './certificateCanvas'

export type CertificateUser = { id: string; name: string; class: string; avatar?: string; xp?: number; rank?: string; level?: number }
export type CertificateSettings = { CertHeader?: string; CertFooter?: string }
export type EligibilityResult = { success: boolean; isEligible?: boolean; passedCount?: number; totalActiveCount?: number; error?: string }

export type CertificateService = {
  getCurrentUser(): CertificateUser | null
  getSettings(): CertificateSettings
  checkEligibility(userId: string): Promise<EligibilityResult>
}

type Props = {
  service: CertificateService
  onEligible(): void
  onDenied(message: string): void
  draw?: typeof drawCertificateCanvas
}

export function Certificate({ service, onEligible, onDenied, draw = drawCertificateCanvas }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const requestId = useRef(0)
  const [status, setStatus] = useState<'idle' | 'checking' | 'drawing' | 'ready' | 'locked' | 'error'>('idle')
  const [message, setMessage] = useState('')

  const check = useCallback(async () => {
    const user = service.getCurrentUser()
    const canvas = canvasRef.current
    if (!user || !canvas) {
      const text = 'กรุณาเข้าสู่ระบบก่อนตรวจสอบสิทธิ์'
      setMessage(text)
      setStatus('error')
      onDenied(text)
      return
    }
    const id = ++requestId.current
    setStatus('checking')
    setMessage('')
    try {
      const result = await service.checkEligibility(user.id)
      if (id !== requestId.current) return
      if (!result.success) throw new Error(result.error || 'eligibility failed')
      if (!result.isEligible) {
        const text = `ยังเรียนไม่ครบ ${result.passedCount || 0} / ${result.totalActiveCount || 0} ด่าน`
        setMessage(text)
        setStatus('locked')
        onDenied(text)
        return
      }
      onEligible()
      setStatus('drawing')
      await draw(canvas, user, service.getSettings(), new Date())
      if (id === requestId.current) setStatus('ready')
    } catch {
      if (id === requestId.current) {
        setMessage('ตรวจสอบสิทธิ์ไม่สำเร็จ')
        setStatus('error')
      }
    }
  }, [draw, onDenied, onEligible, service])

  useEffect(() => {
    const open = () => void check()
    window.addEventListener('nextgen:open-certificate', open)
    return () => window.removeEventListener('nextgen:open-certificate', open)
  }, [check])

  const download = () => {
    const canvas = canvasRef.current
    const user = service.getCurrentUser()
    if (!canvas || !user) return
    const data = createCertificateDownload(canvas, user.name)
    const link = document.createElement('a')
    link.download = data.filename
    link.href = data.href
    link.click()
  }

  return (
    <div id="dash-tab-cert" className="flex flex-1 flex-col items-center justify-center overflow-hidden">
      <div className="rpg-box rpg-box-green w-full max-w-2xl h-full overflow-hidden flex flex-col relative bg-white/90">
        <header className="bg-gradient-to-r from-green-500 to-emerald-600 p-5 text-white border-b-4 border-green-800 shrink-0">
          <h3 className="font-black text-3xl flex items-center gap-2 drop-shadow-md">📜 เกียรติบัตร (Certificate)</h3>
        </header>
        <div className="p-4 sm:p-6 flex-1 flex flex-col items-center justify-start overflow-y-auto pb-28 mt-2">
          <canvas ref={canvasRef} width={800} height={640} aria-label="ตัวอย่างเกียรติบัตร" className="w-full max-w-xl h-auto object-contain rounded-xl shadow-lg border-4 border-gray-300 mb-6 shrink-0" />
          <div className="text-center font-bold mb-4 min-h-6" aria-live="polite">
            {status === 'idle' && <span className="text-gray-500">เปิดเมนู Certificate เพื่อตรวจสอบสิทธิ์</span>}
            {status === 'checking' && <span className="text-indigo-600">กำลังตรวจสอบด่านที่ผ่าน... ⏳</span>}
            {status === 'drawing' && <span className="text-indigo-600">กำลังสร้างเกียรติบัตร... ⏳</span>}
            {status === 'ready' && <span className="text-green-600">✅ สร้างเกียรติบัตรสำเร็จ!</span>}
            {status === 'locked' && <span className="text-amber-700">🔒 {message}</span>}
            {status === 'error' && <span className="text-red-600">⚠️ {message}</span>}
          </div>
          {status === 'error' && <button type="button" onClick={check} className="mb-4 px-5 py-2 bg-indigo-600 text-white rounded-xl font-bold">ลองใหม่</button>}
          {status === 'ready' && <>
            <button type="button" aria-label="บันทึกเกียรติบัตร" onClick={download} className="btn-arcade w-full max-w-sm py-4 text-xl mb-3 shrink-0">⬇️ เซฟรูปเกียรติบัตรไว้ส่งงาน</button>
            <a href="https://classroom.google.com/" target="_blank" rel="noreferrer" aria-label="เข้า Classroom เพื่อส่งงาน" className="w-full max-w-sm py-4 text-xl bg-white border-4 border-green-600 text-green-700 font-bold rounded-xl shadow-md flex justify-center items-center gap-2 hover:bg-green-50 mb-8 shrink-0">🏫 เข้า Classroom เพื่อส่งงาน</a>
          </>}
        </div>
      </div>
    </div>
  )
}
