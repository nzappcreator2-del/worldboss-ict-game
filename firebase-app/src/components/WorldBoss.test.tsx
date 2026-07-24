// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WorldBoss, type WorldBossService } from './WorldBoss'
import { gameAudio } from '../services/gameAudio'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

const MARIO_URL = 'https://banwanghin-ed.web.app/games/mario-education/index.html'
const MATH_URL = 'https://banwanghin-ed.web.app/gamification/math-speed-race-3d'

const bosses = [
  { id: 'WB001', name: 'Mario', poseType: 'mario_fitness', targetReps: 10, maxHp: 100, rewardCoins: 100, rewardXp: 120 },
  { id: 'WB002_10', name: 'Safety', poseType: 'speed_runner', targetReps: 10, maxHp: 100, rewardCoins: 200, rewardXp: 200 },
]

function setup() {
  const popup = { closed: false } as unknown as Window
  const openGame = vi.fn((url: string): Window | null => {
    void url
    return popup
  })
  const service: WorldBossService = {
    getCurrentUser: () => ({ id: 'u1', name: 'ฟ้า', className: 'ป.5/1', avatar: '🧙', coins: 10, xp: 20 }),
    loadBosses: vi.fn().mockResolvedValue({ success: true, data: bosses }),
    loadLeaderboard: vi.fn().mockResolvedValue({ success: true, data: [{ userId: 'u1', name: 'ฟ้า', className: 'ป.5/1', bestTime: 7, date: '2026-06-29' }] }),
    submitScore: vi.fn().mockResolvedValue({ success: true, newCoins: 115, newXp: 140, level: 2, rank: 'SILVER', rewardCoins: 100, rewardXp: 120, previousBest: null, bestTime: 12.5, isPersonalBest: true, bossName: 'AI Safety' }),
  }
  const onExit = vi.fn()
  const onUserUpdate = vi.fn()
  const view = render(<WorldBoss service={service} onExit={onExit} onUserUpdate={onUserUpdate} openGame={openGame} createSession={() => 'session-1'} />)
  const page = view.container.querySelector('#page-world-boss')
  expect(page?.classList.contains('hidden')).toBe(true)
  fireEvent(window, new Event('nextgen:open-world-boss'))
  return { service, popup, openGame, onExit, onUserUpdate, container: view.container }
}

async function enterMotionZone() {
  await screen.findByText('Mario Education')
  fireEvent.click(screen.getByRole('button', { name: 'เข้าสู่ Motion & AR Arcade' }))
  await screen.findByText('สมรภูมิมือปราบภัย AI')
}

