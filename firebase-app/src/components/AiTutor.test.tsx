// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AiTutor, type AiTutorService } from './AiTutor'

afterEach(cleanup)

function setup(answer: Awaited<ReturnType<AiTutorService['ask']>> = { success: true, answer: '**เครือข่าย** คือการเชื่อมต่อ\nอย่างเป็นระบบ' }) {
  const service: AiTutorService = {
    getCurrentUser: () => ({ name: 'ฟ้า', avatar: '🧙' }),
    getCurrentLessonTitle: () => 'อินเทอร์เน็ตเบื้องต้น',
    ask: vi.fn().mockResolvedValue(answer),
    reset: vi.fn(),
  }
  render(<AiTutor service={service} />)
  return service
}

describe('AiTutor', () => {
  it('opens with the original greeting, focuses the input, and preserves chat on close', async () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'เปิด AI Tutor' }))

    expect(screen.getByRole('dialog', { name: 'ผู้พิทักษ์ความรู้' })).toBeTruthy()
    expect(screen.getByText(/สวัสดีผู้กล้า/)).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByPlaceholderText('ถามข้ามาได้เลย...'))

    fireEvent.click(screen.getByRole('button', { name: 'ปิด AI Tutor' }))
    expect(screen.queryByRole('dialog', { name: 'ผู้พิทักษ์ความรู้' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'เปิด AI Tutor' }))
    expect(screen.getAllByText(/สวัสดีผู้กล้า/)).toHaveLength(1)
  })

  it('sends the question with player context and renders safe formatted output', async () => {
    const service = setup()
    fireEvent.click(screen.getByRole('button', { name: 'เปิด AI Tutor' }))
    const input = screen.getByPlaceholderText('ถามข้ามาได้เลย...')
    fireEvent.change(input, { target: { value: '<img src=x onerror=alert(1)> เครือข่ายคืออะไร' } })
    fireEvent.click(screen.getByRole('button', { name: 'ส่งคำถาม' }))

    expect(screen.getByText('กำลังร่ายมนต์หาคำตอบ...')).toBeTruthy()
    await waitFor(() => expect(service.ask).toHaveBeenCalledWith(
      '<img src=x onerror=alert(1)> เครือข่ายคืออะไร',
      'ชื่อผู้เล่น: ฟ้า, ด่านปัจจุบันที่กำลังผจญภัย: อินเทอร์เน็ตเบื้องต้น',
    ))
    expect(await screen.findByText('เครือข่าย', { selector: 'strong' })).toBeTruthy()
    expect(document.querySelector('#react-ai-tutor-root img')).toBeNull()
  })

  it('submits with Enter, ignores blank input, and prevents duplicate sends while loading', async () => {
    let resolve!: (value: { success: true; answer: string }) => void
    const pending = new Promise<{ success: true; answer: string }>((done) => { resolve = done })
    const service = setup()
    vi.mocked(service.ask).mockReturnValue(pending)
    fireEvent.click(screen.getByRole('button', { name: 'เปิด AI Tutor' }))
    const input = screen.getByPlaceholderText('ถามข้ามาได้เลย...')

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(service.ask).not.toHaveBeenCalled()
    fireEvent.change(input, { target: { value: 'ช่วยอธิบายหน่อย' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(service.ask).toHaveBeenCalledOnce()
    expect((screen.getByRole('button', { name: 'ส่งคำถาม' }) as HTMLButtonElement).disabled).toBe(true)

    resolve({ success: true, answer: 'ได้เลย' })
    expect(await screen.findByText('ได้เลย')).toBeTruthy()
  })

  it('sends a suggested quick question with one tap and hides the suggestions afterwards', async () => {
    const service = setup({ success: true, answer: 'จัดให้เลยผู้กล้า!' })
    fireEvent.click(screen.getByRole('button', { name: 'เปิด AI Tutor' }))

    const chip = screen.getByRole('button', { name: 'สรุปบทเรียนด่านนี้ให้หน่อย' })
    fireEvent.click(chip)
    await waitFor(() => expect(service.ask).toHaveBeenCalledWith(
      'สรุปบทเรียนด่านนี้ให้หน่อย',
      'ชื่อผู้เล่น: ฟ้า, ด่านปัจจุบันที่กำลังผจญภัย: อินเทอร์เน็ตเบื้องต้น',
    ))
    expect(await screen.findByText('จัดให้เลยผู้กล้า!')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'สรุปบทเรียนด่านนี้ให้หน่อย' })).toBeNull()
  })

  it('flags basic-mode answers so players know the real AI is not connected yet', async () => {
    setup({ success: true, answer: 'คำตอบพื้นฐาน', mode: 'local-fallback' })
    fireEvent.click(screen.getByRole('button', { name: 'เปิด AI Tutor' }))
    fireEvent.change(screen.getByPlaceholderText('ถามข้ามาได้เลย...'), { target: { value: 'คำถาม' } })
    fireEvent.click(screen.getByRole('button', { name: 'ส่งคำถาม' }))

    expect(await screen.findByText('คำตอบพื้นฐาน')).toBeTruthy()
    expect(screen.getByText('โหมดพื้นฐาน')).toBeTruthy()
  })

  it('starts a fresh conversation from the reset button', async () => {
    const service = setup({ success: true, answer: 'คำตอบเดิม' })
    fireEvent.click(screen.getByRole('button', { name: 'เปิด AI Tutor' }))
    fireEvent.change(screen.getByPlaceholderText('ถามข้ามาได้เลย...'), { target: { value: 'คำถาม' } })
    fireEvent.click(screen.getByRole('button', { name: 'ส่งคำถาม' }))
    expect(await screen.findByText('คำตอบเดิม')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'เริ่มบทสนทนาใหม่' }))
    expect(screen.queryByText('คำตอบเดิม')).toBeNull()
    expect(screen.getByText(/สวัสดีผู้กล้า/)).toBeTruthy()
    expect(service.reset).toHaveBeenCalledOnce()
  })

  it('shows service failures and lets the player try again', async () => {
    setup({ success: false, error: 'ระบบยังไม่พร้อม' })
    fireEvent.click(screen.getByRole('button', { name: 'เปิด AI Tutor' }))
    fireEvent.change(screen.getByPlaceholderText('ถามข้ามาได้เลย...'), { target: { value: 'คำถาม' } })
    fireEvent.click(screen.getByRole('button', { name: 'ส่งคำถาม' }))

    expect(await screen.findByText(/ระบบยังไม่พร้อม/)).toBeTruthy()
    expect((screen.getByRole('button', { name: 'ส่งคำถาม' }) as HTMLButtonElement).disabled).toBe(false)
  })
})
