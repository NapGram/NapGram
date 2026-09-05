import { describe, expect, it, mock } from 'bun:test'

const rotateIfNeeded = mock()
mock.module('@napgram/logger-kit', () => ({
  getLogger: mock(),
  rotateIfNeeded,
  setConsoleLogLevel: mock(),
}))

const logger = await import('../logger.js')

describe('infra-kit logger cleanup compatibility', () => {
  it('exposes the logger-kit rotation hook', () => {
    expect(logger.rotateIfNeeded).toBe(rotateIfNeeded)
  })
})
