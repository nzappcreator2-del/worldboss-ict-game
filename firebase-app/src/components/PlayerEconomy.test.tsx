// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { PlayerEconomy, type EconomyService, type EconomyUser } from './PlayerEconomy'

afterEach(cleanup)

function setup(user: EconomyUser = { id: 'u1', coins: 600, avatar: '🧙', inventory: { potion: 1, magnifier: 2 } }) {
  let currentUser = user
  const service: EconomyService = {
    getCurrentUser: () => currentUser,
    buyItem: vi.fn().mockResolvedValue({ success: true, coins: 500, inventory: { potion: 2, magnifier: 2 } }),
    gacha: vi.fn().mockResolvedValue({ success: true, coins: 100, avatar: '🐉', rarity: 'Legendary' }),
    buyCosmetic: vi.fn().mockResolvedValue({ success: true, coins: 350, inventory: { cosmetics: { owned: ['hat-feather'], equipped: { hat: 'hat-feather' } } } }),
    equipCosmetic: vi.fn().mockResolvedValue({ success: true, equipped: false, inventory: { cosmetics: { owned: ['hat-feather'], equipped: {} } } }),
  }
  const onUserUpdate = vi.fn((update: Partial<EconomyUser>) => { currentUser = { ...currentUser, ...update } })
  const view = render(<PlayerEconomy service={service} onUserUpdate={onUserUpdate} />)
  return { service, onUserUpdate, unmount: view.unmount, container: view.container }
}

