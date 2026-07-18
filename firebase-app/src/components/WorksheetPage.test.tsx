// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WorksheetPage, type WorksheetService } from './WorksheetPage'
import { createWorksheetDownload, drawWorksheetCanvas } from './worksheetCanvas'

afterEach(cleanup)

const lesson = { id: 'l1', title: 'ด่านอินเทอร์เน็ต', content: 'สรุปเนื้อหา\nบรรทัดสอง', worksheetUrl: 'https://classroom.google.com/c/example' }
const user = { name: 'สมชาย', class: 'ป.6/1', avatar: '🧙' }

function setup(draw = vi.fn().mockResolvedValue(undefined), currentLesson = lesson) {
  const service: WorksheetService = { getCurrentLesson: () => currentLesson, getCurrentUser: () => user }
  const onBack = vi.fn()
  render(<WorksheetPage service={service} onBack={onBack} draw={draw} />)
  window.dispatchEvent(new Event('nextgen:open-worksheet'))
  return { draw, onBack }
}

describe('WorksheetPage', () => {
  it('renders lesson content and opens Classroom externally without an iframe', async () => {
    setup()
    expect(await screen.findByText(/บรรทัดสอง/)).toBeTruthy()
    expect(screen.getByRole('link', { name: /ลิงก์ต้นฉบับ/ }).getAttribute('href')).toBe(lesson.worksheetUrl)
    expect(document.querySelector('iframe')).toBeNull()
  })

  it('opens Google Docs externally instead of creating a blocked iframe', async () => {
    const docsLesson = { ...lesson, worksheetUrl: 'https://docs.google.com/document/d/doc-id/edit' }
    setup(undefined, docsLesson)

    expect(await screen.findByText(/Google Docs ไม่อนุญาต/)).toBeTruthy()
    expect(screen.getByRole('link', { name: /ลิงก์ต้นฉบับ/ }).getAttribute('href')).toBe(docsLesson.worksheetUrl)
    expect(document.querySelector('iframe')).toBeNull()
  })

  it('previews direct images and converts Drive links to preview embeds', async () => {
    const { unmount } = render(<WorksheetPage service={{ getCurrentLesson: () => ({ ...lesson, worksheetUrl: 'https://example.com/work.png' }), getCurrentUser: () => user }} onBack={vi.fn()} />)
    window.dispatchEvent(new Event('nextgen:open-worksheet'))
    expect(await screen.findByAltText('ใบงานประกอบบทเรียน')).toBeTruthy()
    unmount()

    render(<WorksheetPage service={{ getCurrentLesson: () => ({ ...lesson, worksheetUrl: 'https://drive.google.com/file/d/abc_123/view' }), getCurrentUser: () => user }} onBack={vi.fn()} />)
    window.dispatchEvent(new Event('nextgen:open-worksheet'))
    expect((await screen.findByTitle('ตัวอย่างใบงาน')).getAttribute('src')).toBe('https://drive.google.com/file/d/abc_123/preview')
  })

  it('validates input then renders a generated worksheet preview', async () => {
    const { draw } = setup()
    fireEvent.click(await screen.findByRole('button', { name: /บันทึกและรับรูปใบงาน/ }))
    expect(screen.getByText('กรุณาพิมพ์คำตอบหรือสรุปความรู้ก่อน')).toBeTruthy()

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'คำตอบของฉัน' } })
    fireEvent.click(screen.getByRole('button', { name: /บันทึกและรับรูปใบงาน/ }))

    expect(draw).toHaveBeenCalledWith(expect.any(HTMLCanvasElement), lesson, user, 'คำตอบของฉัน')
    expect(await screen.findByRole('heading', { name: /บันทึกใบงานสำเร็จ/ })).toBeTruthy()
  })

  it('returns to the lesson', async () => {
    const { onBack } = setup()
    fireEvent.click(await screen.findByRole('button', { name: /กลับสู่บทเรียน/ }))
    expect(onBack).toHaveBeenCalledOnce()
  })

  it('saves the submission online, pays the first-time study reward, and syncs the player', async () => {
    const saveSubmission = vi.fn().mockResolvedValue({
      success: true,
      firstSubmission: true,
      stats: { xp: 140, coins: 45, level: 2, rank: 'BRONZE', gainedXp: 40, gainedCoins: 25 },
    })
    const onUserUpdate = vi.fn()
    render(
      <WorksheetPage
        service={{ getCurrentLesson: () => lesson, getCurrentUser: () => user, saveSubmission }}
        onBack={vi.fn()}
        onUserUpdate={onUserUpdate}
        draw={vi.fn().mockResolvedValue(undefined)}
      />,
    )
    window.dispatchEvent(new Event('nextgen:open-worksheet'))

    fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'คำตอบของฉัน' } })
    fireEvent.click(screen.getByRole('button', { name: /บันทึกและรับรูปใบงาน/ }))

    expect(await screen.findByText(/\+40 XP \+25 เหรียญ/)).toBeTruthy()
    expect(saveSubmission).toHaveBeenCalledWith('l1', 'คำตอบของฉัน')
    expect(onUserUpdate).toHaveBeenCalledWith({ xp: 140, coins: 45, level: 2, rank: 'BRONZE', gainedXp: 40, gainedCoins: 25 })
  })

  it('notes that repeat submissions update the teacher copy without repeating the reward', async () => {
    const saveSubmission = vi.fn().mockResolvedValue({ success: true, firstSubmission: false, stats: { xp: 140, coins: 45, level: 2, rank: 'BRONZE', gainedXp: 0, gainedCoins: 0 } })
    render(
      <WorksheetPage service={{ getCurrentLesson: () => lesson, getCurrentUser: () => user, saveSubmission }} onBack={vi.fn()} draw={vi.fn().mockResolvedValue(undefined)} />,
    )
    window.dispatchEvent(new Event('nextgen:open-worksheet'))

    fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'คำตอบรอบสอง' } })
    fireEvent.click(screen.getByRole('button', { name: /บันทึกและรับรูปใบงาน/ }))

    expect(await screen.findByText(/ส่งฉบับใหม่ถึงครูแล้ว/)).toBeTruthy()
  })

  it('still delivers the PNG preview when the online save fails', async () => {
    const saveSubmission = vi.fn().mockRejectedValue(new Error('offline'))
    render(
      <WorksheetPage service={{ getCurrentLesson: () => lesson, getCurrentUser: () => user, saveSubmission }} onBack={vi.fn()} draw={vi.fn().mockResolvedValue(undefined)} />,
    )
    window.dispatchEvent(new Event('nextgen:open-worksheet'))

    fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'คำตอบของฉัน' } })
    fireEvent.click(screen.getByRole('button', { name: /บันทึกและรับรูปใบงาน/ }))

    expect(await screen.findByRole('heading', { name: /บันทึกใบงานสำเร็จ/ })).toBeTruthy()
    expect(screen.getByText(/บันทึกส่งครูออนไลน์ไม่สำเร็จ/)).toBeTruthy()
  })
})

