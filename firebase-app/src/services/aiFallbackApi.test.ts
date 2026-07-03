import { describe, expect, it } from 'vitest'
import { buildProgressReport, localTutorAnswer } from './aiFallbackApi'

describe('safe AI fallbacks', () => {
  it('answers without requiring or exposing an API key', () => {
    expect(localTutorAnswer('อินเทอร์เน็ตคืออะไร')).toContain('อินเทอร์เน็ตคืออะไร')
    expect(localTutorAnswer('อินเทอร์เน็ตคืออะไร')).not.toContain('API key')
  })

  it('builds a useful deterministic student report', () => {
    const report = buildProgressReport({ name: 'Ada', class: 'ป.5', xp: 350, level: 4, currentLesson: 'Internet' })
    expect(report).toContain('Ada')
    expect(report).toContain('350 XP')
    expect(report).toContain('Internet')
  })
})
