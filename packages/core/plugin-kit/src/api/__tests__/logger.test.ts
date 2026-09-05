import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { createPluginLogger } from '../logger.js'

const loggerMocks = (() => ({
  debug: mock(),
  info: mock(),
  warn: mock(),
  error: mock(),
}))()

const getLoggerMock = (() => mock(() => loggerMocks))()

mock.module('@napgram/logger-kit', () => ({
  getLogger: getLoggerMock,
}))

describe('createPluginLogger', () => {
  beforeEach(() => {
    mock.clearAllMocks()
  })

  it('forwards log calls to the shared logger', () => {
    const logger = createPluginLogger('test-plugin')

    logger.debug('debug', 1)
    logger.info('info', { ok: true })
    logger.warn('warn')
    logger.error('error', new Error('fail'))

    expect(getLoggerMock).toHaveBeenCalledWith('Plugin')
    expect(loggerMocks.debug).toHaveBeenCalledWith('[test-plugin] debug', 1)
    expect(loggerMocks.info).toHaveBeenCalledWith('[test-plugin] info', { ok: true })
    expect(loggerMocks.warn).toHaveBeenCalledWith('[test-plugin] warn')
    expect(loggerMocks.error).toHaveBeenCalledWith('[test-plugin] error', expect.any(Error))
  })
})
