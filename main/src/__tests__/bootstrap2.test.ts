import { performanceMonitor } from '@napgram/infra-kit'
import { describe, expect, it, jest, mock } from 'bun:test'
import { getTelemetryErrorMessage, isTransientConnectionError, maskProxyUrl, startWindowedPerformanceLog } from '../bootstrap.js'

mock.module('@napgram/infra-kit', async () => {
  return {
    performanceMonitor: {
      getStats: mock().mockReturnValue({ totalMessages: 100, errorRate: 0.1 }),
    },
  }
})

describe('bootstrap utils', () => {
  it('maskProxyUrl masks passwords', () => {
    expect(maskProxyUrl('http://user:pass@host.com/')).toBe('http://user:***@host.com/')
    expect(maskProxyUrl('http://host.com/')).toBe('http://host.com/')
    expect(maskProxyUrl('//invalid-url-user:pass@host.com/')).toBe('//invalid-url-user:***@host.com/')
  })

  it('getTelemetryErrorMessage normalizes errors and message-like values', () => {
    expect(getTelemetryErrorMessage(new TypeError('Value 1'))).toBe('TypeError: Value 1')
    expect(getTelemetryErrorMessage({ message: 'Value 2' })).toBe('Value 2')
    expect(getTelemetryErrorMessage(undefined)).toBe('')
  })

  it('isTransientConnectionError identifies correct errors', () => {
    expect(isTransientConnectionError('ConnectionError: WebSocket 错误')).toBe(true)
    expect(isTransientConnectionError('ConnectionClosedError: connect()')).toBe(true)
    expect(isTransientConnectionError('ConnectionError: 连接超时')).toBe(true)
    expect(isTransientConnectionError('WebSocket error: disconnected')).toBe(true)
    expect(isTransientConnectionError('Some other error')).toBe(false)
  })

  it('startWindowedPerformanceLog works', () => {
    jest.useFakeTimers()
    const log = { debug: mock(), warn: mock() }
    startWindowedPerformanceLog(log as any)

    jest.advanceTimersByTime(60_000)
    expect(log.debug).toHaveBeenCalled()
    expect(performanceMonitor.getStats).toHaveBeenCalled()

    // Test error branch
    performanceMonitor.getStats.mockImplementationOnce(() => {
      throw new Error('Test')
    })
    jest.advanceTimersByTime(60_000)
    expect(log.warn).toHaveBeenCalled()

    jest.useRealTimers()
  })
})
