// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LandingLogin, type LandingService } from './LandingLogin'

const service: LandingService = {
  getInitialData: vi.fn().mockResolvedValue({
    success: true,
    users: [
      { name: 'Ada', class: 'ป.5/1', avatar: '🧝‍♀️' },
      { name: 'Bob', class: 'ป.6/1', avatar: '⚔️' },
    ],
    settings: { Classes: 'ป.5,ป.6', Rooms: '1,2' },
    news: [],
  }),
  loginStudent: vi.fn().mockResolvedValue({
    success: true,
    user: { id: 'U1', name: 'Ada', class: 'ป.5/1', avatar: '🧝‍♀️', xp: 0, level: 1 },
  }),
}

afterEach(cleanup)

describe('LandingLogin', () => {
  it('filters registered students by class and room and restores their avatar', async () => {
    const user = userEvent.setup()
    render(<LandingLogin service={service} onLogin={vi.fn()} onAdmin={vi.fn()} />)

    await user.selectOptions(await screen.findByLabelText('ระดับชั้นเรียน'), 'ป.5')
    await user.selectOptions(screen.getByLabelText('ห้องเรียน'), '1')
    await user.selectOptions(screen.getByLabelText('รายชื่อผู้กล้า'), 'Ada')

    expect(screen.getByRole('button', { name: '🧝‍♀️ เอลฟ์' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByRole('option', { name: /Bob/ })).toBeNull()
  })

  it('registers a new player through the Firebase service and hands off to the lobby', async () => {
    const user = userEvent.setup()
    const onLogin = vi.fn()
    const loginStudent = vi.fn().mockResolvedValue({
      success: true,
      user: { id: 'U2', name: 'New Hero', class: 'ป.6/2', avatar: '⚔️', xp: 0, level: 1 },
    })
    render(<LandingLogin service={{ ...service, loginStudent }} onLogin={onLogin} onAdmin={vi.fn()} />)

    await user.selectOptions(await screen.findByLabelText('ระดับชั้นเรียน'), 'ป.6')
    await user.selectOptions(screen.getByLabelText('ห้องเรียน'), '2')
    await user.selectOptions(screen.getByLabelText('รายชื่อผู้กล้า'), 'NEW_PLAYER')
    await user.type(screen.getByLabelText('ชื่อผู้กล้าคนใหม่'), 'New Hero')
    await user.click(screen.getByRole('button', { name: '⚔️ นักรบ' }))
    await user.click(screen.getByRole('button', { name: '▶ เริ่มการผจญภัย' }))

    await waitFor(() => expect(loginStudent).toHaveBeenCalledWith('New Hero', 'ป.6/2', '⚔️'))
    await waitFor(() => expect(onLogin).toHaveBeenCalledWith(expect.objectContaining({ id: 'U2' }), expect.any(Object)))
  })

  it('shows service failures without leaving the page', async () => {
    const user = userEvent.setup()
    render(<LandingLogin
      service={{ ...service, loginStudent: vi.fn().mockResolvedValue({ success: false, error: 'offline' }) }}
      onLogin={vi.fn()}
      onAdmin={vi.fn()}
    />)

    await user.selectOptions(await screen.findByLabelText('ระดับชั้นเรียน'), 'ป.5')
    await user.selectOptions(screen.getByLabelText('ห้องเรียน'), '1')
    await user.selectOptions(screen.getByLabelText('รายชื่อผู้กล้า'), 'Ada')
    await user.click(screen.getByRole('button', { name: '▶ เริ่มการผจญภัย' }))

    expect((await screen.findByRole('alert')).textContent).toContain('offline')
  })

  it('explains when Anonymous Authentication has not been enabled', async () => {
    render(<LandingLogin
      service={{ ...service, getInitialData: vi.fn().mockRejectedValue(new Error('Firebase: Error (auth/admin-restricted-operation).')) }}
      onLogin={vi.fn()}
      onAdmin={vi.fn()}
    />)

    expect((await screen.findByRole('alert')).textContent).toContain('Anonymous Authentication')
  })
})
