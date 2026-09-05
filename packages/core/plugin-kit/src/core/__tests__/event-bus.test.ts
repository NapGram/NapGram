import { beforeAll, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test'

const loggerInstance = {
  debug: mock(),
  info: mock(),
  error: mock(),
  warn: mock(),
}
const getLoggerMock = mock(() => loggerInstance)

mock.module('@napgram/logger-kit', () => ({
  getLogger: getLoggerMock,
}))

let EventBus: typeof import('../event-bus.js').EventBus
beforeAll(async () => {
  ({ EventBus } = await import('../event-bus.js'))
})

describe('eventBus', () => {
  let eventBus: InstanceType<typeof EventBus>

  beforeEach(() => {
    mock.clearAllMocks()
    eventBus = new EventBus()
  })

  it('subscribe and unsubscribe', () => {
    const handler = mock()
    const subscription = eventBus.subscribe('message', handler)

    expect(eventBus.getSubscriptionCount('message')).toBe(1)

    subscription.unsubscribe()
    subscription.unsubscribe()
    expect(eventBus.getSubscriptionCount('message')).toBe(0)
  })

  it('once', async () => {
    const handler = mock()
    eventBus.once('message', handler)

    expect(eventBus.getSubscriptionCount('message')).toBe(1)

    await eventBus.publish('message', { id: '1' } as any)
    expect(handler).toHaveBeenCalledTimes(1)
    expect(eventBus.getSubscriptionCount('message')).toBe(0)
  })

  it('publish calls all handlers', async () => {
    const handler1 = mock()
    const handler2 = mock()
    eventBus.subscribe('message', handler1)
    eventBus.subscribe('message', handler2)

    await eventBus.publish('message', { id: '1' } as any)

    expect(handler1).toHaveBeenCalledWith({ id: '1' })
    expect(handler2).toHaveBeenCalledWith({ id: '1' })
    expect(eventBus.getStats().published).toBe(1)
    expect(eventBus.getStats().handled).toBe(2)
  })

  it('publish with filter', async () => {
    const handler = mock()
    const filter = (event: any) => event.id === '1'
    eventBus.subscribe('message', handler, filter)

    await eventBus.publish('message', { id: '2' } as any)
    expect(handler).not.toHaveBeenCalled()

    await eventBus.publish('message', { id: '1' } as any)
    expect(handler).toHaveBeenCalledWith({ id: '1' })
  })

  it('publish handles error in handler', async () => {
    const handler1 = mock(() => {
      throw new Error('fail')
    })
    const handler2 = mock()
    eventBus.subscribe('message', handler1)
    eventBus.subscribe('message', handler2)

    await eventBus.publish('message', { id: '1' } as any)

    expect(handler2).toHaveBeenCalled()
    expect(eventBus.getStats().errors).toBe(1)
  })

  it('publishSync', () => {
    const handler = mock()
    eventBus.subscribe('message', handler)

    eventBus.publishSync('message', { id: '1' } as any)
    // publishSync is async internally but we can check the stats eventually or use a mock with delay
    expect(eventBus.getStats().published).toBe(1)
  })

  it('publishSync logs errors from publish', async () => {
    const freshBus = new EventBus()
    spyOn(freshBus, 'publish').mockRejectedValueOnce(new Error('boom'))

    freshBus.publishSync('message', { id: '1' } as any)

    await Promise.resolve()

    expect(loggerInstance.error).toHaveBeenCalled()
  })

  it('removePluginSubscriptions', () => {
    const handler1 = mock()
    const handler2 = mock()
    eventBus.subscribe('message', handler1, undefined, 'plugin1')
    eventBus.subscribe('message', handler2, undefined, 'plugin2')
    eventBus.subscribe('notice', handler1, undefined, 'plugin1')

    expect(eventBus.getSubscriptionCount()).toBe(3)
    expect(eventBus.getPluginSubscriptionCount('plugin1')).toBe(2)

    eventBus.removePluginSubscriptions('plugin1')
    expect(eventBus.getSubscriptionCount()).toBe(1)
    expect(eventBus.getSubscriptionCount('message')).toBe(1)
    expect(eventBus.getPluginSubscriptionCount('plugin1')).toBe(0)
  })

  it('getStats and resetStats', async () => {
    eventBus.subscribe('message', mock())
    await eventBus.publish('message', {} as any)

    expect(eventBus.getStats().published).toBe(1)

    eventBus.resetStats()
    expect(eventBus.getStats().published).toBe(0)
    expect(eventBus.getStats().activeSubscriptions).toBe(1)
  })

  it('clear', () => {
    eventBus.subscribe('message', mock())
    eventBus.subscribe('notice', mock())

    expect(eventBus.getSubscriptionCount()).toBe(2)
    eventBus.clear()
    expect(eventBus.getSubscriptionCount()).toBe(0)
  })

  it('getEventTypes', () => {
    eventBus.subscribe('message', mock())
    eventBus.subscribe('notice', mock())

    expect(eventBus.getEventTypes()).toContain('message')
    expect(eventBus.getEventTypes()).toContain('notice')
  })

  it('should clean up empty subscription set after unsubscribe', () => {
    // Test coverage for lines 161-169 (unsubscribe loop and cleanup)
    const handler = mock()
    const sub1 = eventBus.subscribe('message', handler)
    const sub2 = eventBus.subscribe('message', handler)

    expect(eventBus.getSubscriptionCount('message')).toBe(2)

    // Unsubscribe one
    sub1.unsubscribe()
    expect(eventBus.getSubscriptionCount('message')).toBe(1)

    // Unsubscribe the last one - this should clean up the empty Set (line 169-170)
    sub2.unsubscribe()
    expect(eventBus.getSubscriptionCount('message')).toBe(0)
    expect(eventBus.getEventTypes()).not.toContain('message')
  })

  it('should unsubscribe specific subscription when multiple exist', () => {
    // Test coverage for line 161 (loop iteration finding specific ID)
    const handler = mock()
    const sub1 = eventBus.subscribe('message', handler)
    const sub2 = eventBus.subscribe('message', handler)
    const sub3 = eventBus.subscribe('message', handler)

    expect(eventBus.getSubscriptionCount('message')).toBe(3)

    // Unsubscribe middle one - ensures loop visits sub1 (no match) then sub2 (match)
    sub2.unsubscribe()
    expect(eventBus.getSubscriptionCount('message')).toBe(2)

    // Unsubscribe last one
    sub3.unsubscribe()
    expect(eventBus.getSubscriptionCount('message')).toBe(1)

    // Unsubscribe first one
    sub1.unsubscribe()
    expect(eventBus.getSubscriptionCount('message')).toBe(0)
  })

  it('should handle error without pluginId context', async () => {
    // Test coverage for line 254 (context without pluginId)
    const handler = mock(() => {
      throw new Error('test error')
    })

    // Subscribe without pluginId
    eventBus.subscribe('message', handler)

    await eventBus.publish('message', { id: '1' } as any)

    expect(eventBus.getStats().errors).toBe(1)
  })

  it('should handle error with pluginId context', async () => {
    // Test coverage for line 254 (context with pluginId)
    const handler = mock(() => {
      throw new Error('test error')
    })

    // Subscribe with pluginId
    eventBus.subscribe('message', handler, undefined, 'my-plugin')

    await eventBus.publish('message', { id: '1' } as any)

    expect(eventBus.getStats().errors).toBe(1)
  })
})
