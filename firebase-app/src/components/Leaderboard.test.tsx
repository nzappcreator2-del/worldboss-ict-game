// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Leaderboard, type LeaderboardService } from './Leaderboard'

afterEach(cleanup)

const players = [
  { id: 'u2', name: 'เมฆ', class: 'ป.6/1', xp: 900, level: 10, rank: 'GOLD', avatar: '🧝' },
  { id: 'u1', name: 'ฟ้า', class: 'ป.6/1', xp: 700, level: 8, rank: 'GOLD', avatar: '🧙' },
  { id: 'u3', name: 'ดาว', class: 'ป.6/2', xp: 400, level: 5, rank: 'SILVER', avatar: '🥷' },
]

function setup(overrides: Partial<LeaderboardService> = {}) {
  const service: LeaderboardService = {
    getCurrentUser: () => ({ id: 'u1', class: 'ป.6/1' }),
    loadPlayers: vi.fn().mockResolvedValue({ success: true, data: players }),
    loadGuilds: vi.fn().mockResolvedValue({ success: true, data: [
      { name: 'ป.6/1', totalXp: 1600, memberCount: 2 },
      { name: 'ป.6/2', totalXp: 400, memberCount: 1 },
    ] }),
    ...overrides,
  }
  render(<Leaderboard service={service} />)
  return service
}

describe('Leaderboard', () => {
  it('loads individual rankings when the legacy sidebar opens the tab', async () => {
    const service = setup()
    expect(service.loadPlayers).not.toHaveBeenCalled()

    window.dispatchEvent(new Event('nextgen:open-leaderboard'))

    expect(await screen.findAllByText('เมฆ')).toHaveLength(2)
    expect(screen.getByText('คุณ')).toBeTruthy()
    expect(service.loadPlayers).toHaveBeenCalledOnce()
  })

  it('switches to guild rankings and highlights the current class', async () => {
    const service = setup()
    window.dispatchEvent(new Event('nextgen:open-leaderboard'))
    await screen.findAllByText('เมฆ')

    fireEvent.click(screen.getByRole('button', { name: 'อันดับกิลด์' }))

    expect(await screen.findByText('สมาชิก 2 คน')).toBeTruthy()
    expect(screen.getByText('กิลด์ของคุณ')).toBeTruthy()
    expect(service.loadGuilds).toHaveBeenCalledOnce()
  })

  it('shows an empty state when no players exist', async () => {
    setup({ loadPlayers: vi.fn().mockResolvedValue({ success: true, data: [] }) })
    window.dispatchEvent(new Event('nextgen:open-leaderboard'))

    expect(await screen.findByText('ยังไม่มีข้อมูลผู้เล่น')).toBeTruthy()
  })

  it('shows a retry action when Firestore loading fails', async () => {
    setup({ loadPlayers: vi.fn().mockRejectedValue(new Error('offline')) })
    window.dispatchEvent(new Event('nextgen:open-leaderboard'))

    expect(await screen.findByText('โหลดอันดับไม่สำเร็จ')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'ลองใหม่' })).toBeTruthy()
  })
})