describe('WorldBoss top-level arcade menu', () => {
  it('shows the three arcade menu cards and exits to the main hall', async () => {
    const { onExit } = setup()
    expect(await screen.findByRole('heading', { name: /ศูนย์รวมมินิเกม/ })).toBeTruthy()
    expect(screen.getByText('Mario Education')).toBeTruthy()
    expect(screen.getByText('Math Speed Race 3D')).toBeTruthy()
    expect(screen.getByText('Motion & AR Arcade')).toBeTruthy()
    // The menu is a mode chooser, not a scoreboard — no reward columns here.
    expect(screen.queryByText('รางวัลสูงสุด')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'กลับห้องโถงหลัก' }))
    expect(onExit).toHaveBeenCalledOnce()
  })

  it('shows the game-mode guide chips on the menu', async () => {
    setup()
    await screen.findByText('Mario Education')
    expect(screen.getByText('เลือกโหมดเกม')).toBeTruthy()
    expect(screen.getByText('Mario 8-Bit')).toBeTruthy()
    expect(screen.getByText('Math Race 3D')).toBeTruthy()
    expect(screen.getByText('Motion & AR')).toBeTruthy()
  })

  it('renders the reference arcade stage with exactly three menu card shells', async () => {
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

  it('opens Mario Education in a new tab, bypassing the session/score pipeline', async () => {
    const { openGame, service } = setup()
    await screen.findByText('Mario Education')
    fireEvent.click(screen.getByRole('button', { name: 'เริ่มเล่น Mario Education' }))

    expect(openGame).toHaveBeenCalledWith(MARIO_URL)
    expect(await screen.findByText(/เปิด Mario Education ในแท็บใหม่แล้ว/)).toBeTruthy()
    expect(service.submitScore).not.toHaveBeenCalled()
  })

  it('opens Math Speed Race 3D in a new tab, bypassing the session/score pipeline', async () => {
    const { openGame, service } = setup()
    await screen.findByText('Math Speed Race 3D')
    fireEvent.click(screen.getByRole('button', { name: 'เริ่มเล่น Math Speed Race 3D' }))

    expect(openGame).toHaveBeenCalledWith(MATH_URL)
    expect(await screen.findByText(/เปิด Math Speed Race 3D ในแท็บใหม่แล้ว/)).toBeTruthy()
    expect(service.submitScore).not.toHaveBeenCalled()
  })

  it('lets students launch the external games without being logged in', async () => {
    const openGame = vi.fn((): Window => ({} as Window))
    const service: WorldBossService = {
      getCurrentUser: () => null,
      loadBosses: vi.fn().mockResolvedValue({ success: true, data: bosses }),
      loadLeaderboard: vi.fn(),
      submitScore: vi.fn(),
    }
    render(<WorldBoss service={service} onExit={vi.fn()} onUserUpdate={vi.fn()} openGame={openGame} createSession={() => 'session-1'} />)
    fireEvent(window, new Event('nextgen:open-world-boss'))

    await screen.findByText('Math Speed Race 3D')
    fireEvent.click(screen.getByRole('button', { name: 'เริ่มเล่น Math Speed Race 3D' }))

    expect(openGame).toHaveBeenCalledWith(MATH_URL)
    expect(screen.queryByText('กรุณาล็อกอินก่อนเริ่ม World Boss')).toBeNull()
  })

  it('reports a blocked pop-up for an external game without leaving the menu', async () => {
    const { openGame } = setup()
    await screen.findByText('Mario Education')
    vi.mocked(openGame).mockReturnValueOnce(null)
    fireEvent.click(screen.getByRole('button', { name: 'เริ่มเล่น Mario Education' }))
    expect(screen.getByText(/เบราว์เซอร์บล็อกหน้าต่างเกม/)).toBeTruthy()
    // Still on the menu.
    expect(screen.getByText('Motion & AR Arcade')).toBeTruthy()
  })
})

