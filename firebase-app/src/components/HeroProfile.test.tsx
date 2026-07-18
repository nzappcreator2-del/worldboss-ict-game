// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HeroProfile, type HeroProfileService, type HeroProfileUser } from './HeroProfile'

afterEach(cleanup)

function setup(user: HeroProfileUser | null = {
  id: 'u1', name: 'ฟ้า', avatar: '🧙', xp: 100, coins: 20, level: 2, rank: 'BRONZE',
  inventory: { potion: 1, cosmetics: { owned: ['hat-feather'], equipped: { hat: 'hat-feather' } } },
}) {
  let currentUser = user
  const service: HeroProfileService = {
    getCurrentUser: () => currentUser,
    allocateStat: vi.fn().mockResolvedValue({ success: true, inventory: { potion: 1, stats: { str: 1, vit: 0, dex: 0, luk: 0 } }, remaining: 2 }),
    equipCosmetic: vi.fn().mockResolvedValue({ success: true, equipped: false, inventory: { potion: 1, cosmetics: { owned: ['hat-feather'], equipped: {} } } }),
  }
  const onUserUpdate = vi.fn()
  render(<HeroProfile service={service} onUserUpdate={onUserUpdate} />)
  return { service, onUserUpdate, setUser: (next: HeroProfileUser | null) => { currentUser = next } }
}

function openProfile() {
  act(() => { window.dispatchEvent(new Event('nextgen:open-hero-profile')) })
}

describe('HeroProfile (the one shared profile window)', () => {
  it('opens from the global event with live level, coins, and equipment', () => {
    setup()
    expect(screen.queryByTestId('hero-profile-panel')).toBeNull()

    openProfile()
    const panel = screen.getByTestId('hero-profile-panel')
    // 100 XP on the MMORPG curve = level 2 (80 needed), 20/100 into level 3.
    expect(within(panel).getByText('ฟ้า Lv.2')).toBeTruthy()
    expect(within(panel).getByText('EXP 20/100')).toBeTruthy()
    expect(within(panel).getByText(/20 เหรียญ/)).toBeTruthy()
    expect(within(panel).getByAltText('หมวกขนนกนักล่า')).toBeTruthy()
  })

  it('allocates stat points through the service and reflects the new ATK', async () => {
    const { service, onUserUpdate } = setup()
    openProfile()
    const panel = screen.getByTestId('hero-profile-panel')
    expect(within(panel).getByText(/แต้มสเตตัสคงเหลือ: 3/)).toBeTruthy()

    fireEvent.click(within(panel).getByRole('button', { name: 'เพิ่มแต้ม STR' }))
    await within(panel).findByText(/ATK 47/)
    expect(service.allocateStat).toHaveBeenCalledWith('u1', 'str')
    expect(onUserUpdate).toHaveBeenCalled()
    expect(within(panel).getByText(/แต้มสเตตัสคงเหลือ: 2/)).toBeTruthy()
  })

  it('announces its close so a paused lesson can resume', () => {
    setup()
    openProfile()
    let closed = 0
    const seen = () => { closed += 1 }
    window.addEventListener('nextgen:hero-profile-closed', seen)
    try {
      fireEvent.click(screen.getByRole('button', { name: 'ปิดโปรไฟล์' }))
      expect(screen.queryByTestId('hero-profile-panel')).toBeNull()
      expect(closed).toBe(1)
    } finally {
      window.removeEventListener('nextgen:hero-profile-closed', seen)
    }
  })

  it('stays closed when nobody is logged in', () => {
    setup(null)
    openProfile()
    expect(screen.queryByTestId('hero-profile-panel')).toBeNull()
  })
})
