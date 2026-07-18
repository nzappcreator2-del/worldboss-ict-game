// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Lobby, type LobbyMode } from './Lobby'

afterEach(cleanup)

describe('Lobby', () => {
  it('renders the reference mode-selection layout', () => {
    render(<Lobby onSelectMode={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'เลือกโหมดการเล่น' })).toBeTruthy()
    expect(screen.getByTestId('lobby-background').getAttribute('aria-hidden')).toBe('true')
    expect(screen.getAllByTestId('lobby-mode-card')).toHaveLength(4)
  })

  it('opens daily rewards and ranking from the utility controls', async () => {
    const user = userEvent.setup()
    const onDailyReward = vi.fn()
    const onRank = vi.fn()
    render(<Lobby onSelectMode={vi.fn()} onDailyReward={onDailyReward} onRank={onRank} />)

    await user.click(screen.getByRole('button', { name: 'รางวัลประจำวัน' }))
    await user.click(screen.getByRole('button', { name: 'อันดับ' }))

    expect(onDailyReward).toHaveBeenCalledOnce()
    expect(onRank).toHaveBeenCalledOnce()
  })

  it.each([
    ['ผจญภัยในบทเรียน', 'adventure'],
    ['ท้าสู้กับเพื่อน (PVP)', 'pvp'],
    ['มินิเกม (AI Camera)', 'world-boss'],
    ['ผู้พิทักษ์ไซเบอร์', 'cyber-safety'],
  ] as const)('opens %s through the React callback', async (label, mode) => {
    const user = userEvent.setup()
    const onSelectMode = vi.fn()
    render(<Lobby onSelectMode={onSelectMode} />)

    await user.click(screen.getByRole('button', { name: label }))

    expect(onSelectMode).toHaveBeenCalledWith(mode satisfies LobbyMode)
  })

  it('renders one accessible button for every supported mode', () => {
    render(<Lobby onSelectMode={vi.fn()} />)
    expect(screen.getAllByTestId('lobby-mode-card')).toHaveLength(4)
  })
})
