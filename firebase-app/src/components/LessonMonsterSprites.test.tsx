// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { LessonMonsterSprite } from './LessonMonsterSprites'

afterEach(cleanup)

describe('LessonMonsterSprite', () => {
  it('renders a crisp-edged pixel svg tagged with its body and species class', () => {
    const { container } = render(<LessonMonsterSprite body="slime" mode="patrol" direction="down" />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('data-body')).toBe('slime')
    expect(svg?.getAttribute('shape-rendering')).toBe('crispEdges')
    expect(svg?.classList.contains('lesson-svg-slime')).toBe(true)
  })

  it('maps every SVG body to its own species class', () => {
    for (const body of ['slime', 'mushroom', 'bat', 'tome'] as const) {
      const { container } = render(<LessonMonsterSprite body={body} mode="patrol" direction="down" />)
      expect(container.querySelector('svg')?.classList.contains(`lesson-svg-${body}`)).toBe(true)
      cleanup()
    }
  })

  it('draws the bat with two independently animatable wing groups', () => {
    const { container } = render(<LessonMonsterSprite body="bat" mode="patrol" direction="down" />)
    expect(container.querySelectorAll('.lesson-svg-wing')).toHaveLength(2)
  })

  it('draws the tome with a floating flame group', () => {
    const { container } = render(<LessonMonsterSprite body="tome" mode="patrol" direction="down" />)
    expect(container.querySelectorAll('.lesson-svg-flame')).toHaveLength(1)
  })

  it('flips to face left without redrawing the art', () => {
    const { container: right } = render(<LessonMonsterSprite body="mushroom" mode="patrol" direction="right" />)
    expect(right.querySelector('svg')?.getAttribute('style') || '').not.toContain('scaleX(-1)')
    cleanup()
    const { container: left } = render(<LessonMonsterSprite body="mushroom" mode="patrol" direction="left" />)
    expect(left.querySelector('svg')?.getAttribute('style') || '').toContain('scaleX(-1)')
  })
})
