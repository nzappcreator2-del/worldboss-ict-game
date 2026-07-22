// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GameAudioControl } from './GameAudioControl'
import { SOUND_MUTE_KEY } from '../services/soundFx'
import { gameAudio } from '../services/gameAudio'

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('GameAudioControl', () => {
  it('shows a clear speaker control and remembers when the player mutes the game', () => {
    const setMuted = vi.spyOn(gameAudio, 'setMuted')
    render(<GameAudioControl />)

    const button = screen.getByRole('button', { name: 'ปิดเสียงเกม' })
    expect(button.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(button)

    expect(localStorage.getItem(SOUND_MUTE_KEY)).toBe('1')
    expect(setMuted).toHaveBeenCalledWith(true)
    expect(screen.getByRole('button', { name: 'เปิดเสียงเกม' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('restores the saved mute preference on the next mount', () => {
    localStorage.setItem(SOUND_MUTE_KEY, '1')
    render(<GameAudioControl />)

    expect(screen.getByRole('button', { name: 'เปิดเสียงเกม' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('tracks the active page so combat and dashboard controls are never covered', () => {
    render(<GameAudioControl />)
    act(() => window.dispatchEvent(new CustomEvent('nextgen:page-changed', { detail: 'lesson' })))

    expect(screen.getByRole('button', { name: 'ปิดเสียงเกม' }).getAttribute('data-page')).toBe('lesson')
  })
})
