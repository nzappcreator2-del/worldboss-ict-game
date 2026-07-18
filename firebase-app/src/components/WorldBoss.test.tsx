// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WorldBoss, type WorldBossService } from './WorldBoss'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

const bosses = [
  { id: 'WB001', name: 'Mario', poseType: 'mario_fitness', targetReps: 10, maxHp: 100, rewardCoins: 100, rewardXp: 120 },
  { id: 'WB002_10', name: 'Safety', poseType: 'speed_runner', targetReps: 10, maxHp: 100, rewardCoins: 200, rewardXp: 200 },
]

function setup() {
  const popup = {} as Window
  const openGame = vi.fn((url: string): Window | null => {
    void url
    return popup
  })
  const service: WorldBossService = {
    getCurrentUser: () => ({ id: 'u1', name: 'ฟ้า', className: 'ป.5/1', avatar: '🧙', coins: 10, xp: 20 }),
    loadBosses: vi.fn().mockResolvedValue({ success: true, data: bosses }),
    loadLeaderboard: vi.fn().mockResolvedValue({ success: true, data: [{ userId: 'u1', name: 'ฟ้า', className: 'ป.5/1', bestTime: 7, date: '2026-06-29' }] }),
    submitScore: vi.fn().mockResolvedValue({ success: true, newCoins: 115, newXp: 140, level: 2, rank: 'SILVER', rewardCoins: 100, rewardXp: 120, previousBest: null, bestTime: 12.5, isPersonalBest: true, bossName: 'Mario' }),
  }
  const onExit = vi.fn()
  const onUserUpdate = vi.fn()
  const view = render(<WorldBoss service={service} onExit={onExit} onUserUpdate={onUserUpdate} openGame={openGame} createSession={() => 'session-1'} />)
  const page = view.container.querySelector('#page-world-boss')
  expect(page?.classList.contains('hidden')).toBe(true)
  fireEvent(window, new Event('nextgen:open-world-boss'))
  return { service, popup, openGame, onExit, onUserUpdate }
}

