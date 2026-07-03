import { describe, expect, it, vi } from 'vitest'
import { createLegacyRunner } from './legacyRunner'

describe('createLegacyRunner', () => {
  it('calls a Firebase service and forwards its result', async () => {
    const success = vi.fn()
    const runner = createLegacyRunner({ getLessons: vi.fn().mockResolvedValue({ success: true }) })

    runner.withSuccessHandler(success).getLessons('student-1')
    await vi.waitFor(() => expect(success).toHaveBeenCalledWith({ success: true }))
  })

  it('forwards rejected services to the failure handler', async () => {
    const failure = vi.fn()
    const runner = createLegacyRunner({ getLessons: vi.fn().mockRejectedValue(new Error('offline')) })

    runner.withFailureHandler(failure).getLessons()
    await vi.waitFor(() => expect(failure).toHaveBeenCalledWith(expect.objectContaining({ message: 'offline' })))
  })

  it('reports an unmigrated GAS method instead of failing silently', async () => {
    const failure = vi.fn()
    const runner = createLegacyRunner({})

    runner.withFailureHandler(failure).missingMethod()
    await vi.waitFor(() => expect(failure).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('missingMethod') })))
  })

  it('does not leak handlers into the next call', async () => {
    const first = vi.fn()
    const service = vi.fn().mockResolvedValue('ok')
    const runner = createLegacyRunner({ ping: service })

    runner.withSuccessHandler(first).ping()
    runner.ping()
    await vi.waitFor(() => expect(service).toHaveBeenCalledTimes(2))
    expect(first).toHaveBeenCalledTimes(1)
  })
})
