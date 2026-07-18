// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { LoadingScreen } from './LoadingScreen'

afterEach(cleanup)

describe('LoadingScreen', () => {
  it('shows the brand title and the progress percentage', () => {
    render(<LoadingScreen progress={42} />)

    expect(screen.getByText('NextGen Play')).toBeTruthy()
    expect(screen.getByText('42%')).toBeTruthy()
    expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true')
  })

  it('positions the fill bar and the running knight at the given progress', () => {
    render(<LoadingScreen progress={60} />)

    const fill = screen.getByTestId('loading-track').querySelector('.app-loading-fill') as HTMLElement
    const knight = screen.getByTestId('loading-knight')

    expect(fill.style.width).toBe('60%')
    expect(knight.style.left).toBe('calc(60% - 36px)')
  })

  it('clamps out-of-range progress values instead of rendering them raw', () => {
    render(<LoadingScreen progress={140} />)
    expect(screen.getByText('100%')).toBeTruthy()
  })

  it('marks itself not busy and drops the fading class off by default once fully loaded', () => {
    render(<LoadingScreen progress={100} />)
    expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('false')
    expect(screen.getByRole('status').className).not.toContain('app-loading-screen-fading')
  })

  it('applies the fading class when told the screen is being dismissed', () => {
    render(<LoadingScreen progress={100} fading />)
    expect(screen.getByRole('status').className).toContain('app-loading-screen-fading')
  })
})
