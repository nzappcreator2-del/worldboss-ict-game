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
  it('renders the adventure login layout with the two student heroes', async () => {
    render(<LandingLogin service={service} onLogin={vi.fn()} onAdmin={vi.fn()} />)

    expect(await screen.findByRole('heading', { name: 'เลือกตัวละครผู้กล้า' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'เริ่มการผจญภัย' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Admin Panel/ })).toBeTruthy()
    expect(screen.getByTestId('landing-background').getAttribute('aria-hidden')).toBe('true')
    expect(screen.getByTestId('mobile-brand').textContent).toContain('NextGen Play')
    // Exactly two production-quality 3D student hero portraits are offered.
    expect(screen.getAllByRole('button', { name: /เลือกตัวละคร/ })).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'เลือกตัวละคร นักเรียนชาย' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'เลือกตัวละคร นักเรียนหญิง' })).toBeTruthy()
    expect(screen.getByRole('img', { name: 'ภาพตัวละครนักเรียนชายแบบสามมิติ' }).getAttribute('src')).toContain('student-hero-male')
    expect(screen.getByRole('img', { name: 'ภาพตัวละครนักเรียนหญิงแบบสามมิติ' }).getAttribute('src')).toContain('student-hero-female')
  })

  it('filters registered students by class and room and locks the chooser for returning players', async () => {
    const user = userEvent.setup()
    render(<LandingLogin service={service} onLogin={vi.fn()} onAdmin={vi.fn()} />)

    await user.selectOptions(await screen.findByLabelText('ระดับชั้นเรียน'), 'ป.5')
    await user.selectOptions(screen.getByLabelText('ห้องเรียน'), '1')
    await user.selectOptions(screen.getByLabelText('รายชื่อผู้กล้า'), 'Ada')

    // Returning players keep the character they registered with.
    expect((screen.getByRole('button', { name: 'เลือกตัวละคร นักเรียนชาย' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'เลือกตัวละคร นักเรียนหญิง' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.queryByRole('option', { name: /Bob/ })).toBeNull()
  })

  it('deduplicates identical student directory rows before rendering select options', async () => {
    const user = userEvent.setup()
    const duplicateDirectoryService: LandingService = {
      ...service,
      getInitialData: vi.fn().mockResolvedValue({
        success: true,
        users: [
          { name: 'ญ๘๗ฯ๖๘', class: 'ป.1/2', avatar: '👦' },
          { name: 'ญ๘๗ฯ๖๘', class: 'ป.1/2', avatar: '👦' },
        ],
        settings: { Classes: 'ป.1', Rooms: '2' },
        news: [],
      }),
    }
    render(<LandingLogin service={duplicateDirectoryService} onLogin={vi.fn()} onAdmin={vi.fn()} />)

    await user.selectOptions(await screen.findByLabelText('ระดับชั้นเรียน'), 'ป.1')
    await user.selectOptions(screen.getByLabelText('ห้องเรียน'), '2')

    expect(screen.getAllByRole('option', { name: /ญ๘๗ฯ๖๘/ })).toHaveLength(1)
  })

  it('logs a returning player in with their stored avatar and no gender change', async () => {
    const user = userEvent.setup()
    const loginStudent = vi.fn().mockResolvedValue({
      success: true,
      user: { id: 'U1', name: 'Ada', class: 'ป.5/1', avatar: '🧝‍♀️', xp: 0, level: 1 },
    })
    render(<LandingLogin service={{ ...service, loginStudent }} onLogin={vi.fn()} onAdmin={vi.fn()} />)

    await user.selectOptions(await screen.findByLabelText('ระดับชั้นเรียน'), 'ป.5')
    await user.selectOptions(screen.getByLabelText('ห้องเรียน'), '1')
    await user.selectOptions(screen.getByLabelText('รายชื่อผู้กล้า'), 'Ada')
    await user.click(screen.getByRole('button', { name: 'เริ่มการผจญภัย' }))

    await waitFor(() => expect(loginStudent).toHaveBeenCalledWith('Ada', 'ป.5/1', '🧝‍♀️'))
  })

  it('registers a new player with the chosen gender and hands off to the lobby', async () => {
    const user = userEvent.setup()
    const onLogin = vi.fn()
    const loginStudent = vi.fn().mockResolvedValue({
      success: true,
      user: { id: 'U2', name: 'New Hero', class: 'ป.6/2', avatar: '👧', gender: 'female', xp: 0, level: 1 },
    })
    render(<LandingLogin service={{ ...service, loginStudent }} onLogin={onLogin} onAdmin={vi.fn()} />)

    await user.selectOptions(await screen.findByLabelText('ระดับชั้นเรียน'), 'ป.6')
    await user.selectOptions(screen.getByLabelText('ห้องเรียน'), '2')
    await user.selectOptions(screen.getByLabelText('รายชื่อผู้กล้า'), 'NEW_PLAYER')
    await user.type(screen.getByLabelText('ชื่อผู้กล้าคนใหม่'), 'New Hero')
    await user.click(screen.getByRole('button', { name: 'เลือกตัวละคร นักเรียนหญิง' }))
    expect(screen.getByRole('button', { name: 'เลือกตัวละคร นักเรียนหญิง' }).getAttribute('aria-pressed')).toBe('true')
    await user.click(screen.getByRole('button', { name: 'เริ่มการผจญภัย' }))

    await waitFor(() => expect(loginStudent).toHaveBeenCalledWith('New Hero', 'ป.6/2', '👧', 'female'))
    await waitFor(() => expect(onLogin).toHaveBeenCalledWith(expect.objectContaining({ id: 'U2' }), expect.any(Object)))
  })

  it('requires a new player to pick a character before starting', async () => {
    const user = userEvent.setup()
    const loginStudent = vi.fn()
    render(<LandingLogin service={{ ...service, loginStudent }} onLogin={vi.fn()} onAdmin={vi.fn()} />)

    await user.selectOptions(await screen.findByLabelText('ระดับชั้นเรียน'), 'ป.6')
    await user.selectOptions(screen.getByLabelText('รายชื่อผู้กล้า'), 'NEW_PLAYER')
    await user.type(screen.getByLabelText('ชื่อผู้กล้าคนใหม่'), 'New Hero')
    await user.click(screen.getByRole('button', { name: 'เริ่มการผจญภัย' }))

    expect((await screen.findByRole('alert')).textContent).toContain('เลือกตัวละคร')
    expect(loginStudent).not.toHaveBeenCalled()
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
    await user.click(screen.getByRole('button', { name: 'เริ่มการผจญภัย' }))

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
