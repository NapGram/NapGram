import { describe, expect, it, vi } from 'vitest'
import { isTransientDbError, withDbRetry } from '../db-retry'

const mockLog = {
  warn: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  fatal: vi.fn(),
  trace: vi.fn(),
  child: vi.fn(),
  level: 'info',
  silent: vi.fn(),
} as any

describe('isTransientDbError', () => {
  it('returns true for known transient fragments', () => {
    expect(isTransientDbError(new Error('terminating connection due to administrator command'))).toBe(true)
    expect(isTransientDbError(new Error('server closed the connection unexpectedly'))).toBe(true)
    expect(isTransientDbError(new Error('Connection terminated'))).toBe(true)
    expect(isTransientDbError(new Error('Connection terminated unexpectedly'))).toBe(true)
    expect(isTransientDbError(new Error('ECONNRESET'))).toBe(true)
    expect(isTransientDbError(new Error('57P01'))).toBe(true)
    expect(isTransientDbError(new Error('57P02'))).toBe(true)
    expect(isTransientDbError(new Error('57P03'))).toBe(true)
  })

  it('returns false for non-transient errors', () => {
    expect(isTransientDbError(new Error('syntax error'))).toBe(false)
    expect(isTransientDbError(new Error('unique constraint violation'))).toBe(false)
  })

  it('handles non-Error values', () => {
    expect(isTransientDbError('ECONNRESET')).toBe(true)
    expect(isTransientDbError('some random string')).toBe(false)
    expect(isTransientDbError(null)).toBe(false)
    expect(isTransientDbError(undefined)).toBe(false)
  })
})

describe('withDbRetry', () => {
  it('returns result on first success', async () => {
    const action = vi.fn().mockResolvedValue('ok')
    const result = await withDbRetry(action, 'test', mockLog)
    expect(result).toBe('ok')
    expect(action).toHaveBeenCalledTimes(1)
  })

  it('retries on transient error and succeeds', async () => {
    const action = vi.fn()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValue('recovered')

    const result = await withDbRetry(action, 'test-retry', mockLog)
    expect(result).toBe('recovered')
    expect(action).toHaveBeenCalledTimes(2)
    expect(mockLog.warn).toHaveBeenCalled()
  })

  it('throws non-transient errors immediately', async () => {
    const action = vi.fn().mockRejectedValue(new Error('syntax error'))
    await expect(withDbRetry(action, 'test-fail', mockLog)).rejects.toThrow('syntax error')
    expect(action).toHaveBeenCalledTimes(1)
  })

  it('throws after max attempts exhausted', async () => {
    const action = vi.fn().mockRejectedValue(new Error('ECONNRESET'))
    await expect(withDbRetry(action, 'test-exhaust', mockLog, 2)).rejects.toThrow('ECONNRESET')
    expect(action).toHaveBeenCalledTimes(2)
  })
})
