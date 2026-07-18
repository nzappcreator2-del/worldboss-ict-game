// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdminPanel, type AdminService } from './AdminPanel'

afterEach(cleanup)

const lesson = { id: 'L1', title: 'อินเทอร์เน็ต', description: 'พื้นฐาน', icon: '🌐', isActive: true, enablePretest: false, questionCount: 2 }
const student = { id: 'u1', name: 'ฟ้า', class: 'ป.5/1', avatar: '🧙', xp: 120, rank: 'SILVER', level: 2, currentLesson: 'อินเทอร์เน็ต' }

function setup(overrides: Partial<AdminService> = {}) {
  const service: AdminService = {
    verify: vi.fn().mockResolvedValue({ success: true, isValid: true }),
    logout: vi.fn().mockResolvedValue(undefined),
    loadLessons: vi.fn().mockResolvedValue({ success: true, data: [lesson] }),
    saveLesson: vi.fn().mockResolvedValue({ success: true, id: 'L2' }),
    deleteLesson: vi.fn().mockResolvedValue({ success: true }),
    loadQuestions: vi.fn().mockResolvedValue({ success: true, data: [] }),
    saveQuestions: vi.fn().mockResolvedValue({ success: true }),
    loadStudents: vi.fn().mockResolvedValue({ success: true, data: [student] }),
    resetStudent: vi.fn().mockResolvedValue({ success: true }),
    deleteStudent: vi.fn().mockResolvedValue({ success: true }),
    unbindStudent: vi.fn().mockResolvedValue({ success: true }),
    resetAllStudents: vi.fn().mockResolvedValue({ success: true, count: 1 }),
    loadSettings: vi.fn().mockResolvedValue({ success: true, data: { TimerPerQuestion: 30, Classes: 'ป.4,ป.5', Rooms: '1,2' } }),
    saveSettings: vi.fn().mockResolvedValue({ success: true }),
    loadNews: vi.fn().mockResolvedValue({ success: true, data: [{ id: 'n1', title: 'เปิดเทอม', content: 'ยินดีต้อนรับ', icon: '📢', type: 'NEWS', date: '29/6/2569', isActive: true }] }),
    saveNews: vi.fn().mockResolvedValue({ success: true }),
    deleteNews: vi.fn().mockResolvedValue({ success: true }),
    loadReports: vi.fn().mockResolvedValue({ success: true, data: [{ timestamp: '29/6/2569', name: 'ฟ้า', class: 'ป.5/1', totalQuestions: 10, score: 8, status: 'Passed' }] }),
    generateProgressReport: vi.fn().mockResolvedValue({ success: true, answer: 'กำลังพัฒนาได้ดี' }),
    loadDailyQuests: vi.fn().mockResolvedValue({ success: true, data: [
      { id: 'login', title: 'เช็คอินประจำวัน', description: 'เข้าสู่ระบบผจญภัยวันนี้', target: 1, coins: 20, xp: 0, isActive: true },
      { id: 'play1', title: 'เริ่มการเดินทาง', description: 'ออกบุกโจมตีด่านต่าง ๆ 1 ครั้ง', target: 1, coins: 0, xp: 15, isActive: true },
      { id: 'correct5', title: 'ผู้เจนจัดความรู้', description: 'สะสมการตอบคำถามถูก 5 ข้อ', target: 5, coins: 30, xp: 0, isActive: true },
    ] }),
    saveDailyQuest: vi.fn().mockResolvedValue({ success: true }),
    loadWorldBosses: vi.fn().mockResolvedValue({ success: true, data: [{ id: 'WB001', name: 'บอสสควอช', poseType: 'squat', targetReps: 20, maxHp: 100, rewardCoins: 100, rewardXp: 100, isActive: true }] }),
    saveWorldBoss: vi.fn().mockResolvedValue({ success: true, id: 'WB002' }),
    deleteWorldBoss: vi.fn().mockResolvedValue({ success: true }),
    loadCyberScenarios: vi.fn().mockResolvedValue({ success: true, data: [{ id: 'CS001', timeOfDay: 'เช้า', title: 'ลิงก์ปริศนา', text: 'มีคนส่งลิงก์แปลกมาให้', opt1: 'กดเลย', opt2: 'ไม่กดและแจ้งครู', answerIdx: 1, feedbackWrong: '', feedbackRight: '' }] }),
    saveCyberScenario: vi.fn().mockResolvedValue({ success: true, id: 'CS002' }),
    deleteCyberScenario: vi.fn().mockResolvedValue({ success: true }),
    ...overrides,
  }
  const onExit = vi.fn()
  render(<AdminPanel service={service} onExit={onExit} confirmAction={() => true} downloadCsv={vi.fn()} />)
  fireEvent(window, new Event('nextgen:open-admin'))
  return { service, onExit }
}