describe('worksheet canvas', () => {
  it('draws lesson, student, and answer text', async () => {
    const context = { clearRect: vi.fn(), fillRect: vi.fn(), strokeRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), fillText: vi.fn(), measureText: vi.fn(() => ({ width: 20 })), fillStyle: '', strokeStyle: '', lineWidth: 0, textAlign: '', font: '' }
    const canvas = { width: 1200, height: 800, getContext: vi.fn(() => context) } as unknown as HTMLCanvasElement
    await drawWorksheetCanvas(canvas, lesson, user, 'คำตอบของฉัน')
    expect(context.fillText).toHaveBeenCalledWith('ด่าน/บทเรียน: ด่านอินเทอร์เน็ต', 600, 120)
    expect(context.fillText).toHaveBeenCalledWith(expect.stringContaining('สมชาย'), 600, 160)
    expect(context.fillText).toHaveBeenCalledWith(expect.stringContaining('คำตอบของฉัน'), 70, 240)
  })

  it('creates a safe PNG filename', () => {
    const canvas = { toDataURL: () => 'data:image/png;base64,abc' } as HTMLCanvasElement
    expect(createWorksheetDownload(canvas, 'ด่าน / เว็บ', 'สมชาย')).toEqual({ filename: 'ใบงาน_ด่าน___เว็บ_สมชาย.png', href: 'data:image/png;base64,abc' })
  })
})