describe('WorldBoss Motion & AR zone', () => {
  it('reveals the relocated camera games plus a coming-soon slot, and returns to the menu', async () => {
    setup()
    await enterMotionZone()

    expect(screen.getByRole('heading', { name: /มินิเกมตรวจจับท่าทาง/ })).toBeTruthy()
    expect(screen.getByText('สมรภูมิมือปราบภัย AI')).toBeTruthy()
    expect(screen.getByText('Neck-Tilt Quiz AI')).toBeTruthy()
    // Extensible: a coming-soon placeholder fills the third cabinet slot.
    expect(screen.getByText('เปิดรับมินิเกมใหม่')).toBeTruthy()
    expect(screen.getByText('อนุญาตสิทธิ์กล้อง')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /เริ่มเล่น/ })).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: 'กลับเมนูมินิเกม' }))
    expect(await screen.findByText('Math Speed Race 3D')).toBeTruthy()
    expect(screen.queryByText('สมรภูมิมือปราบภัย AI')).toBeNull()
  })

  it('shows rewards and stored personal bests for the camera games', async () => {
    localStorage.setItem('wb_best_time_u1_WB002', '12.50')
    setup()
    await enterMotionZone()

    expect(screen.getAllByText('รางวัลสูงสุด')).toHaveLength(2)
    expect(screen.getAllByText('สถิติของคุณ')).toHaveLength(2)
    expect(screen.getByText('12.50')).toBeTruthy()
    expect(screen.getAllByText('ยังไม่มีสถิติ')).toHaveLength(1)
  })

  it('loads leaderboard variants with the correct score unit', async () => {
    const { service } = setup()
    await enterMotionZone()
    fireEvent.click(screen.getByRole('button', { name: 'ดูอันดับ สมรภูมิมือปราบภัย AI' }))
    await waitFor(() => expect(service.loadLeaderboard).toHaveBeenCalledWith('WB002_10'))
    expect(screen.getByText('7 ข้อ')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '20 วินาที' }))
    await waitFor(() => expect(service.loadLeaderboard).toHaveBeenCalledWith('WB002_20'))
  })

  it('opens a same-origin Vite game without a GAS callback URL', async () => {
    const { openGame } = setup()
    await enterMotionZone()
    fireEvent.click(screen.getByRole('button', { name: 'เริ่มเล่น สมรภูมิมือปราบภัย AI' }))

    const target = new URL(vi.mocked(openGame).mock.calls[0][0])
    expect(target.origin).toBe(window.location.origin)
    expect(target.pathname).toBe('/world-boss/fitness.html')
    expect(target.searchParams.get('session')).toBe('session-1')
    expect(target.searchParams.get('webAppUrl')).toBeNull()
  })

  it('accepts one trusted popup result and persists it through Firestore', async () => {
    const { service, popup, onUserUpdate } = setup()
    await enterMotionZone()
    fireEvent.click(screen.getByRole('button', { name: 'เริ่มเล่น สมรภูมิมือปราบภัย AI' }))

    const invalid = new MessageEvent('message', { origin: window.location.origin, data: { type: 'nextgen:world-boss-result', session: 'wrong', payload: { bossId: 'WB002_10', score: 12.5, bonusCoins: 5 } } })
    Object.defineProperty(invalid, 'source', { value: popup })
    fireEvent(window, invalid)
    expect(service.submitScore).not.toHaveBeenCalled()

    const valid = new MessageEvent('message', { origin: window.location.origin, data: { type: 'nextgen:world-boss-result', session: 'session-1', payload: { bossId: 'WB002_10', score: 12.5, bonusCoins: 5 } } })
    Object.defineProperty(valid, 'source', { value: popup })
    fireEvent(window, valid)
    await waitFor(() => expect(service.submitScore).toHaveBeenCalledWith('u1', 'WB002_10', 12.5, 5))
    expect(onUserUpdate).toHaveBeenCalledWith({ coins: 115, xp: 140, level: 2, rank: 'SILVER' })
    expect(await screen.findByText(/บันทึกสถิติสำเร็จ/)).toBeTruthy()

    fireEvent(window, valid)
    expect(service.submitScore).toHaveBeenCalledOnce()
  })

  it('surfaces a configuration load failure', async () => {
    const { service } = setup()
    vi.mocked(service.loadBosses).mockResolvedValueOnce({ success: false, error: 'โหลดบอสไม่ได้' })
    fireEvent(window, new Event('nextgen:open-world-boss'))
    expect(await screen.findByText('โหลดบอสไม่ได้')).toBeTruthy()
  })
})

