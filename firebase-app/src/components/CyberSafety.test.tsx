// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CyberSafety, type CyberSafetyService, type CyberScenario } from './CyberSafety'

afterEach(cleanup)

const scenarios: CyberScenario[] = [
  { id: 's1', timeOfDay: 'เช้า', title: 'ลิงก์แปลกหน้า', text: 'มีคนส่งลิงก์น่าสงสัยมา', opt1: 'กดทันที', opt2: 'ถามผู้ใหญ่', answerIdx: 1, feedbackWrong: 'ลิงก์อาจขโมยข้อมูล', feedbackRight: 'ตรวจสอบก่อนปลอดภัยกว่า', imageSvg: 'https://example.com/cyber.jpg' },
  { id: 's2', timeOfDay: 'เย็น', title: 'รหัสผ่าน', text: 'เพื่อนขอรหัสผ่าน', opt1: 'ไม่บอกใคร', opt2: 'ส่งให้เพื่อน', answerIdx: 0, feedbackWrong: 'ห้ามแชร์รหัสผ่าน', feedbackRight: 'เก็บรหัสผ่านเป็นความลับ' },
]

function setup(data = scenarios) {
  const service: CyberSafetyService = {
    getCurrentUser: () => ({ id: 'u1', name: 'ฟ้า', avatar: '🧙', coins: 10, xp: 50 }),
    loadScenarios: vi.fn().mockResolvedValue({ success: true, data }),
    saveResult: vi.fn().mockResolvedValue({ success: true, coins: 35, xp: 75, level: 1, rank: 'BRONZE' }),
  }
  const onExit = vi.fn()
  const onUserUpdate = vi.fn()
  render(<CyberSafety service={service} onExit={onExit} onUserUpdate={onUserUpdate} />)
  window.dispatchEvent(new Event('nextgen:open-cyber-safety'))
  return { service, onExit, onUserUpdate }
}

describe('CyberSafety', () => {
  it('opens a cover and loads scenarios only when the mission starts', async () => {
    const { service } = setup()
    expect(await screen.findByRole('heading', { name: 'ผู้พิทักษ์ภัยไซเบอร์' })).toBeTruthy()
    expect(service.loadScenarios).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /เริ่มภารกิจ/ }))
    expect(await screen.findByText('มีคนส่งลิงก์น่าสงสัยมา')).toBeTruthy()
    expect(service.loadScenarios).toHaveBeenCalledOnce()
    const eventPanel = screen.getByTestId('cyber-event-panel')
    expect(eventPanel.className).toContain('bg-slate-950')
    expect(eventPanel.className).toContain('text-white')
  })

  it('reduces shield on a wrong answer and gives retry rewards only after correcting it', async () => {
    setup()
    fireEvent.click(await screen.findByRole('button', { name: /เริ่มภารกิจ/ }))
    await screen.findByText('มีคนส่งลิงก์น่าสงสัยมา')
    fireEvent.click(screen.getByRole('button', { name: 'ร่วมตัดสินใจ' }))
    fireEvent.click(screen.getByRole('button', { name: 'กดทันที' }))
    expect(screen.getByText('Cyber Shield: 75%')).toBeTruthy()
    expect(screen.getByText(/ลิงก์อาจขโมยข้อมูล/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'เลือกใหม่' }))
    fireEvent.click(screen.getByRole('button', { name: 'ถามผู้ใหญ่' }))
    expect(screen.getByText(/แก้ตัวสำเร็จ.*\+5/)).toBeTruthy()
  })

  it('saves final rewards once, synchronizes the user, and closes before returning home', async () => {
    const { service, onExit, onUserUpdate } = setup([scenarios[0]])
    fireEvent.click(await screen.findByRole('button', { name: /เริ่มภารกิจ/ }))
    await screen.findByText(scenarios[0].text)
    fireEvent.click(screen.getByRole('button', { name: 'ร่วมตัดสินใจ' }))
    fireEvent.click(screen.getByRole('button', { name: 'ถามผู้ใหญ่' }))
    fireEvent.click(screen.getByRole('button', { name: 'สรุปผล' }))
    expect(await screen.findByText('+20 Coins')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /ยืนยันบันทึกผล/ }))

    await waitFor(() => expect(service.saveResult).toHaveBeenCalledWith('u1', 100, 20, 20))
    await waitFor(() => expect(onUserUpdate).toHaveBeenCalledWith(expect.objectContaining({ coins: 35, xp: 75 })))
    expect(screen.getByRole('button', { name: /บันทึกแล้ว/ }).hasAttribute('disabled')).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'กลับสู่หน้าหลัก' }))

    expect(onExit).toHaveBeenCalledOnce()
    expect(document.getElementById('page-cyber-safety')?.className).toContain('hidden')
  })

  it('shows retry when scenario loading fails', async () => {
    const service: CyberSafetyService = { getCurrentUser: () => ({ id: 'u1', name: 'ฟ้า', coins: 0, xp: 0 }), loadScenarios: vi.fn().mockRejectedValue(new Error('offline')), saveResult: vi.fn() }
    render(<CyberSafety service={service} onExit={vi.fn()} onUserUpdate={vi.fn()} />)
    window.dispatchEvent(new Event('nextgen:open-cyber-safety'))
    fireEvent.click(await screen.findByRole('button', { name: /เริ่มภารกิจ/ }))
    expect(await screen.findByText('โหลดภารกิจไม่สำเร็จ')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'ลองใหม่' })).toBeTruthy()
  })
})
