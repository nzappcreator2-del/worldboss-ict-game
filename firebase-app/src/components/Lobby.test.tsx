// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Lobby, type LobbyMode } from './Lobby'

afterEach(cleanup)

describe('Lobby', () => {
  it.each([
    ['ผจญภัยในบทเรียน', 'adventure'],
    ['ท้าสู้กับเพื่อน (PVP)', 'pvp'],
    ['มินิเกม (AI Camera)', 'world-boss'],
    ['ผู้พิทักษ์ภัยไซเบอร์', 'cyber-safety'],
  ] as const)('opens %s through the React callback', async (label, mode) => {
    const user = userEvent.setup()
    const onSelectMode = vi.fn()
    render(<Lobby onSelectMode={onSelectMode} />)

    await user.click(screen.getByRole('button', { name: label }))

    expect(onSelectMode).toHaveBeenCalledWith(mode satisfies LobbyMode)
  })

  it('renders one accessible button for every supported mode', () => {
    render(<Lobby onSelectMode={vi.fn()} />)
    expect(screen.getAllByRole('button')).toHaveLength(4)
  })
})
