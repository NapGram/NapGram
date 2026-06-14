import { bindInstanceLifecycle } from '@napgram/plugin-kit'
import { describe, expect, it, vi } from 'vitest'
import { CommandsFeature } from '../../features/commands/CommandsFeature.js'
import { ForwardFeature } from '../../features/forward/ForwardFeature.js'
import { MediaFeature } from '../../features/MediaFeature.js'
import coreCommandsPlugin from '../core-commands.js'
import coreForwardPlugin from '../core-forward.js'
import coreMediaPlugin from '../core-media.js'

vi.mock('@napgram/plugin-kit', () => ({
  bindInstanceLifecycle: vi.fn().mockResolvedValue({ dispose: vi.fn() }),
}))

vi.mock('../../features/commands/CommandsFeature.js', () => ({
  CommandsFeature: vi.fn(function() { return { destroy: vi.fn() } })
}))
vi.mock('../../features/forward/ForwardFeature.js', () => ({
  ForwardFeature: vi.fn(function() { return { destroy: vi.fn() } })
}))
vi.mock('../../features/MediaFeature.js', () => ({
  MediaFeature: vi.fn(function() { return { destroy: vi.fn() } })
}))

describe('core Plugins', () => {
  it('core-commands handles lifecycle', async () => {
    const ctx = {
      native: {},
      on: vi.fn(),
      logger: {},
      onUnload: vi.fn(),
    }
    await coreCommandsPlugin.install(ctx as any)

    expect(bindInstanceLifecycle).toHaveBeenCalled()
    const binder = vi.mocked(bindInstanceLifecycle).mock.calls[0][1]

    const instanceWithBot = { tgBot: {}, qqClient: {}, commandsFeature: undefined } as any
    const instanceWithoutBot = { tgBot: undefined, qqClient: undefined } as any

    expect(binder.shouldAttach!(instanceWithBot)).toBe(true)
    expect(binder.shouldAttach!(instanceWithoutBot)).toBe(false)

    await binder.attach(instanceWithBot)
    expect(CommandsFeature).toHaveBeenCalled()
    expect(instanceWithBot.commandsFeature).toBeDefined()

    await binder.detach(instanceWithBot)
    expect(instanceWithBot.commandsFeature).toBeUndefined()

    // onUnload coverage
    const disposeFn = vi.mocked(ctx.onUnload).mock.calls[0][0]
    disposeFn()
  })

  it('core-forward handles lifecycle', async () => {
    vi.clearAllMocks()
    const ctx = {
      native: {},
      on: vi.fn(),
      logger: {},
      onUnload: vi.fn(),
    }
    await coreForwardPlugin.install(ctx as any)

    const binder = vi.mocked(bindInstanceLifecycle).mock.calls[0][1]

    const instanceWithBot = {
      tgBot: {},
      qqClient: {},
      mediaFeature: {},
      commandsFeature: {},
      forwardFeature: undefined,
    } as any
    const instanceWithoutBot = { tgBot: undefined } as any

    expect(binder.shouldAttach!(instanceWithBot)).toBe(true)
    expect(binder.shouldAttach!(instanceWithoutBot)).toBe(false)

    await binder.attach(instanceWithBot)
    expect(ForwardFeature).toHaveBeenCalled()
    expect(instanceWithBot.forwardFeature).toBeDefined()

    await binder.detach(instanceWithBot)
    expect(instanceWithBot.forwardFeature).toBeUndefined()
  })

  it('core-media handles lifecycle', async () => {
    vi.clearAllMocks()
    const ctx = {
      native: {},
      on: vi.fn(),
      logger: {},
      onUnload: vi.fn(),
    }
    await coreMediaPlugin.install(ctx as any)

    const binder = vi.mocked(bindInstanceLifecycle).mock.calls[0][1]

    const instanceWithBot = { tgBot: {}, qqClient: {}, mediaFeature: undefined } as any
    const instanceWithoutBot = { tgBot: undefined } as any

    expect(binder.shouldAttach!(instanceWithBot)).toBe(true)
    expect(binder.shouldAttach!(instanceWithoutBot)).toBe(false)

    await binder.attach(instanceWithBot)
    expect(MediaFeature).toHaveBeenCalled()
    expect(instanceWithBot.mediaFeature).toBeDefined()

    await binder.detach(instanceWithBot)
    expect(instanceWithBot.mediaFeature).toBeUndefined()
  })
})
