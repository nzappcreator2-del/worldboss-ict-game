import { describe, expect, it, vi } from 'vitest'
import { buildErrorReport, createErrorReporter } from './errorReporting'

describe('client error reporting', () => {
  it('caps every field to the rules limits and fills safe defaults', () => {
    const report = buildErrorReport('x'.repeat(2000), 'y'.repeat(9000), null, undefined)
    expect(report.message).toHaveLength(1000)
    expect(report.stack).toHaveLength(4000)
    expect(report.source).toBe('unknown')
    expect(report.userAgent).toBe('')
  })

  it('deduplicates repeated errors and never throws when saving fails', async () => {
    const save = vi.fn().mockRejectedValue(new Error('offline'))
    const report = createErrorReporter(save)

    await expect(report('boom', '', 'a.js')).resolves.toBe(false)
    expect(save).toHaveBeenCalledTimes(1)
    await expect(report('boom', '', 'a.js')).resolves.toBe(false)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('stops after the per-session report budget', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const report = createErrorReporter(save)

    for (let index = 0; index < 12; index += 1) {
      await report(`error-${index}`, '', 'b.js')
    }
    expect(save).toHaveBeenCalledTimes(10)
  })
})
