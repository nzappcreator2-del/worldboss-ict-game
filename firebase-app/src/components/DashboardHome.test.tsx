// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DashboardHome, type DashboardHomeService } from './DashboardHome'

afterEach(cleanup)

function setup() {
  const service: DashboardHomeService = {
    getCurrentUser: () => ({ id: 'user-1', coins: 10, xp: 20 }),
    getNews: () => [
      { id: 'n1', title: 'เปิดเทอมใหม่', content: 'พบกับด่านใหม่', icon: '📢', type: 'NEWS', date: '2026-06-28' },
      { id: 'n2', title: 'กิจกรรมล่าสุด', content: 'รับรางวัลประจำสัปดาห์', icon: '🔥', type: 'HOT NEWS', date: '2026-07-05' },
    ],
    loadDailyStatus: vi.fn().mockResolvedValue({ success: true, progress: { play1: 1, correct5: 2 }, done: ['login'] }),
    claimQuest: vi.fn().mockResolvedValue({ success: true, coins: 25, xp: 20 }),
  }
  const onUserReward = vi.fn()
  render(<DashboardHome service={service} onUserReward={onUserReward} />)
  return { service, onUserReward }
}

describe('DashboardHome', () => {
  it('loads dashboard boards immediately and still refreshes when Adventure mode reopens', async () => {
    const { service } = setup()

    expect(await screen.findByText(/กิจกรรมล่าสุด/)).toBeTruthy()
    expect(service.loadDailyStatus).toHaveBeenCalledWith('user-1')
    expect(service.loadDailyStatus).toHaveBeenCalledTimes(1)

    window.dispatchEvent(new Event('nextgen:open-home'))
    await vi.waitFor(() => expect(service.loadDailyStatus).toHaveBeenCalledTimes(2))
  })

  it('shows pending quests on the small board and opens every quest in a detail panel', async () => {
    setup()
    window.dispatchEvent(new Event('nextgen:open-home'))

    const board = await screen.findByRole('button', { name: 'เปิดรายละเอียดภารกิจทั้งหมด' })
    expect(screen.queryByText(/เคลียร์เรียบร้อย/)).toBeNull()
    expect(screen.getByText('2 / 5')).toBeTruthy()
    fireEvent.click(board)

    expect(screen.getByRole('dialog', { name: 'รายละเอียดภารกิจประจำวัน' })).toBeTruthy()
    expect(await screen.findByText(/เคลียร์เรียบร้อย/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'รับรางวัล เริ่มการเดินทาง' })).toBeTruthy()
  })

  it('uses the admin-configured daily quest catalog when the service provides one', async () => {
    const service: DashboardHomeService = {
      getCurrentUser: () => ({ id: 'user-1' }),
      getNews: () => [],
      loadDailyStatus: vi.fn().mockResolvedValue({ success: true, progress: { correct5: 1 }, done: [] }),
      loadDailyQuests: vi.fn().mockResolvedValue({ success: true, data: [
        { id: 'correct5', title: 'นักตอบตัวจริง', description: 'ตอบถูกให้ครบ', target: 3, coins: 50, xp: 5, isActive: true },
      ] }),
      claimQuest: vi.fn().mockResolvedValue({ success: true }),
    }
    render(<DashboardHome service={service} onUserReward={vi.fn()} />)
    window.dispatchEvent(new Event('nextgen:open-home'))

    expect(await screen.findByText('นักตอบตัวจริง')).toBeTruthy()
    expect(screen.getByText('1 / 3')).toBeTruthy()
    expect(screen.getByText(/50 Coins/)).toBeTruthy()
    expect(screen.queryByText('เช็คอินประจำวัน')).toBeNull()
  })

  it('renders the MMO chat log with system lines and opens quests from the tracker event', async () => {
    setup()
    window.dispatchEvent(new Event('nextgen:open-home'))

    const log = await screen.findByTestId('dashboard-chat-log')
    expect(log.textContent).toContain('ยินดีต้อนรับ')
    expect(log.textContent).toContain('ภารกิจ')

    window.dispatchEvent(new Event('nextgen:open-daily-quests'))
    expect(await screen.findByRole('dialog', { name: 'รายละเอียดภารกิจประจำวัน' })).toBeTruthy()
  })

  it('shows only the latest announcement on the board and all announcements on demand', async () => {
    setup()
    window.dispatchEvent(new Event('nextgen:open-home'))

    const board = await screen.findByRole('button', { name: 'เปิดประกาศทั้งหมด' })
    expect(screen.getByText('กิจกรรมล่าสุด')).toBeTruthy()
    expect(screen.queryByText('เปิดเทอมใหม่')).toBeNull()
    fireEvent.click(board)

    expect(screen.getByRole('dialog', { name: 'ประกาศข่าวสารทั้งหมด' })).toBeTruthy()
    expect(screen.getAllByText('กิจกรรมล่าสุด')).toHaveLength(2)
    expect(screen.getByText('เปิดเทอมใหม่')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'ปิดรายละเอียด' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('updates the announcement board when Firestore publishes a realtime change', async () => {
    let publish: ((news: Array<{ id: string; title: string; content: string; date: string }>) => void) | undefined
    const stop = vi.fn()
    const realtimeService = {
      getCurrentUser: () => ({ id: 'user-1' }),
      getNews: () => [{ id: 'old', title: 'ประกาศเดิม', content: 'ข้อมูลเดิม', date: '2026-01-01' }],
      loadDailyStatus: vi.fn().mockResolvedValue({ success: true, progress: {}, done: [] }),
      claimQuest: vi.fn(),
      subscribeNews: vi.fn((listener: typeof publish) => { publish = listener; return stop }),
    } as DashboardHomeService & { subscribeNews(listener: NonNullable<typeof publish>): () => void }

    const view = render(<DashboardHome service={realtimeService} onUserReward={vi.fn()} />)
    expect(await screen.findByText('ประกาศเดิม')).toBeTruthy()
    expect(realtimeService.subscribeNews).toHaveBeenCalledTimes(1)

    act(() => publish?.([{ id: 'new', title: 'ประกาศล่าสุด', content: 'ข้อมูลใหม่จากหลังบ้าน', date: '2026-07-15' }]))
    expect(await screen.findByText('ประกาศล่าสุด')).toBeTruthy()
    expect(screen.queryByText('ประกาศเดิม')).toBeNull()

    view.unmount()
    expect(stop).toHaveBeenCalledTimes(1)
  })

  it('claims a completed quest through Firestore and updates legacy user state', async () => {
    const { service, onUserReward } = setup()
    window.dispatchEvent(new Event('nextgen:open-home'))

    fireEvent.click(await screen.findByRole('button', { name: 'เปิดรายละเอียดภารกิจทั้งหมด' }))
    fireEvent.click(await screen.findByRole('button', { name: 'รับรางวัล เริ่มการเดินทาง' }))

    expect(service.claimQuest).toHaveBeenCalledWith('user-1', 'play1', 0, 15)
    await vi.waitFor(() => expect(onUserReward).toHaveBeenCalledWith({ coins: 25, xp: 20 }))
    await vi.waitFor(() => expect(screen.getAllByText(/เคลียร์เรียบร้อย/)).toHaveLength(2))
  })

  it('shows a retry action when daily status cannot load', async () => {
    const service: DashboardHomeService = {
      getCurrentUser: () => ({ id: 'user-1' }),
      getNews: () => [],
      loadDailyStatus: vi.fn().mockRejectedValue(new Error('offline')),
      claimQuest: vi.fn(),
    }
    render(<DashboardHome service={service} onUserReward={vi.fn()} />)
    window.dispatchEvent(new Event('nextgen:open-home'))

    expect(await screen.findByText('โหลดภารกิจไม่สำเร็จ')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'ลองใหม่' })).toBeTruthy()
  })
})
