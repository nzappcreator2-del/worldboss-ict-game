// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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

function setupWithStats(statsProfile: unknown, allocateResult?: unknown) {
  const service: ProfileService = {
    getCurrentUser: () => ({ id: 'u1' }),
    loadProfile: vi.fn().mockResolvedValue({ success: true, profile: statsProfile }),
    allocateStat: vi.fn().mockResolvedValue(allocateResult ?? { success: true, inventory: {}, remaining: 0 }),
  }
  const onUserUpdate = vi.fn()
  render(<PlayerProfile service={service} onUserUpdate={onUserUpdate} />)
  return { service, onUserUpdate }
}

describe('PlayerProfile', () => {
  it('offers a close control that returns to the dashboard', () => {
    const onClose = vi.fn()
    const service: ProfileService = {
      getCurrentUser: () => ({ id: 'u1' }),
      loadProfile: vi.fn().mockResolvedValue({ success: true, profile }),
    }
    render(<PlayerProfile service={service} onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: 'ปิดหน้าโปรไฟล์' }))

    expect(onClose).toHaveBeenCalledOnce()
  })

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

describe('Ragnarok-style status window', () => {
  it('shows zeroed stats and the level-derived remaining points when none are allocated', async () => {
    setupWithStats(profile)
    window.dispatchEvent(new Event('nextgen:open-profile'))

    expect(await screen.findByText('แต้มคงเหลือ 21')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'เพิ่ม STR' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'เพิ่ม VIT' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'เพิ่ม DEX' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'เพิ่ม LUK' })).toBeTruthy()
  })

  it('allocates a stat point through the service and pushes the update upstream', async () => {
    const statsProfile = { ...profile, inventory: { ...profile.inventory, stats: { str: 1, vit: 0, dex: 0, luk: 0 } } }
    const allocated = { success: true, inventory: { ...profile.inventory, stats: { str: 2, vit: 0, dex: 0, luk: 0 } }, remaining: 19 }
    const { service, onUserUpdate } = setupWithStats(statsProfile, allocated)
    window.dispatchEvent(new Event('nextgen:open-profile'))
    await screen.findByText('แต้มคงเหลือ 20')

    fireEvent.click(screen.getByRole('button', { name: 'เพิ่ม STR' }))

    expect(service.allocateStat).toHaveBeenCalledWith('u1', 'str')
    expect(await screen.findByText('แต้มคงเหลือ 19')).toBeTruthy()
    expect(onUserUpdate).toHaveBeenCalledWith({ inventory: allocated.inventory })
  })

  it('shows an inline error and keeps the stat unchanged when allocation fails', async () => {
    const statsProfile = { ...profile, inventory: { ...profile.inventory, stats: { str: 0, vit: 0, dex: 0, luk: 0 } } }
    setupWithStats(statsProfile, { success: false, error: 'แต้มสเตตัสไม่พอ' })
    window.dispatchEvent(new Event('nextgen:open-profile'))
    await screen.findByText('แต้มคงเหลือ 21')

    fireEvent.click(screen.getByRole('button', { name: 'เพิ่ม STR' }))

    expect(await screen.findByText('แต้มสเตตัสไม่พอ')).toBeTruthy()
    expect(screen.getByText('แต้มคงเหลือ 21')).toBeTruthy()
  })

  it('disables the allocation buttons once every point has been spent', async () => {
    const spentProfile = { ...profile, inventory: { ...profile.inventory, stats: { str: 21, vit: 0, dex: 0, luk: 0 } } }
    setupWithStats(spentProfile)
    window.dispatchEvent(new Event('nextgen:open-profile'))

    expect(await screen.findByText('แต้มคงเหลือ 0')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'เพิ่ม STR' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'เพิ่ม VIT' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
