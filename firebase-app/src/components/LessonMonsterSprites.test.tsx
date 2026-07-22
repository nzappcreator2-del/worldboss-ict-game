// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { LessonAssetMonsterSprite, LessonMonsterSprite } from './LessonMonsterSprites'
import { monsterAnimationFor } from './lessonMonsterAnimation'

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

  it('maps combat modes onto the correct external animation strips', () => {
    expect(monsterAnimationFor('tiny-orc', 'patrol')).toMatchObject({ animation: 'walk', frames: 8, frameWidth: 100 })
    expect(monsterAnimationFor('forest-mushroom', 'chase')).toMatchObject({ animation: 'move', frames: 8, frameWidth: 80 })
    expect(monsterAnimationFor('forest-flyer', 'windup')).toMatchObject({ animation: 'attack', frames: 12, frameWidth: 64 })
    expect(monsterAnimationFor('tiny-blood', 'hurt')).toMatchObject({ animation: 'hurt', frames: 4, frameWidth: 100 })
    expect(monsterAnimationFor('tiny-demon', 'dead')).toMatchObject({ animation: 'death', frames: 4, frameWidth: 100 })
  })

  it('renders external sprites with deterministic frame metadata and horizontal facing', () => {
    const { container } = render(<LessonAssetMonsterSprite skin="tiny-orc" mode="chase" direction="left" frame={3} />)
    const sprite = container.querySelector('[data-monster-skin="tiny-orc"]') as HTMLElement | null
    expect(sprite?.dataset.animation).toBe('walk')
    expect(sprite?.dataset.frames).toBe('8')
    expect(sprite?.dataset.renderSize).toBe('136')
    expect(sprite?.getAttribute('style')).toContain('width: 136px')
    expect(sprite?.getAttribute('style')).toContain('scaleX(-1)')
    expect(sprite?.getAttribute('style')).toContain('background-position')
  })

  it('supports an oversized boss render that is clearly larger than the hero', () => {
    const { container } = render(<LessonAssetMonsterSprite skin="tiny-demon" mode="attack" direction="right" frame={2} renderSize={240} />)
    const sprite = container.querySelector('[data-monster-skin="tiny-demon"]') as HTMLElement | null
    expect(sprite?.dataset.renderSize).toBe('240')
    expect(sprite?.getAttribute('style')).toContain('width: 240px')
    expect(sprite?.getAttribute('style')).toContain('height: 240px')
  })
})
