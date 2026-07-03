// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlayerProfile, type ProfileService } from './PlayerProfile'

afterEach(cleanup)

const profile = {
  id: 'u1', name: 'ฟ้า', class: 'ป.6/1', avatar: '🧙', level: 8, xp: 720,
  rank: 'GOLD', coins: 125, streak: 4, lastLogin: '2026-06-28',
  inventory: { potion: 2, magnifier: 3, badges: ['badge_cert', 'badge_lesson_L1', 'badge_lesson_L2'] },
  stats: { totalScore: 180, completedLessons: 2, totalLessons: 4, completionRate: 50 },
}

function setup(result: unknown = { success: true, profile }) {
  const service: ProfileService = {
    getCurrentUser: () => ({ id: 'u1' }),
    loadProfile: vi.fn().mockResolvedValue(result),
  }
  render(<PlayerProfile service={service} />)
  return service
}

describe('PlayerProfile', () => {
  it('loads and renders player stats when the Profile tab opens', async () => {
    const service = setup()
    expect(service.loadProfile).not.toHaveBeenCalled()

    window.dispatchEvent(new Event('nextgen:open-profile'))

    expect(await screen.findByRole('heading', { name: 'ฟ้า' })).toBeTruthy()
    expect(screen.getByText('180')).toBeTruthy()
    expect(screen.getAllByText('50%')).toHaveLength(2)
    expect(screen.getByText('2 / 4')).toBeTruthy()
    expect(service.loadProfile).toHaveBeenCalledWith('u1')
  })

  it('groups lesson badges and displays special achievements', async () => {
    setup()
    window.dispatchEvent(new Event('nextgen:open-profile'))

    expect(await screen.findByText('บัณฑิตน้อย')).toBeTruthy()
    expect(screen.getByText('ผู้พิชิต')).toBeTruthy()
    expect(screen.getByText('ผ่านการทดสอบ 2 ด่าน')).toBeTruthy()
  })

  it('shows an empty badge state when no achievements exist', async () => {
    setup({ success: true, profile: { ...profile, inventory: { potion: 0, magnifier: 0, badges: [] } } })
    window.dispatchEvent(new Event('nextgen:open-profile'))

    expect(await screen.findByText('ยังไม่มีเหรียญตรา')).toBeTruthy()
  })

  it('shows a retry action when Firestore loading fails', async () => {
    const service = setup(new Error('offline'))
    service.loadProfile = vi.fn().mockRejectedValue(new Error('offline'))
    window.dispatchEvent(new Event('nextgen:open-profile'))

    expect(await screen.findByText('โหลดโปรไฟล์ไม่สำเร็จ')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'ลองใหม่' })).toBeTruthy()
  })
})
