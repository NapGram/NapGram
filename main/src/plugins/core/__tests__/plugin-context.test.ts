import type { EventBus } from '../event-bus'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PluginContextImpl } from '../plugin-context'

const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}

vi.mock('../../api/logger', () => ({
  createPluginLogger: vi.fn(() => mockLogger),
}))

vi.mock('../../api/storage', () => ({
  createPluginStorage: vi.fn(() => ({})),
}))

describe('pluginContextImpl', () => {
  let eventBus: EventBus
  let context: PluginContextImpl

  beforeEach(() => {
    vi.clearAllMocks()
    eventBus = {
      subscribe: vi.fn(),
      publish: vi.fn(),
      removePluginSubscriptions: vi.fn(),
    } as any
    context = new PluginContextImpl('test-plugin', { foo: 'bar' }, eventBus)
  })

  it('initialization and metadata', () => {
    expect(context.pluginId).toBe('test-plugin')
    expect(context.config).toEqual({ foo: 'bar' })
    expect(context.logger).toBeDefined()
    expect(context.storage).toBeDefined()
  })

  it('event subscription', () => {
    const handler = vi.fn()
    context.on('message', handler)
    expect(eventBus.subscribe).toHaveBeenCalledWith('message', handler, undefined, 'test-plugin')
  })

  it('command registration', () => {
    context.command({
      name: 'test',
      aliases: ['t'],
      handler: async () => { },
    })
    const commands = (context as any).getCommands()
    expect(commands.has('test')).toBe(true)
    expect(commands.has('t')).toBe(true)
  })

  it('lifecycle hooks registration', () => {
    const onReload = vi.fn()
    const onUnload = vi.fn()
    context.onReload(onReload)
    context.onUnload(onUnload)
    expect((context as any).reloadCallbacks).toContain(onReload)
    expect((context as any).unloadCallbacks).toContain(onUnload)
  })

  it('lifecycle hooks triggering', async () => {
    const onReload = vi.fn()
    const onUnload = vi.fn()
    context.onReload(onReload)
    context.onUnload(onUnload)

    await context.triggerReload()
    expect(onReload).toHaveBeenCalled()

    await context.triggerUnload()
    expect(onUnload).toHaveBeenCalled()
  })

  it('lifecycle hooks error handling', async () => {
    context.onReload(() => {
      throw new Error('reload fail')
    })
    context.onUnload(() => {
      throw new Error('unload fail')
    })

    await context.triggerReload()
    expect(mockLogger.error).toHaveBeenCalledWith('Error in reload callback:', expect.any(Error))

    await context.triggerUnload()
    expect(mockLogger.error).toHaveBeenCalledWith('Error in unload callback:', expect.any(Error))
  })

  it('cleanup', () => {
    context.cleanup()
    expect(eventBus.removePluginSubscriptions).toHaveBeenCalledWith('test-plugin')
  })

  it('mock apis work when not provided', async () => {
    // MessageAPI
    expect(await context.message.send({})).toBeDefined()
    await context.message.recall('')
    expect(await context.message.get('')).toBeNull()

    // InstanceAPI
    expect(await context.instance.list()).toEqual([])
    expect(await context.instance.get(0)).toBeNull()
    expect(await context.instance.getStatus(0)).toBe('unknown')

    // UserAPI
    expect(await context.user.getInfo('')).toBeNull()
    expect(await context.user.isFriend('')).toBe(false)

    // GroupAPI
    expect(await context.group.getInfo('')).toBeNull()
    expect(await context.group.getMembers('')).toEqual([])
    await context.group.setAdmin('', '', true)
    await context.group.muteUser('', '', 60)
    await context.group.kickUser('', '')
  })
})
