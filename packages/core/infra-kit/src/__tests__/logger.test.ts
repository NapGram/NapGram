import { describe, expect, it, mock } from 'bun:test'

const loggerKit = {
  getLogger: mock(),
  rotateIfNeeded: mock(),
  setConsoleLogLevel: mock(),
}

mock.module('@napgram/logger-kit', () => loggerKit)

const logger = await import('../logger.js')

describe('infra-kit logger compatibility facade', () => {
  it('re-exports the logger factory', () => {
    expect(logger.getLogger).toBe(loggerKit.getLogger)
    expect(logger.default).toBe(loggerKit.getLogger)
  })

  it('re-exports logger maintenance and configuration helpers', () => {
    expect(logger.rotateIfNeeded).toBe(loggerKit.rotateIfNeeded)
    expect(logger.setConsoleLogLevel).toBe(loggerKit.setConsoleLogLevel)
  })
})
