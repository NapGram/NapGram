import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

describe('logger', () => {
  describe('getLogger', () => {
    it('should return logger with all 5 methods', async () => {
      const getLogger = (await import('../logger.js')).default
      const logger = getLogger('test')

      expect(typeof logger.trace).toBe('function')
      expect(typeof logger.debug).toBe('function')
      expect(typeof logger.info).toBe('function')
      expect(typeof logger.warn).toBe('function')
      expect(typeof logger.error).toBe('function')
    })

    it('should not throw when calling log methods', async () => {
      const getLogger = (await import('../logger.js')).default
      const logger = getLogger('test')

      expect(() => logger.trace('trace')).not.toThrow()
      expect(() => logger.debug('debug')).not.toThrow()
      expect(() => logger.info('info')).not.toThrow()
      expect(() => logger.warn('warn')).not.toThrow()
      expect(() => logger.error('error')).not.toThrow()
    })
  })

  describe('setConsoleLogLevel', () => {
    it('should not throw when setting log level', async () => {
      const { setConsoleLogLevel } = await import('../logger.js')

      expect(() => setConsoleLogLevel('debug')).not.toThrow()
      expect(() => setConsoleLogLevel('info')).not.toThrow()
      expect(() => setConsoleLogLevel('warn')).not.toThrow()
      expect(() => setConsoleLogLevel('error')).not.toThrow()
    })
  })

  describe('rotateIfNeeded', () => {
    it('should not throw when called', async () => {
      const { rotateIfNeeded } = await import('../logger.js')

      expect(() => rotateIfNeeded()).not.toThrow()
    })
  })
})
