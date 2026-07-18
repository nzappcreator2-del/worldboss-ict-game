// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  MAP_ENTRANCE_TEMPLATES,
  entranceTemplateById,
  entranceTemplateForLesson,
} from './mapEntranceTemplates'

afterEach(cleanup)

describe('mapEntranceTemplates', () => {
  it('ships exactly ten templates with unique ids and Thai display names', () => {
    expect(MAP_ENTRANCE_TEMPLATES).toHaveLength(10)
    const ids = MAP_ENTRANCE_TEMPLATES.map((template) => template.id)
    expect(new Set(ids).size).toBe(10)
    for (const template of MAP_ENTRANCE_TEMPLATES) {
      expect(template.name.length).toBeGreaterThan(0)
    }
  })

  it('resolves a template by id and falls back to rotating by lesson index', () => {
    const first = MAP_ENTRANCE_TEMPLATES[0]
    expect(entranceTemplateById(first.id)).toBe(first)
    expect(entranceTemplateById('no-such-style')).toBeUndefined()

    expect(entranceTemplateForLesson('', 0)).toBe(MAP_ENTRANCE_TEMPLATES[0])
    expect(entranceTemplateForLesson(undefined, 3)).toBe(MAP_ENTRANCE_TEMPLATES[3])
    expect(entranceTemplateForLesson(undefined, 12)).toBe(MAP_ENTRANCE_TEMPLATES[2])
    expect(entranceTemplateForLesson(MAP_ENTRANCE_TEMPLATES[7].id, 0)).toBe(MAP_ENTRANCE_TEMPLATES[7])
  })

  it('renders every template as scalable SVG art', () => {
    for (const template of MAP_ENTRANCE_TEMPLATES) {
      const { container, unmount } = render(<template.Art />)
      const svg = container.querySelector('svg')
      expect(svg, template.id).toBeTruthy()
      expect(svg?.getAttribute('viewBox'), template.id).toBeTruthy()
      unmount()
    }
  })
})
