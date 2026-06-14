import { performanceMonitor } from '@napgram/infra-kit'
import { describe, expect, it, vi } from 'vitest'
import { getSentryMessage, isTransientConnectionError, maskProxyUrl, startWindowedPerformanceLog } from '../bootstrap.js'

vi.mock('@napgram/infra-kit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@napgram/infra-kit')>()
  return {
    ...actual,
    performanceMonitor: {
      getStats: vi.fn().mockReturnValue({ totalMessages: 100, errorRate: 0.1 }),
    },
  }
})

describe('bootstrap utils', () => {
  it('maskProxyUrl masks passwords', () => {
    expect(maskProxyUrl('http://user:pass@host.com/')).toBe('http://user:***@host.com/')
    expect(maskProxyUrl('http://host.com/')).toBe('http://host.com/')
    expect(maskProxyUrl('//invalid-url-user:pass@host.com/')).toBe('//invalid-url-user:***@host.com/')
  })

  it('getSentryMessage extracts message and exception values', () => {
    const event = {
      message: 'Test message',
      exception: {
        values: [
          { type: 'Error', value: 'Value 1' },
          { type: 'TypeError', value: 'Value 2' },
        ],
      },
    }
    expect(getSentryMessage(event as any)).toBe('Test message | Error | Value 1 | TypeError | Value 2')

    const emptyEvent = {}
    expect(getSentryMessage(emptyEvent as any)).toBe('')
  })

  it('isTransientConnectionError identifies correct errors', () => {
    expect(isTransientConnectionError('ConnectionError: WebSocket 错误')).toBe(true)
    expect(isTransientConnectionError('ConnectionClosedError: connect()')).toBe(true)
    expect(isTransientConnectionError('ConnectionError: 连接超时')).toBe(true)
    expect(isTransientConnectionError('WebSocket error: disconnected')).toBe(true)
    expect(isTransientConnectionError('Some other error')).toBe(false)
  })

  it('startWindowedPerformanceLog works', () => {
    vi.useFakeTimers()
    const log = { debug: vi.fn(), warn: vi.fn() }
    startWindowedPerformanceLog(log as any)

    vi.advanceTimersByTime(60_000)
    expect(log.debug).toHaveBeenCalled()
    expect(performanceMonitor.getStats).toHaveBeenCalled()

    // Test error branch
    vi.mocked(performanceMonitor.getStats).mockImplementationOnce(() => {
      throw new Error('Test')
    })
    vi.advanceTimersByTime(60_000)
    expect(log.warn).toHaveBeenCalled()

    vi.useRealTimers()
  })
})
