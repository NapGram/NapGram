import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@sentry/node', () => ({
  init: vi.fn(),
  setTag: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  flush: vi.fn().mockResolvedValue(true),
}))

describe('sentry', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  describe('initSentry', () => {
    it('should not throw when called', async () => {
      const sentry = (await import('../sentry.js')).default
      expect(() => sentry.init()).not.toThrow()
    })
  })

  describe('captureException', () => {
    it('should not throw when called', async () => {
      const { captureException } = await import('../sentry.js')
      const error = new Error('test error')
      expect(() => captureException(error)).not.toThrow()
    })

    it('should accept extra context', async () => {
      const { captureException } = await import('../sentry.js')
      const error = new Error('test error')
      expect(() => captureException(error, { key: 'value' })).not.toThrow()
    })
  })

  describe('captureMessage', () => {
    it('should not throw when called', async () => {
      const { captureMessage } = await import('../sentry.js')
      expect(() => captureMessage('test message')).not.toThrow()
    })

    it('should accept extra context', async () => {
      const { captureMessage } = await import('../sentry.js')
      expect(() => captureMessage('test message', { key: 'value' })).not.toThrow()
    })
  })

  describe('flush', () => {
    it('should return true when not initialized', async () => {
      const { flush } = await import('../sentry.js')
      const result = await flush()
      expect(result).toBe(true)
    })

    it('should accept timeout parameter', async () => {
      const { flush } = await import('../sentry.js')
      const result = await flush(5000)
      expect(result).toBe(true)
    })
  })

  describe('default export', () => {
    it('should export all functions', async () => {
      const sentry = (await import('../sentry.js')).default
      expect(typeof sentry.init).toBe('function')
      expect(typeof sentry.captureException).toBe('function')
      expect(typeof sentry.captureMessage).toBe('function')
      expect(typeof sentry.flush).toBe('function')
    })
  })
})
