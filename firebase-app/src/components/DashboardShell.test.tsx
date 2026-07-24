// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DashboardShell, type DashboardShellUser } from './DashboardShell'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function setup(overrides: Partial<DashboardShellUser> = {}) {
  let user: DashboardShellUser = { id: 'u1', name: 'ฟ้า', class: 'ป.5/1', avatar: '🧙', xp: 145, coins: 30, level: 2, rank: 'SILVER', streak: 4, passedLessons: ['L1'], ...overrides }
  const onNavigate = vi.fn()
  const onLogout = vi.fn()
  const view = render(<DashboardShell getCurrentUser={() => user} onNavigate={onNavigate} onLogout={onLogout} />)
  return { view, onNavigate, onLogout, setUser: (next: DashboardShellUser) => { user = next } }
}

describe('DashboardShell', () => {
  it('renders the original player HUD and all React feature mount points', () => {
    const { view } = setup()

    expect(screen.getByText('ฟ้า')).toBeTruthy()
    expect(screen.getByText('ป.5/1')).toBeTruthy()
    expect(screen.getByText('30')).toBeTruthy()
    expect(screen.getByText('SILVER')).toBeTruthy()
    expect(view.container.querySelectorAll('#react-home-root')).toHaveLength(1)
    expect(view.container.querySelectorAll('#react-profile-root')).toHaveLength(1)
    expect(view.container.querySelectorAll('#react-map-root')).toHaveLength(1)
    expect(view.container.querySelectorAll('#react-rank-root')).toHaveLength(1)
    expect(view.container.querySelectorAll('#react-cert-root')).toHaveLength(1)
  })

  it('renders the guild hall background and the configurable test character', () => {
    setup()

    const cameraWorld = screen.getByTestId('dashboard-camera-world')
    expect(screen.getByTestId('dashboard-background').getAttribute('aria-hidden')).toBe('true')
    const character = screen.getByTestId('walkable-character')
    expect(character.getAttribute('aria-label')).toBe('ตัวละครผู้เล่น')
    expect(character.getAttribute('data-direction')).toBe('down')
    expect(cameraWorld.contains(character)).toBe(true)
    expect(cameraWorld.classList.contains('dashboard-camera-world')).toBe(true)
    expect(cameraWorld.querySelector('#react-home-root')).toBeTruthy()
  })

  it('stacks equipped LPC layers onto the hub character as paper-doll backgrounds', () => {
    setup({ inventory: { cosmetics: { owned: ['hat-feather', 'weapon-longsword'], equipped: { hat: 'hat-feather', weapon: 'weapon-longsword' } } } })

    const layers = screen.getByTestId('walkable-character').style.backgroundImage
    expect(layers).toContain('hat-feather')
    expect(layers).toContain('weapon-longsword')
    expect(layers).toContain('base-hero')
  })

  it('always dresses the character in the free starter hair and outfit', () => {
    setup()

    const layers = screen.getByTestId('walkable-character').style.backgroundImage
    expect(layers).toContain('hair-bangs')
    expect(layers).toContain('outfit-tshirt')
    expect(layers).toContain('base-hero')
    expect(layers).not.toContain('hat-')
  })

  it('moves continuously while a direction key is held', () => {
    let animationFrame: FrameRequestCallback | undefined
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      animationFrame = callback
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    setup()
    const character = screen.getByTestId('walkable-character')
    const initialLeft = character.getAttribute('style')

    fireEvent.keyDown(window, { key: 'ArrowRight' })
    act(() => animationFrame?.(1000))
    act(() => animationFrame?.(1016))

    expect(character.getAttribute('data-direction')).toBe('right')
    expect(character.getAttribute('style')).not.toBe(initialLeft)

    const movedLeft = character.getAttribute('style')
    act(() => animationFrame?.(1032))
    expect(character.getAttribute('style')).not.toBe(movedLeft)

    const heldLeft = character.getAttribute('style')
    fireEvent.keyUp(window, { key: 'ArrowRight' })
    act(() => animationFrame?.(1048))
    expect(character.getAttribute('style')).toBe(heldLeft)
  })

  it('uses a larger sprite and walks toward a clicked floor position', () => {
    let animationFrame: FrameRequestCallback | undefined
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      animationFrame = callback
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    setup()
    const hub = document.getElementById('page-dashboard')!
    vi.spyOn(hub, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 1000, height: 1000, right: 1000, bottom: 1000, x: 0, y: 0, toJSON: () => ({}),
    })
    const character = screen.getByTestId('walkable-character')
    expect(character.style.width).toBe('112px')

    fireEvent(hub, new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 700, clientY: 640 }))
    act(() => animationFrame?.(1000))
    act(() => animationFrame?.(1016))

    expect(character.getAttribute('data-direction')).toBe('right')
    expect(Number.parseFloat(character.style.left)).toBeGreaterThan(50)
  })

  it('owns tab navigation and refreshes its user display from bridge events', () => {
    const { onNavigate, setUser } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'แผนที่' }))
    expect(onNavigate).toHaveBeenCalledWith('map')
    expect(document.getElementById('react-map-root')?.classList.contains('hidden')).toBe(false)
    expect(document.getElementById('react-map-root')?.classList.contains('dashboard-map-mount')).toBe(true)
    expect(document.getElementById('react-home-root')?.classList.contains('hidden')).toBe(true)

    setUser({ id: 'u1', name: 'ฟ้า', class: 'ป.5/1', avatar: '🧝', xp: 205, coins: 55, level: 3, rank: 'GOLD', streak: 5 })
    fireEvent(window, new Event('nextgen:user-updated'))
    expect(screen.getByText('55')).toBeTruthy()
    expect(screen.getByText('GOLD')).toBeTruthy()
  })

  it('turns the menu into a right-side vertical rail and drops hub hotspots on the map tab', () => {
    setup()
    // Hub scene: the painted-gate hotspot and quest tracker exist.
    expect(screen.getByRole('button', { name: 'เริ่มการผจญภัย' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'เควสหลัก: ออกผจญภัยด่านต่อไป' })).toBeTruthy()

    // Simulate the class the legacy showPage() adds from outside React: the
    // shell must never clobber it when its scene state changes.
    document.getElementById('page-dashboard')?.classList.add('page-active')
    fireEvent.click(screen.getByRole('button', { name: 'แผนที่' }))
    expect(document.getElementById('page-dashboard')?.getAttribute('data-scene')).toBe('map')
    expect(document.getElementById('page-dashboard')?.classList.contains('page-active')).toBe(true)
    expect(screen.getByRole('navigation', { name: 'เมนูแดชบอร์ด' }).classList.contains('map-vertical')).toBe(true)
    // The invisible gate hotspot must never float over the adventure map, and
    // the hub quest tracker leaves the map scene uncluttered.
    expect(screen.queryByRole('button', { name: 'เริ่มการผจญภัย' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'เควสหลัก: ออกผจญภัยด่านต่อไป' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'หน้าหลัก' }))
    expect(screen.getByRole('button', { name: 'เริ่มการผจญภัย' })).toBeTruthy()
    expect(screen.getByRole('navigation', { name: 'เมนูแดชบอร์ด' }).classList.contains('map-vertical')).toBe(false)
  })

  it('routes exit through the supplied logout action', () => {
    const { onLogout } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'ออกจากเกม' }))
    expect(onLogout).toHaveBeenCalledOnce()
  })

  it('renders the MMO bottom EXP bar with the level progress fill', () => {
    setup()
    const bar = screen.getByTestId('dashboard-exp-bar')
    const fill = bar.querySelector('i') as HTMLElement
    expect(bar.textContent).toContain('Level 2')
    expect(Number.parseFloat(fill.style.width)).toBeGreaterThan(0)
  })

  it('renders the hub minimap with a player blip and portal marker', () => {
    setup()
    const minimap = screen.getByTestId('hub-minimap')
    expect(minimap.querySelector('.mm-player')).toBeTruthy()
    expect(minimap.querySelector('.mm-portal')).toBeTruthy()
  })

  it('tracks the main quest toward the adventure map', () => {
    const { onNavigate } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'เควสหลัก: ออกผจญภัยด่านต่อไป' }))
    expect(onNavigate).toHaveBeenCalledWith('map')
  })

  it('links the daily-quest tracker entry to the quest board panel', () => {
    setup()
    const opened = vi.fn()
    window.addEventListener('nextgen:open-daily-quests', opened)
    fireEvent.click(screen.getByRole('button', { name: 'ภารกิจประจำวัน' }))
    window.removeEventListener('nextgen:open-daily-quests', opened)
    expect(opened).toHaveBeenCalledOnce()
  })

  it('keeps shop and bag entries in the icon menu bar', () => {
    setup()
    const shopOpened = vi.fn()
    window.addEventListener('nextgen:open-shop', shopOpened)
    fireEvent.click(screen.getByRole('button', { name: 'เปิดร้านค้า' }))
    window.removeEventListener('nextgen:open-shop', shopOpened)
    expect(shopOpened).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'เปิดกระเป๋า' })).toBeTruthy()
  })

  it('mounts the teacher NPC slot only while the guild hall scene is visible', () => {
    const user: DashboardShellUser = { id: 'u1', name: 'ฟ้า', class: 'ป.5/1' }
    render(<DashboardShell
      getCurrentUser={() => user}
      onNavigate={vi.fn()}
      onLogout={vi.fn()}
      teacherNpc={<div data-testid="teacher-npc-slot" />}
    />)

    expect(screen.getByTestId('teacher-npc-slot')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'แผนที่' }))
    expect(screen.queryByTestId('teacher-npc-slot')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'หน้าหลัก' }))
    expect(screen.getByTestId('teacher-npc-slot')).toBeTruthy()
  })

  it('broadcasts a throttled walk position for hall inhabitants', () => {
    let animationFrame: FrameRequestCallback | undefined
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      animationFrame = callback
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    setup()
    const positions: Array<{ x: number; y: number }> = []
    const listener = (event: Event) => positions.push((event as CustomEvent<{ x: number; y: number }>).detail)
    window.addEventListener('nextgen:hub-player-position', listener)

    fireEvent.keyDown(window, { key: 'ArrowRight' })
    act(() => animationFrame?.(1000))
    act(() => animationFrame?.(1016))
    act(() => animationFrame?.(1032))
    window.removeEventListener('nextgen:hub-player-position', listener)

    // Two movement frames 16ms apart → exactly one throttled broadcast.
    expect(positions).toHaveLength(1)
    expect(positions[0].x).toBeGreaterThan(0)
    expect(positions[0].y).toBeGreaterThan(0)
  })
})
