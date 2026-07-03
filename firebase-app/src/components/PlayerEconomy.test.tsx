// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlayerEconomy, type EconomyService, type EconomyUser } from './PlayerEconomy'

afterEach(cleanup)

function setup(user: EconomyUser = { id: 'u1', coins: 600, avatar: '🧙', inventory: { potion: 1, magnifier: 2 } }) {
  let currentUser = user
  const service: EconomyService = {
    getCurrentUser: () => currentUser,
    buyItem: vi.fn().mockResolvedValue({ success: true, coins: 500, inventory: { potion: 2, magnifier: 2 } }),
    gacha: vi.fn().mockResolvedValue({ success: true, coins: 100, avatar: '🐉', rarity: 'Legendary' }),
  }
  const onUserUpdate = vi.fn((update: Partial<EconomyUser>) => { currentUser = { ...currentUser, ...update } })
  const view = render(<PlayerEconomy service={service} onUserUpdate={onUserUpdate} />)
  return { service, onUserUpdate, unmount: view.unmount }
}

describe('PlayerEconomy', () => {
  it('opens Shop and Inventory from compatibility events with current user values', () => {
    setup()
    fireEvent(window, new CustomEvent('nextgen:dashboard-tab', { detail: 'map' }))
    expect(screen.getByRole('button', { name: 'เปิดร้านค้า' })).toBeTruthy()
    fireEvent(window, new CustomEvent('nextgen:dashboard-tab', { detail: 'home' }))
    expect(screen.queryByRole('button', { name: 'เปิดร้านค้า' })).toBeNull()
    fireEvent(window, new Event('nextgen:open-shop'))
    expect(screen.getByRole('dialog', { name: 'ร้านค้าลับ' })).toBeTruthy()
    expect(screen.getByText('600')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'ปิดร้านค้า' }))

    fireEvent(window, new Event('nextgen:open-inventory'))
    expect(screen.getByRole('dialog', { name: 'กระเป๋าไอเทม' })).toBeTruthy()
    expect(screen.getByText('x1')).toBeTruthy()
    expect(screen.getByText('x2')).toBeTruthy()
  })

  it('does not open economy dialogs before login', () => {
    const service: EconomyService = {
      getCurrentUser: () => null,
      buyItem: vi.fn(),
      gacha: vi.fn(),
    }
    render(<PlayerEconomy service={service} onUserUpdate={vi.fn()} />)
    fireEvent(window, new Event('nextgen:open-shop'))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('alert').textContent).toContain('กรุณาล็อกอินก่อน')
  })

  it('buys an item through the server-authoritative service and synchronizes state', async () => {
    const { service, onUserUpdate } = setup()
    fireEvent(window, new Event('nextgen:open-shop'))
    fireEvent.click(screen.getByRole('button', { name: 'ซื้อยาเติมเลือด HP ราคา 100 เหรียญ' }))

    await waitFor(() => expect(service.buyItem).toHaveBeenCalledWith('u1', 'potion'))
    expect(onUserUpdate).toHaveBeenCalledWith({ coins: 500, inventory: { potion: 2, magnifier: 2 } })
    expect(await screen.findByText(/ซื้อยาเติมเลือด HP สำเร็จ/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'ปิดร้านค้า' }))
    fireEvent(window, new Event('nextgen:open-inventory'))
    expect(screen.getAllByText('x2')).toHaveLength(2)
  })

  it('rejects insufficient coins without calling Firestore', () => {
    const { service } = setup({ id: 'u1', coins: 99, avatar: '🧙', inventory: {} })
    fireEvent(window, new Event('nextgen:open-shop'))
    fireEvent.click(screen.getByRole('button', { name: 'ซื้อยาเติมเลือด HP ราคา 100 เหรียญ' }))

    expect(service.buyItem).not.toHaveBeenCalled()
    expect(screen.getByText('เหรียญไม่พอจ้า')).toBeTruthy()
  })

  it('keeps the shop open after gacha, updates the avatar, and closes the result with Escape', async () => {
    const { service, onUserUpdate } = setup()
    fireEvent(window, new Event('nextgen:open-shop'))
    fireEvent.click(screen.getByRole('button', { name: 'สุ่มอวาตาร์ ราคา 500 เหรียญ' }))

    await waitFor(() => expect(service.gacha).toHaveBeenCalledWith('u1'))
    expect(onUserUpdate).toHaveBeenCalledWith({ coins: 100, avatar: '🐉' })
    expect(await screen.findByRole('dialog', { name: 'ผลการสุ่มอวาตาร์' })).toBeTruthy()
    expect(screen.getByText(/Legendary/)).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'ผลการสุ่มอวาตาร์' })).toBeNull()
    expect(screen.getByRole('dialog', { name: 'ร้านค้าลับ' })).toBeTruthy()
  })

  it('shows service failures, reenables purchasing, and removes event listeners on unmount', async () => {
    const { service, unmount } = setup()
    vi.mocked(service.buyItem).mockResolvedValue({ success: false, error: 'ไอเทมนี้ปิดขาย' })
    fireEvent(window, new Event('nextgen:open-shop'))
    const button = screen.getByRole('button', { name: 'ซื้อยาเติมเลือด HP ราคา 100 เหรียญ' }) as HTMLButtonElement
    fireEvent.click(button)

    expect(await screen.findByText('ไอเทมนี้ปิดขาย')).toBeTruthy()
    expect(button.disabled).toBe(false)
    unmount()
    fireEvent(window, new Event('nextgen:open-shop'))
    expect(screen.queryByRole('dialog', { name: 'ร้านค้าลับ' })).toBeNull()
  })
})