async function login() {
  fireEvent.change(screen.getByLabelText('รหัสผ่านผู้ดูแลระบบ'), { target: { value: 'secret123' } })
  fireEvent.click(screen.getByRole('button', { name: 'เข้าสู่ระบบ' }))
  await screen.findByRole('heading', { name: 'ศูนย์บัญชาการผู้ดูแลระบบ' })
}

describe('AdminPanel', () => {
  it('keeps the authenticated page visible over the legacy #page-admin display rule', async () => {
    setup()
    await login()

    const heading = screen.getByRole('heading', { name: 'ศูนย์บัญชาการผู้ดูแลระบบ' })
    expect(heading.closest('section')?.style.display).toBe('block')
  })

  it('keeps the login closed on invalid credentials and loads lessons after a valid login', async () => {
    const verify = vi.fn().mockResolvedValueOnce({ success: true, isValid: false }).mockResolvedValueOnce({ success: true, isValid: true })
    const { service } = setup({ verify })
    fireEvent.change(screen.getByLabelText('รหัสผ่านผู้ดูแลระบบ'), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: 'เข้าสู่ระบบ' }))
    expect((await screen.findByRole('alert')).textContent).toContain('รหัสผ่านไม่ถูกต้อง')
    fireEvent.change(screen.getByLabelText('รหัสผ่านผู้ดูแลระบบ'), { target: { value: 'secret123' } })
    fireEvent.click(screen.getByRole('button', { name: 'เข้าสู่ระบบ' }))
    expect(await screen.findByText('อินเทอร์เน็ต')).toBeTruthy()
    expect(service.loadLessons).toHaveBeenCalledOnce()
  })

  it('edits daily quest rewards from the daily tab', async () => {
    const { service } = setup()
    await login()
    fireEvent.click(screen.getByRole('button', { name: 'ภารกิจรายวัน' }))
    await screen.findByText('ผู้เจนจัดความรู้')

    fireEvent.click(screen.getByRole('button', { name: 'แก้ไขภารกิจ ผู้เจนจัดความรู้' }))
    fireEvent.change(screen.getByLabelText('เป้าหมายภารกิจ'), { target: { value: '3' } })
    fireEvent.change(screen.getByLabelText('รางวัลเหรียญ'), { target: { value: '50' } })
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกภารกิจ' }))

    await waitFor(() => expect(service.saveDailyQuest).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'correct5', target: 3, coins: 50 }),
      'secret123',
    ))
  })

  it('creates a world boss and deletes an existing one', async () => {
    const { service } = setup()
    await login()
    fireEvent.click(screen.getByRole('button', { name: 'เวิลด์บอส' }))
    await screen.findByText(/บอสสควอช/)

    fireEvent.click(screen.getByRole('button', { name: 'เพิ่มบอส' }))
    fireEvent.change(screen.getByLabelText('ชื่อบอส'), { target: { value: 'บอสกระโดดตบ' } })
    fireEvent.change(screen.getByLabelText('ประเภทท่า'), { target: { value: 'jumping-jack' } })
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกเวิลด์บอส' }))
    await waitFor(() => expect(service.saveWorldBoss).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'บอสกระโดดตบ', poseType: 'jumping-jack' }),
      'secret123',
    ))

    fireEvent.click(screen.getByRole('button', { name: 'ลบบอส บอสสควอช' }))
    await waitFor(() => expect(service.deleteWorldBoss).toHaveBeenCalledWith('WB001', 'secret123'))
  })

  it('manages cyber safety scenarios end to end', async () => {
    const { service } = setup()
    await login()
    fireEvent.click(screen.getByRole('button', { name: 'ไซเบอร์' }))
    await screen.findByText(/ลิงก์ปริศนา/)

    fireEvent.click(screen.getByRole('button', { name: 'เพิ่มสถานการณ์' }))
    fireEvent.change(screen.getByLabelText('ข้อความสถานการณ์'), { target: { value: 'เพื่อนขอรหัสผ่านเกม' } })
    fireEvent.change(screen.getByLabelText('ตัวเลือกที่ 1'), { target: { value: 'ให้เลย' } })
    fireEvent.change(screen.getByLabelText('ตัวเลือกที่ 2'), { target: { value: 'ไม่ให้เด็ดขาด' } })
    fireEvent.change(screen.getByLabelText('คำตอบที่ถูกต้อง'), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกสถานการณ์' }))
    await waitFor(() => expect(service.saveCyberScenario).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'เพื่อนขอรหัสผ่านเกม', answerIdx: 1 }),
      'secret123',
    ))
  })

  it('creates lessons and manages both choice and matching question batches', async () => {
    const { service } = setup()
    await login()
    fireEvent.click(screen.getByRole('button', { name: 'เพิ่มบทเรียน' }))
    fireEvent.change(screen.getByLabelText('ชื่อบทเรียน'), { target: { value: 'ความปลอดภัยไซเบอร์' } })
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกบทเรียน' }))
    await waitFor(() => expect(service.saveLesson).toHaveBeenCalledWith(expect.objectContaining({ title: 'ความปลอดภัยไซเบอร์' }), 'secret123'))

    fireEvent.click(screen.getByRole('button', { name: 'เพิ่มบทเรียน' }))
    fireEvent.change(screen.getByLabelText('ชื่อบทเรียน'), { target: { value: 'ด่านภูเขาไฟ' } })
    fireEvent.click(screen.getByRole('radio', { name: 'เทมเพลต เตาหลอมภูเขาไฟ' }))
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกบทเรียน' }))
    await waitFor(() => expect(service.saveLesson).toHaveBeenCalledWith(expect.objectContaining({ title: 'ด่านภูเขาไฟ', mapStyle: 'volcano-forge' }), 'secret123'))

    fireEvent.click(screen.getByRole('button', { name: 'จัดการข้อสอบ อินเทอร์เน็ต' }))
    await screen.findByRole('heading', { name: 'จัดการข้อสอบ: อินเทอร์เน็ต' })
    fireEvent.change(screen.getByLabelText('คำถามข้อ 1'), { target: { value: 'ข้อใดถูกต้อง' } })
    fireEvent.change(screen.getByLabelText('รูปแบบข้อ 1'), { target: { value: 'matching' } })
    fireEvent.change(screen.getByLabelText('ด้านซ้ายคู่ 1 ข้อ 1'), { target: { value: 'CPU' } })
    fireEvent.change(screen.getByLabelText('ด้านขวาคู่ 1 ข้อ 1'), { target: { value: 'หน่วยประมวลผล' } })
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกข้อสอบ' }))
    await waitFor(() => expect(service.saveQuestions).toHaveBeenCalledWith('L1', 'posttest', [expect.objectContaining({ text: 'ข้อใดถูกต้อง', pattern: 'matching', matchingPairs: [{ left: 'CPU', right: 'หน่วยประมวลผล' }] })], 'secret123'))
  })

  it('filters students, generates a local progress report, and performs confirmed reset actions', async () => {
    const { service } = setup()
    await login()
    fireEvent.click(screen.getByRole('button', { name: 'นักเรียน' }))
    expect(await screen.findByText(/ฟ้า/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'วิเคราะห์ ฟ้า' }))
    expect(await screen.findByText('กำลังพัฒนาได้ดี')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'ปิดรายงาน' }))
    fireEvent.click(screen.getByRole('button', { name: 'รีเซ็ต ฟ้า' }))
    await waitFor(() => expect(service.resetStudent).toHaveBeenCalledWith('u1', 'secret123'))
    fireEvent.click(screen.getByRole('button', { name: 'รีเซ็ตทั้งหมด' }))
    await waitFor(() => expect(service.resetAllStudents).toHaveBeenCalledWith('', 'secret123'))
  })

  it('edits only public settings and never renders secret fields', async () => {
    const { service } = setup()
    await login()
    fireEvent.click(screen.getByRole('button', { name: 'ตั้งค่า' }))
    expect((await screen.findByLabelText('เวลาต่อข้อ (วินาที)') as HTMLInputElement).value).toBe('30')
    expect(screen.queryByText(/Gemini API/i)).toBeNull()
    expect(screen.queryByText(/Admin PIN/i)).toBeNull()
    fireEvent.change(screen.getByLabelText('เวลาต่อข้อ (วินาที)'), { target: { value: '45' } })
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกการตั้งค่า' }))
    await waitFor(() => expect(service.saveSettings).toHaveBeenCalledWith(expect.objectContaining({ TimerPerQuestion: 45 }), 'secret123'))
  })

  it('manages announcements and loads report totals', async () => {
    const { service } = setup()
    await login()
    fireEvent.click(screen.getByRole('button', { name: 'ประกาศ' }))
    expect(await screen.findByText(/เปิดเทอม/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'เพิ่มประกาศ' }))
    const dialog = screen.getByRole('dialog', { name: 'จัดการประกาศ' })
    fireEvent.change(within(dialog).getByLabelText('หัวข้อประกาศ'), { target: { value: 'กิจกรรมใหม่' } })
    fireEvent.change(within(dialog).getByLabelText('เนื้อหาประกาศ'), { target: { value: 'เริ่มวันจันทร์' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'บันทึกประกาศ' }))
    await waitFor(() => expect(service.saveNews).toHaveBeenCalledWith(expect.objectContaining({ title: 'กิจกรรมใหม่' }), 'secret123'))

    fireEvent.click(screen.getByRole('button', { name: 'รายงาน' }))
    await screen.findByLabelText('เลือกบทเรียนสำหรับรายงาน')
    fireEvent.change(screen.getByLabelText('เลือกบทเรียนสำหรับรายงาน'), { target: { value: 'L1' } })
    await waitFor(() => expect(service.loadReports).toHaveBeenCalledWith('L1', 'secret123'))
    expect(await screen.findByText('คะแนนเฉลี่ย 8')).toBeTruthy()
  })
})
