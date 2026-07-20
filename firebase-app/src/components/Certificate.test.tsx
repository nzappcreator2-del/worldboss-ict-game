// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Certificate, type CertificateService } from './Certificate'
import { createCertificateDownload, drawCertificateCanvas } from './certificateCanvas'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const user = { id: 'u1', name: 'ฟ้า', class: 'ป.6/1', avatar: '🧙', xp: 720, rank: 'GOLD', level: 8 }

function setup(result: unknown, onClose = vi.fn()) {
  const service: CertificateService = {
    getCurrentUser: () => user,
    getSettings: () => ({ CertHeader: 'โรงเรียนตัวอย่าง', CertFooter: 'ครูผู้สอน' }),
    checkEligibility: vi.fn().mockResolvedValue(result),
  }
  const onEligible = vi.fn()
  const onDenied = vi.fn()
  const draw = vi.fn().mockResolvedValue(undefined)
  render(<Certificate service={service} onEligible={onEligible} onDenied={onDenied} onClose={onClose} draw={draw} />)
  return { service, onEligible, onDenied, onClose, draw }
}

describe('Certificate', () => {
  it('offers a close control that returns to the dashboard', () => {
    const { onClose } = setup({ success: true, isEligible: true })

    screen.getByRole('button', { name: 'ปิดหน้าเกียรติบัตร' }).click()

    expect(onClose).toHaveBeenCalledOnce()
  })

  it('checks eligibility and renders a downloadable certificate', async () => {
    const { service, onEligible, draw } = setup({ success: true, isEligible: true, passedCount: 4, totalActiveCount: 4 })

    window.dispatchEvent(new Event('nextgen:open-certificate'))

    expect(await screen.findByText(/สร้างเกียรติบัตรสำเร็จ!/)).toBeTruthy()
    expect(service.checkEligibility).toHaveBeenCalledWith('u1')
    expect(draw).toHaveBeenCalled()
    expect(onEligible).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'บันทึกเกียรติบัตร' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'เข้า Classroom เพื่อส่งงาน' }).getAttribute('href')).toBe('https://classroom.google.com/')
  })

  it('keeps the certificate locked until every active lesson is passed', async () => {
    const { draw, onDenied } = setup({ success: true, isEligible: false, passedCount: 2, totalActiveCount: 4 })
    window.dispatchEvent(new Event('nextgen:open-certificate'))

    expect(await screen.findByText(/ยังเรียนไม่ครบ 2 \/ 4 ด่าน/)).toBeTruthy()
    expect(draw).not.toHaveBeenCalled()
    expect(onDenied).toHaveBeenCalledWith('ยังเรียนไม่ครบ 2 / 4 ด่าน')
  })

  it('shows a retry action when eligibility checking fails', async () => {
    const { service } = setup({ success: false, error: 'permission denied' })
    window.dispatchEvent(new Event('nextgen:open-certificate'))

    expect(await screen.findByText(/ตรวจสอบสิทธิ์ไม่สำเร็จ/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'ลองใหม่' })).toBeTruthy()
    expect(service.checkEligibility).toHaveBeenCalledOnce()
  })

  it('builds a safe PNG download name', () => {
    const canvas = document.createElement('canvas')
    canvas.toDataURL = vi.fn().mockReturnValue('data:image/png;base64,abc')

    expect(createCertificateDownload(canvas, 'ฟ้า / ป.6')).toEqual({
      filename: 'เกียรติบัตร_ฟ้า___ป.6.png',
      href: 'data:image/png;base64,abc',
    })
  })

  it('draws the player and configured school text onto the canvas', async () => {
    const gradient = { addColorStop: vi.fn() }
    const context = {
      clearRect: vi.fn(), createLinearGradient: vi.fn().mockReturnValue(gradient), fillRect: vi.fn(),
      strokeRect: vi.fn(), fillText: vi.fn(), drawImage: vi.fn(),
      fillStyle: '', strokeStyle: '', lineWidth: 0, textAlign: '', font: '',
    }
    const canvas = { width: 800, height: 640, getContext: vi.fn().mockReturnValue(context) } as unknown as HTMLCanvasElement
    class FailedImage {
      crossOrigin = ''
      onload: null | (() => void) = null
      onerror: null | (() => void) = null
      set src(_value: string) { this.onerror?.() }
    }
    vi.stubGlobal('Image', FailedImage)

    await drawCertificateCanvas(canvas, user, { CertHeader: 'โรงเรียนตัวอย่าง', CertFooter: 'ครูผู้สอน' }, new Date('2026-06-29T00:00:00Z'))

    expect(context.fillText).toHaveBeenCalledWith('โรงเรียนตัวอย่าง', 400, 165)
    expect(context.fillText).toHaveBeenCalledWith('ฟ้า', 400, 320)
    expect(context.fillText).toHaveBeenCalledWith('ครูผู้สอน', 400, 605)
  })
})
