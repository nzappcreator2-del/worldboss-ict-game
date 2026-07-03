// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DashboardShell, type DashboardShellUser } from './DashboardShell'

afterEach(cleanup)

function setup() {
  let user: DashboardShellUser = { id: 'u1', name: 'ฟ้า', class: 'ป.5/1', avatar: '🧙', xp: 145, coins: 30, level: 2, rank: 'SILVER', streak: 4, passedLessons: ['L1'] }
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

  it('owns tab navigation and refreshes its user display from bridge events', () => {
    const { onNavigate, setUser } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'แผนที่' }))
    expect(onNavigate).toHaveBeenCalledWith('map')
    expect(document.getElementById('react-map-root')?.classList.contains('hidden')).toBe(false)
    expect(document.getElementById('react-home-root')?.classList.contains('hidden')).toBe(true)

    setUser({ id: 'u1', name: 'ฟ้า', class: 'ป.5/1', avatar: '🧝', xp: 205, coins: 55, level: 3, rank: 'GOLD', streak: 5 })
    fireEvent(window, new Event('nextgen:user-updated'))
    expect(screen.getByText('55')).toBeTruthy()
    expect(screen.getByText('GOLD')).toBeTruthy()
  })

  it('routes exit through the supplied logout action', () => {
    const { onLogout } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'ออกจากเกม' }))
    expect(onLogout).toHaveBeenCalledOnce()
  })
})
