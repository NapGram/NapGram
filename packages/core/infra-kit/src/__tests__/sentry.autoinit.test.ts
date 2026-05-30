import * as Sentry from '@sentry/node'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock env BEFORE importing module
vi.mock('../index', () => ({
  env: {
    ERROR_REPORTING: true,
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
  flush: vi.fn().mockResolvedValue(true),
}))

describe('sentry Auto-Init', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('should auto-init when capturing exception if not initialized', async () => {
    const sentry = (await import('../sentry.js')).default
    sentry.captureException(new Error('oops'))

    expect(Sentry.init).toHaveBeenCalled()
    expect(Sentry.captureException).toHaveBeenCalled()
  })

  it('should auto-init when capturing message if not initialized', async () => {
    const sentry = (await import('../sentry.js')).default
    sentry.captureMessage('msg')

    expect(Sentry.init).toHaveBeenCalled()
    expect(Sentry.captureMessage).toHaveBeenCalled()
  })
})
