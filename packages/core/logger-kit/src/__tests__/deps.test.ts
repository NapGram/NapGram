import { describe, expect, it, beforeEach, afterEach, mock, spyOn } from 'bun:test'

describe('deps', () => {
  describe('getInfraLogger', () => {
    it('should return logger with all 5 methods', async () => {
      const { getInfraLogger } = await import('../deps.js')
      const logger = getInfraLogger('test')

      expect(typeof logger.trace).toBe('function')
      expect(typeof logger.debug).toBe('function')
      expect(typeof logger.info).toBe('function')
      expect(typeof logger.warn).toBe('function')
      expect(typeof logger.error).toBe('function')
    })

    it('should call console methods with prefix', async () => {
      const traceSpy = spyOn(console, 'trace').mockImplementation(() => {})
      const debugSpy = spyOn(console, 'debug').mockImplementation(() => {})
      const infoSpy = spyOn(console, 'info').mockImplementation(() => {})
      const warnSpy = spyOn(console, 'warn').mockImplementation(() => {})
      const errorSpy = spyOn(console, 'error').mockImplementation(() => {})

      const { getInfraLogger } = await import('../deps.js')
      const logger = getInfraLogger('MyModule')

      logger.trace('trace message')
      logger.debug('debug message')
      logger.info('info message')
      logger.warn('warn message')
      logger.error('error message')

      expect(debugSpy).toHaveBeenCalledWith('[MyModule]', 'trace message')
      expect(debugSpy).toHaveBeenCalledWith('[MyModule]', 'debug message')
      expect(infoSpy).toHaveBeenCalledWith('[MyModule]', 'info message')
      expect(warnSpy).toHaveBeenCalledWith('[MyModule]', 'warn message')
      expect(errorSpy).toHaveBeenCalledWith('[MyModule]', 'error message')

      mock.restore()
    })
  })

  describe('configureLoggerKit', () => {
    it('should replace default logger factory', async () => {
      const customFactory = mock().mockReturnValue({
        trace: mock(),
        debug: mock(),
        info: mock(),
        warn: mock(),
        error: mock(),
      })

      const { configureLoggerKit, getInfraLogger } = await import('../deps.js')
      configureLoggerKit({ loggerFactory: customFactory })

      const logger = getInfraLogger('Test')
      logger.info('test')

      expect(customFactory).toHaveBeenCalledWith('Test')

      mock.restore()
    })
  })
})