describe('WorldBoss', () => {
  it('loads Firestore configuration, groups WB002, and keeps the built-in neck quiz', async () => {
    const { service, onExit } = setup()
    expect(await screen.findByRole('heading', { name: /มินิเกมตรวจจับท่าทาง/ })).toBeTruthy()
    expect(service.loadBosses).toHaveBeenCalledOnce()
    expect(screen.getByText('มาริโอ้ฟิตเนสสะสมเหรียญ')).toBeTruthy()
    expect(screen.getByText('สมรภูมิมือปราบภัย AI')).toBeTruthy()
    expect(screen.getByText('วิทยาการคำนวณ ม.2')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /เริ่มเล่น/ })).toHaveLength(3)

    fireEvent.click(screen.getByRole('button', { name: 'กลับห้องโถงหลัก' }))
    expect(onExit).toHaveBeenCalledOnce()
  })

  it('shows arcade guide chips, rewards, and stored personal bests on the renovated hub', async () => {
    localStorage.setItem('wb_best_time_u1_WB001', '12.50')
    setup()
    await screen.findByText('มาริโอ้ฟิตเนสสะสมเหรียญ')
    expect(screen.getByText('อนุญาตสิทธิ์กล้อง')).toBeTruthy()
    expect(screen.getByText('แสงสว่างเพียงพอ')).toBeTruthy()
    expect(screen.getByText('อยู่กึ่งกลางเฟรม')).toBeTruthy()
    expect(screen.getAllByText('รางวัลสูงสุด')).toHaveLength(3)
    expect(screen.getAllByText('สถิติของคุณ')).toHaveLength(3)
    expect(screen.getByText('12.50')).toBeTruthy()
    expect(screen.getAllByText('ยังไม่มีสถิติ')).toHaveLength(2)
  })

  it('renders the reference arcade stage and production card shells', async () => {
    const { container } = render(
      <WorldBoss
        service={{
          getCurrentUser: () => ({ id: 'u1', name: 'ฟ้า', className: 'ป.5/1', avatar: '🧙', coins: 10, xp: 20 }),
          loadBosses: vi.fn().mockResolvedValue({ success: true, data: bosses }),
          loadLeaderboard: vi.fn().mockResolvedValue({ success: true, data: [] }),
          submitScore: vi.fn().mockResolvedValue({ success: true }),
        }}
        onExit={vi.fn()}
        onUserUpdate={vi.fn()}
      />,
    )
    fireEvent(window, new Event('nextgen:open-world-boss'))

    expect(await screen.findByRole('region', { name: 'AI Motion Arcade' })).toBeTruthy()
    expect(container.querySelector('.world-boss-arcade-stage')).toBeTruthy()
    expect(container.querySelectorAll('.arcade-game-card')).toHaveLength(3)
    expect(container.querySelectorAll('.arcade-game-card__energy')).toHaveLength(3)
  })

  it('loads leaderboard variants with the correct score unit', async () => {
    const { service } = setup()
    await screen.findByText('สมรภูมิมือปราบภัย AI')
    fireEvent.click(screen.getByRole('button', { name: 'ดูอันดับ สมรภูมิมือปราบภัย AI' }))
    await waitFor(() => expect(service.loadLeaderboard).toHaveBeenCalledWith('WB002_10'))
    expect(screen.getByText('7 ข้อ')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '20 วินาที' }))
    await waitFor(() => expect(service.loadLeaderboard).toHaveBeenCalledWith('WB002_20'))
  })

  it('opens a same-origin Vite game without a GAS callback URL', async () => {
    const { openGame } = setup()
    await screen.findByText('มาริโอ้ฟิตเนสสะสมเหรียญ')
    fireEvent.click(screen.getByRole('button', { name: 'เริ่มเล่น มาริโอ้ฟิตเนสสะสมเหรียญ' }))

    const target = new URL(vi.mocked(openGame).mock.calls[0][0])
    expect(target.origin).toBe(window.location.origin)
    expect(target.pathname).toBe('/world-boss/fitness.html')
    expect(target.searchParams.get('session')).toBe('session-1')
    expect(target.searchParams.get('webAppUrl')).toBeNull()
  })

  it('accepts one trusted popup result and persists it through Firestore', async () => {
    const { service, popup, onUserUpdate } = setup()
    await screen.findByText('มาริโอ้ฟิตเนสสะสมเหรียญ')
    fireEvent.click(screen.getByRole('button', { name: 'เริ่มเล่น มาริโอ้ฟิตเนสสะสมเหรียญ' }))

    const invalid = new MessageEvent('message', { origin: window.location.origin, data: { type: 'nextgen:world-boss-result', session: 'wrong', payload: { bossId: 'WB001', score: 12.5, bonusCoins: 5 } } })
    Object.defineProperty(invalid, 'source', { value: popup })
    fireEvent(window, invalid)
    expect(service.submitScore).not.toHaveBeenCalled()

    const valid = new MessageEvent('message', { origin: window.location.origin, data: { type: 'nextgen:world-boss-result', session: 'session-1', payload: { bossId: 'WB001', score: 12.5, bonusCoins: 5 } } })
    Object.defineProperty(valid, 'source', { value: popup })
    fireEvent(window, valid)
    await waitFor(() => expect(service.submitScore).toHaveBeenCalledWith('u1', 'WB001', 12.5, 5))
    expect(onUserUpdate).toHaveBeenCalledWith({ coins: 115, xp: 140, level: 2, rank: 'SILVER' })
    expect(await screen.findByText(/บันทึกสถิติสำเร็จ/)).toBeTruthy()

    fireEvent(window, valid)
    expect(service.submitScore).toHaveBeenCalledOnce()
  })

  it('shows configuration and popup failures without leaving the page', async () => {
    const { service, openGame } = setup()
    vi.mocked(service.loadBosses).mockResolvedValueOnce({ success: false, error: 'โหลดบอสไม่ได้' })
    fireEvent(window, new Event('nextgen:open-world-boss'))
    expect(await screen.findByText('โหลดบอสไม่ได้')).toBeTruthy()

    vi.mocked(service.loadBosses).mockResolvedValueOnce({ success: true, data: bosses })
    vi.mocked(openGame).mockReturnValueOnce(null)
    fireEvent(window, new Event('nextgen:open-world-boss'))
    await screen.findByText('มาริโอ้ฟิตเนสสะสมเหรียญ')
    fireEvent.click(screen.getByRole('button', { name: 'เริ่มเล่น มาริโอ้ฟิตเนสสะสมเหรียญ' }))
    expect(screen.getByText(/เบราว์เซอร์บล็อกหน้าต่างเกม/)).toBeTruthy()
  })
})
