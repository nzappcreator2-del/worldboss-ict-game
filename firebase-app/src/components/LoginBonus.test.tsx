// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LoginBonus, type LoginBonusService } from './LoginBonus'

afterEach(cleanup)

function setup(result: unknown = { success: true, isNew: true, streak: 3, coinsGained: 20, totalCoins: 120 }) {
  const service: LoginBonusService = {
    getCurrentUser: () => ({ id: 'u1' }),
    claim: vi.fn().mockResolvedValue(result),
  }
  const onUserUpdate = vi.fn()
  render(<LoginBonus service={service} onUserUpdate={onUserUpdate} />)
  return { service, onUserUpdate }
}

describe('LoginBonus', () => {
  it('claims once after login, updates the player, and shows the original reward details', async () => {
    const { service, onUserUpdate } = setup()
    fireEvent(window, new Event('nextgen:login-complete'))

    expect(await screen.findByRole('dialog', { name: 'ของขวัญประจำวัน' })).toBeTruthy()
    expect(screen.getByText('+20 Coins')).toBeTruthy()
    expect(screen.getByText('🔥 3 วันแล้ว!')).toBeTruthy()
    expect(service.claim).toHaveBeenCalledWith('u1')
    expect(onUserUpdate).toHaveBeenCalledWith({ coins: 120, streak: 3 })

    fireEvent.click(screen.getByRole('button', { name: 'เข้าสู่การผจญภัย' }))
    expect(screen.queryByRole('dialog', { name: 'ของขวัญประจำวัน' })).toBeNull()
  })

  it('does not show a reward already claimed today', async () => {
    setup({ success: true, isNew: false, streak: 3, coins: 120 })
    fireEvent(window, new Event('nextgen:login-complete'))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'ของขวัญประจำวัน' })).toBeNull())
  })

  it('reports a claim failure without blocking navigation', async () => {
    setup({ success: false, error: 'offline' })
    fireEvent(window, new Event('nextgen:login-complete'))

    expect((await screen.findByRole('alert')).textContent).toContain('offline')
    expect(screen.queryByRole('dialog', { name: 'ของขวัญประจำวัน' })).toBeNull()
  })
})