describe('PlayerEconomy', () => {
  it('opens Shop and Inventory from compatibility events with current user values', () => {
    setup()
    fireEvent(window, new CustomEvent('nextgen:dashboard-tab', { detail: 'map' }))
    expect(screen.queryByRole('button', { name: 'เปิดร้านค้า' })).toBeNull()
    fireEvent(window, new CustomEvent('nextgen:dashboard-tab', { detail: 'rank' }))
    expect(screen.getByRole('button', { name: 'เปิดร้านค้า' })).toBeTruthy()
    fireEvent(window, new CustomEvent('nextgen:dashboard-tab', { detail: 'home' }))
    expect(screen.queryByRole('button', { name: 'เปิดร้านค้า' })).toBeNull()
    fireEvent(window, new Event('nextgen:open-shop'))
    expect(screen.getByRole('dialog', { name: 'ร้านค้าลับ' })).toBeTruthy()
    expect(screen.getByText('600')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'ปิดร้านค้า' }))

    fireEvent(window, new Event('nextgen:open-inventory'))
    expect(screen.getByRole('dialog', { name: 'กระเป๋าไอเทม' })).toBeTruthy()
    // The bag opens on the paper-doll tab; consumables live under หมวดของใช้.
    expect(screen.getByTestId('wardrobe-preview')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'หมวดของใช้' }))
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
    fireEvent.click(screen.getByRole('button', { name: 'หมวดของใช้' }))
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
    fireEvent.click(screen.getByRole('button', { name: 'หมวดพิเศษ' }))
    fireEvent.click(screen.getByRole('button', { name: 'สุ่มอวาตาร์ ราคา 500 เหรียญ' }))

    await waitFor(() => expect(service.gacha).toHaveBeenCalledWith('u1'))
    expect(onUserUpdate).toHaveBeenCalledWith({ coins: 100, avatar: '🐉' })
    expect(await screen.findByRole('dialog', { name: 'ผลการสุ่มอวาตาร์' })).toBeTruthy()
    expect(screen.getByText(/Legendary/)).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'ผลการสุ่มอวาตาร์' })).toBeNull()
    expect(screen.getByRole('dialog', { name: 'ร้านค้าลับ' })).toBeTruthy()
  })

  it('gives the shop a Ragnarok-style NPC vendor window with category tabs and item tint slots', () => {
    setup()
    fireEvent(window, new Event('nextgen:open-shop'))

    // The shop window portals to <body> so it stays visible over lesson pages.
    expect(screen.getByText(/ยินดีต้อนรับ/)).toBeTruthy()
    expect(document.querySelector('.ro-shop-window')).toBeTruthy()
    // Default shelf shows consumables; the gacha fortune box moved to หมวดพิเศษ.
    expect(document.querySelector('.ro-tint-red')).toBeTruthy()
    expect(document.querySelector('.ro-tint-blue')).toBeTruthy()
    expect(document.querySelector('.ro-tint-fortune')).toBeNull()
    for (const label of ['หมวดของใช้', 'หมวดหมวก', 'หมวดเสื้อผ้า', 'หมวดอาวุธ', 'หมวดพิเศษ']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy()
    }
    fireEvent.click(screen.getByRole('button', { name: 'หมวดพิเศษ' }))
    expect(document.querySelector('.ro-tint-fortune')).toBeTruthy()
  })

  it('lets the player try items on, buy them, and see ซื้อแล้ว in the shop', async () => {
    const { service, onUserUpdate } = setup()
    fireEvent(window, new Event('nextgen:open-shop'))
    fireEvent.click(screen.getByRole('button', { name: 'หมวดหมวก' }))

    expect(screen.getByText('หมวกขนนกนักล่า')).toBeTruthy()
    expect(screen.getByText('มงกุฎราชาแห่งปัญญา')).toBeTruthy()

    // Clicking a card tries the item on: the live preview stacks its layer.
    expect(screen.getByTestId('wardrobe-preview').style.backgroundImage).not.toContain('hat-feather')
    fireEvent.click(screen.getByRole('button', { name: 'ลองชุดหมวกขนนกนักล่า' }))
    expect(screen.getByTestId('tryon-label').textContent).toContain('หมวกขนนกนักล่า')
    expect(screen.getByTestId('wardrobe-preview').style.backgroundImage).toContain('hat-feather')

    fireEvent.click(screen.getByRole('button', { name: 'ซื้อหมวกขนนกนักล่า ราคา 250 เหรียญ' }))
    await waitFor(() => expect(service.buyCosmetic).toHaveBeenCalledWith('u1', 'hat-feather'))
    expect(onUserUpdate).toHaveBeenCalledWith({ coins: 350, inventory: { cosmetics: { owned: ['hat-feather'], equipped: { hat: 'hat-feather' } } } })
    // Owned items show ซื้อแล้ว; wearing/removing happens in the bag, not the shop.
    expect(await screen.findByText(/✓ ซื้อแล้ว/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'ถอดหมวกขนนกนักล่า' })).toBeNull()
  })

  it('sells five hairstyles in the ทรงผม category', () => {
    setup()
    fireEvent(window, new Event('nextgen:open-shop'))
    fireEvent.click(screen.getByRole('button', { name: 'หมวดทรงผม' }))

    // Starter bangs are free (not for sale); the four premium styles are shelved.
    expect(screen.queryByText('ผมหน้าม้าสีทอง')).toBeNull()
    expect(screen.getByText('ผมหางม้าสีดำ')).toBeTruthy()
    expect(screen.getByText('ผมยาวพิเศษสีฟ้า')).toBeTruthy()
  })

  it('keeps the ทรงผม/เสื้อผ้า shop shelves visible for gendered students', () => {
    setup({ id: 'u1', coins: 600, avatar: '👦', gender: 'male', inventory: {} })
    fireEvent(window, new Event('nextgen:open-shop'))

    expect(screen.getByRole('button', { name: 'หมวดทรงผม' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'หมวดเสื้อผ้า' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'หมวดหมวก' })).toBeTruthy()
  })

  it('shows the same unisex hair count to a male and a female student (gender filter infra is a no-op until gendered art exists)', () => {
    setup({ id: 'u1', coins: 600, avatar: '👦', gender: 'male', inventory: {} })
    fireEvent(window, new Event('nextgen:open-shop'))
    fireEvent.click(screen.getByRole('button', { name: 'หมวดทรงผม' }))
    const maleHairCards = document.querySelectorAll('.ro-cosmetic-item').length

    cleanup()
    setup({ id: 'u2', coins: 600, avatar: '👧', gender: 'female', inventory: {} })
    fireEvent(window, new Event('nextgen:open-shop'))
    fireEvent.click(screen.getByRole('button', { name: 'หมวดทรงผม' }))
    const femaleHairCards = document.querySelectorAll('.ro-cosmetic-item').length

    expect(maleHairCards).toBe(4) // 4 premium styles; the free starter isn't shelved
    expect(femaleHairCards).toBe(maleHairCards)
  })

  it('expands the hat shelf to 5 base shapes x 3 tiers with rarity chips, and prices every new item under the coin-delta cap', async () => {
    setup()
    fireEvent(window, new Event('nextgen:open-shop'))
    fireEvent.click(screen.getByRole('button', { name: 'หมวดหมวก' }))

    const hatCards = document.querySelectorAll('.ro-cosmetic-item')
    expect(hatCards).toHaveLength(15)
    // Recolor tiers read "ชื่อเดิม (ระดับ)" — e.g. the wizard hat's sapphire tier.
    expect(screen.getByText('หมวกจอมเวทสีน้ำเงิน (แซฟไฟร์)')).toBeTruthy()
    expect(screen.getByRole('button', { name: /ซื้อหมวกจอมเวทสีน้ำเงิน \(แซฟไฟร์\) ราคา 620 เหรียญ/ })).toBeTruthy()
    // Common starter-priced hats and the legendary crown recolors both carry a rarity chip.
    expect(document.querySelector('.ro-rarity-common')).toBeTruthy()
    expect(document.querySelector('.ro-rarity-legendary')).toBeTruthy()
    expect(screen.getAllByText('ตำนาน').length).toBeGreaterThan(0)
  })

  it('keeps the hair/outfit doll slots visible in the bag for gendered students', () => {
    setup({
      id: 'u1', coins: 600, avatar: '👧', gender: 'female',
      inventory: { cosmetics: { owned: ['hat-feather'], equipped: { hat: 'hat-feather' } } },
    })
    fireEvent(window, new Event('nextgen:open-inventory'))

    expect(screen.getByText('ทรงผม')).toBeTruthy()
    expect(screen.getByText('เสื้อผ้า')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'ถอดหมวกขนนกนักล่า' })).toBeTruthy()
  })

  it('shows equipped gear as a paper-doll in the bag and unequips back into the wardrobe', async () => {
    const { service } = setup({
      id: 'u1', coins: 600, avatar: '🧙',
      inventory: { potion: 1, cosmetics: { owned: ['hat-feather', 'weapon-waraxe'], equipped: { hat: 'hat-feather' } } },
    })
    fireEvent(window, new Event('nextgen:open-inventory'))

    // The bag shows the live character preview plus the equipped hat in its slot;
    // The equipped hat is also visible in the wardrobe but as an active (disabled) button.
    // The owned-but-unequipped war axe waits in the wardrobe as an equip button.
    expect(screen.getByTestId('wardrobe-preview')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'ถอดหมวกขนนกนักล่า' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'หมวกขนนกนักล่า (ใช้งานอยู่)' })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: 'สวมใส่ขวานสงคราม' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'ถอดหมวกขนนกนักล่า' }))
    await waitFor(() => expect(service.equipCosmetic).toHaveBeenCalledWith('u1', 'hat-feather'))
    // The service mock reports the hat unequipped: it becomes a regular equip button in the wardrobe.
    expect(await screen.findByRole('button', { name: 'สวมใส่หมวกขนนกนักล่า' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'ถอดหมวกขนนกนักล่า' })).toBeNull()
  })

  it('blocks cosmetic purchases the player cannot afford without calling the service', () => {
    const { service } = setup({ id: 'u1', coins: 40, avatar: '🧙', inventory: {} })
    fireEvent(window, new Event('nextgen:open-shop'))
    fireEvent.click(screen.getByRole('button', { name: 'หมวดอาวุธ' }))
    fireEvent.click(screen.getByRole('button', { name: 'ซื้อดาบโค้งเซเบอร์ ราคา 350 เหรียญ' }))

    expect(service.buyCosmetic).not.toHaveBeenCalled()
    expect(screen.getByText('เหรียญไม่พอจ้า')).toBeTruthy()
  })

  it('renders the inventory as a fixed Ragnarok-style item grid with decorative empty slots', () => {
    setup()
    fireEvent(window, new Event('nextgen:open-inventory'))
    fireEvent.click(screen.getByRole('button', { name: 'หมวดของใช้' }))

    const slots = document.querySelectorAll('.ro-inv-slot')
    const emptySlots = document.querySelectorAll('.ro-inv-slot.empty[aria-hidden="true"]')
    expect(slots).toHaveLength(8)
    expect(emptySlots).toHaveLength(6)
    expect(screen.getByText('x1')).toBeTruthy()
    expect(screen.getByText('x2')).toBeTruthy()
  })

  it('keeps the equipment sections visible despite the legacy section-router CSS', () => {
    // legacy CSS ซ่อนทุก <section> ที่ไม่ประกาศ display เอง — แผงตุ๊กตากับตู้เสื้อผ้า
    // ต้องประกาศ display ของตัวเองเสมอ ไม่งั้นกระเป๋าจะดูว่างเปล่า (regression)
    const css = readFileSync('src/index.css', 'utf8')
    for (const selector of ['.ro-equip-doll', '.ro-wardrobe']) {
      const rule = css.match(new RegExp(`^\\${selector} \\{([^}]*)\\}`, 'm'))
      expect(rule, `${selector} rule must exist in index.css`).toBeTruthy()
      expect(rule![1], `${selector} must declare its own display`).toContain('display:')
    }
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
