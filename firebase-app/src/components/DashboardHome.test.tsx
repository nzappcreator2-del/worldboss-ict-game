// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DashboardHome, type DashboardHomeService } from './DashboardHome'

afterEach(cleanup)

function setup() {
  const service: DashboardHomeService = {
    getCurrentUser: () => ({ id: 'user-1', coins: 10, xp: 20 }),
    getNews: () => [{ id: 'n1', title: 'เปิดเทอมใหม่', content: 'พบกับด่านใหม่', icon: '📢', type: 'HOT NEWS', date: '2026-06-28' }],
    loadDailyStatus: vi.fn().mockResolvedValue({ success: true, progress: { play1: 1, correct5: 2 }, done: ['login'] }),
    claimQuest: vi.fn().mockResolvedValue({ success: true, coins: 25, xp: 20 }),
  }
  const onUserReward = vi.fn()
  render(<DashboardHome service={service} onUserReward={onUserReward} />)
  return { service, onUserReward }
}

describe('DashboardHome', () => {
  it('loads daily status when Adventure mode opens', async () => {
    const { service } = setup()
    expect(service.loadDailyStatus).not.toHaveBeenCalled()

    window.dispatchEvent(new Event('nextgen:open-home'))

    expect(await screen.findByText(/เปิดเทอมใหม่/)).toBeTruthy()
    expect(service.loadDailyStatus).toHaveBeenCalledWith('user-1')
  })

  it('renders claimed, claimable, and in-progress quests', async () => {
    setup()
    window.dispatchEvent(new Event('nextgen:open-home'))

    expect(await screen.findByText(/เคลียร์เรียบร้อย/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'รับรางวัล เริ่มการเดินทาง' })).toBeTruthy()
    expect(screen.getByText('2 / 5')).toBeTruthy()
  })

  it('claims a completed quest through Firestore and updates legacy user state', async () => {
    const { service, onUserReward } = setup()
    window.dispatchEvent(new Event('nextgen:open-home'))

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
