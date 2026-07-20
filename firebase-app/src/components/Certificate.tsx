import { useCallback, useEffect, useRef, useState } from 'react'
import { createCertificateDownload, drawCertificateCanvas } from './certificateCanvas'
import certificateHall from '../assets/generated/certificate-hall.jpg'

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
  onClose?(): void
  draw?: typeof drawCertificateCanvas
}

export function Certificate({ service, onEligible, onDenied, onClose, draw = drawCertificateCanvas }: Props) {
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
    <div id="dash-tab-cert" className="certificate-page">
      <section className="certificate-window">
        <header className="certificate-hero">
          <img src={certificateHall} alt="" draggable={false} />
          <div className="certificate-hero-copy">
            <span>HALL OF LAURELS</span>
            <h1>เกียรติบัตรผู้พิชิต</h1>
            <p>หลักฐานแห่งความมุ่งมั่นจากทุกด่านการเรียนรู้</p>
          </div>
          <button type="button" className="feature-close-button" aria-label="ปิดหน้าเกียรติบัตร" onClick={() => onClose?.()}><span aria-hidden="true">×</span><b>ปิด</b></button>
        </header>
        <div className="certificate-content">
          <aside className="certificate-status-card">
            <span className="certificate-seal" aria-hidden="true">✦</span>
            <h2>บันทึกเกียรติยศ</h2>
            <p>ผ่านบทเรียนที่เปิดใช้งานครบทุกด่าน เพื่อปลดผนึกและดาวน์โหลดเกียรติบัตรประจำตัว</p>
            <div className={`certificate-status certificate-status-${status}`} aria-live="polite">
              {status === 'idle' && <span>📜 เปิดเมนูเพื่อตรวจสอบสิทธิ์</span>}
              {status === 'checking' && <span>⏳ กำลังตรวจสอบด่านที่ผ่าน...</span>}
              {status === 'drawing' && <span>✨ กำลังสร้างเกียรติบัตร...</span>}
              {status === 'ready' && <span>✅ สร้างเกียรติบัตรสำเร็จ!</span>}
              {status === 'locked' && <span>🔒 {message}</span>}
              {status === 'error' && <span>⚠️ {message}</span>}
            </div>
            {status === 'error' && <button type="button" onClick={check} className="certificate-retry">ลองใหม่</button>}
            {status === 'ready' && <div className="certificate-actions">
              <button type="button" aria-label="บันทึกเกียรติบัตร" onClick={download}>⬇️ บันทึกเกียรติบัตร</button>
              <a href="https://classroom.google.com/" target="_blank" rel="noreferrer" aria-label="เข้า Classroom เพื่อส่งงาน">🏫 ส่งงานใน Classroom</a>
            </div>}
          </aside>
          <div className="certificate-canvas-frame"><canvas ref={canvasRef} width={800} height={640} aria-label="ตัวอย่างเกียรติบัตร" /></div>
        </div>
      </section>
    </div>
  )
}