describe('WorldBoss hub music while a game tab is open', () => {
  it('stops the hub background music synchronously the instant an external game opens', async () => {
    const stopImmediately = vi.spyOn(gameAudio, 'stopImmediately')
    setup()
    await screen.findByText('Mario Education')
    fireEvent.click(screen.getByRole('button', { name: 'เริ่มเล่น Mario Education' }))

    // Must use the synchronous stop, not the rAF-fade setMusic(null), so audio
    // halts even while this tab is backgrounding behind the new game tab.
    expect(stopImmediately).toHaveBeenCalledOnce()
  })

  it('stops the hub background music synchronously the instant a motion/camera game opens', async () => {
    const stopImmediately = vi.spyOn(gameAudio, 'stopImmediately')
    setup()
    await enterMotionZone()
    fireEvent.click(screen.getByRole('button', { name: 'เริ่มเล่น สมรภูมิมือปราบภัย AI' }))

    expect(stopImmediately).toHaveBeenCalledOnce()
  })

  it('does not resume music while the launched game tab is still open', async () => {
    const setMusic = vi.spyOn(gameAudio, 'setMusic')
    setup()
    await screen.findByText('Mario Education')
    fireEvent.click(screen.getByRole('button', { name: 'เริ่มเล่น Mario Education' }))
    setMusic.mockClear()

    // Real-time wait spanning at least one poll tick of the (still-open) popup.
    await new Promise((resolve) => setTimeout(resolve, 1200))
    expect(setMusic).not.toHaveBeenCalled()
  })

  it('resumes the hub music once the game tab closes, while still on the mini-game hub', async () => {
    const setMusic = vi.spyOn(gameAudio, 'setMusic')
    const { popup, container } = setup()
    await screen.findByText('Mario Education')
    fireEvent.click(screen.getByRole('button', { name: 'เริ่มเล่น Mario Education' }))

    // Mirrors legacy showPage(): the section loses "hidden" while it is the active page.
    container.querySelector('#page-world-boss')!.classList.remove('hidden')
    ;(popup as unknown as { closed: boolean }).closed = true

    await waitFor(() => expect(setMusic).toHaveBeenCalledWith('bossBattle'), { timeout: 3000 })
  })

  it('does not force the hub music back on if the player already navigated away before the tab closed', async () => {
    const setMusic = vi.spyOn(gameAudio, 'setMusic')
    const { popup, container } = setup()
    await screen.findByText('Mario Education')
    fireEvent.click(screen.getByRole('button', { name: 'เริ่มเล่น Mario Education' }))
    setMusic.mockClear()

    // Page stays hidden (student navigated elsewhere) when the tab closes.
    expect(container.querySelector('#page-world-boss')!.classList.contains('hidden')).toBe(true)
    ;(popup as unknown as { closed: boolean }).closed = true

    await new Promise((resolve) => setTimeout(resolve, 1200))
    expect(setMusic).not.toHaveBeenCalledWith('bossBattle')
  })

  it('keeps music off until every simultaneously open game tab has closed', async () => {
    const setMusic = vi.spyOn(gameAudio, 'setMusic')
    const popupA = { closed: false } as unknown as Window
    const popupB = { closed: false } as unknown as Window
    const openGame = vi.fn().mockReturnValueOnce(popupA).mockReturnValueOnce(popupB)
    const service: WorldBossService = {
      getCurrentUser: () => ({ id: 'u1', name: 'ฟ้า', className: 'ป.5/1', avatar: '🧙', coins: 10, xp: 20 }),
      loadBosses: vi.fn().mockResolvedValue({ success: true, data: bosses }),
      loadLeaderboard: vi.fn(),
      submitScore: vi.fn(),
    }
    const view = render(<WorldBoss service={service} onExit={vi.fn()} onUserUpdate={vi.fn()} openGame={openGame} createSession={() => 's1'} />)
    fireEvent(window, new Event('nextgen:open-world-boss'))
    view.container.querySelector('#page-world-boss')!.classList.remove('hidden')

    await screen.findByText('Mario Education')
    fireEvent.click(screen.getByRole('button', { name: 'เริ่มเล่น Mario Education' }))
    fireEvent.click(screen.getByRole('button', { name: 'เริ่มเล่น Math Speed Race 3D' }))
    setMusic.mockClear()

    ;(popupA as unknown as { closed: boolean }).closed = true
    await new Promise((resolve) => setTimeout(resolve, 1200))
    expect(setMusic).not.toHaveBeenCalledWith('bossBattle')

    ;(popupB as unknown as { closed: boolean }).closed = true
    await waitFor(() => expect(setMusic).toHaveBeenCalledWith('bossBattle'), { timeout: 3000 })
  })
})
