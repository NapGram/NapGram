import { describe, expect, it, vi } from 'vitest'
import { EventPublisher } from '../event-publisher.js'
import { globalEventBus } from '../event-bus.js'

describe('eventPublisher', () => {
  it('publishes message events', async () => {
    const spy = vi.spyOn(globalEventBus, 'publish').mockResolvedValue(undefined)
    const event: any = { eventId: '1', instanceId: 1 }

    await EventPublisher.publishMessage(event)

    expect(spy).toHaveBeenCalledWith('message', event)
  })

  it('publishes instance status events', async () => {
    const spy = vi.spyOn(globalEventBus, 'publish').mockResolvedValue(undefined)
    const event: any = { instanceId: 1, status: 'running' }

    await EventPublisher.publishInstanceStatus(event)

    expect(spy).toHaveBeenCalledWith('instance-status', event)
  })

  it('publishes compatibility message-created events', async () => {
    const spy = vi.spyOn(globalEventBus, 'publish').mockResolvedValue(undefined)

    await EventPublisher.publishMessageCreated(1, { text: 'hi' })

    expect(spy).toHaveBeenCalledWith('message-created', expect.objectContaining({
      instanceId: 1,
      message: { text: 'hi' },
    }))
  })
})
