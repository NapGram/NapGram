import * as Sentry from '@sentry/node'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../index', () => ({
  env: {
    ERROR_REPORTING: false,
    LOG_FILE: '/tmp/test.log',
  },
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
  })),
}))

vi.mock('@sentry/node', () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  setTag: vi.fn(),
  flush: vi.fn(),
}))

describe('sentry Disabled', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('should NOT init if disabled', async () => {
    const sentry = (await import('../sentry.js')).default
    sentry.init()
    expect(Sentry.init).not.toHaveBeenCalled()
  })

  it('should NOT capture exception if disabled', async () => {
    const sentry = (await import('../sentry.js')).default
    sentry.captureException(new Error('fail'))
    expect(Sentry.captureException).not.toHaveBeenCalled()
    expect(Sentry.init).not.toHaveBeenCalled()
  })

  it('should NOT capture message if disabled', async () => {
    const sentry = (await import('../sentry.js')).default
    sentry.captureMessage('fail')
    expect(Sentry.captureMessage).not.toHaveBeenCalled()
  })

  it('should return true immediately from flush if disabled', async () => {
    const sentry = (await import('../sentry.js')).default
    const result = await sentry.flush()
    expect(result).toBe(true)
    expect(Sentry.flush).not.toHaveBeenCalled()
  })
})
