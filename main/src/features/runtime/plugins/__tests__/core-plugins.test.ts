import { bindInstanceLifecycle } from '@napgram/plugin-kit'
import { describe, expect, it, mock } from 'bun:test'
import { CommandsFeature } from '../../features/commands/CommandsFeature.js'
import { ForwardFeature } from '../../features/forward/ForwardFeature.js'
import { MediaFeature } from '../../features/MediaFeature.js'
import coreCommandsPlugin from '../core-commands.js'
import coreForwardPlugin from '../core-forward.js'
import coreMediaPlugin from '../core-media.js'

mock.module('@napgram/plugin-kit', () => ({
  bindInstanceLifecycle: mock().mockResolvedValue({ dispose: mock() }),
}))

/* eslint-disable prefer-arrow-callback -- class mocks must use function expressions to be constructable via `new` */
mock.module('../../features/commands/CommandsFeature.js', () => ({
  CommandsFeature: mock(function () { return { destroy: mock() } }),
}))
mock.module('../../features/forward/ForwardFeature.js', () => ({
  ForwardFeature: mock(function () { return { destroy: mock() } }),
}))
mock.module('../../features/MediaFeature.js', () => ({
  MediaFeature: mock(function () { return { destroy: mock() } }),
}))

describe('core Plugins', () => {
  it('core-commands handles lifecycle', async () => {
    const ctx = {
      native: {},
      on: mock(),
      logger: {},
      onUnload: mock(),
    }
    await coreCommandsPlugin.install(ctx as any)

    expect(bindInstanceLifecycle).toHaveBeenCalled()
    const binder = bindInstanceLifecycle.mock.calls[0][1]

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
    const disposeFn = ctx.onUnload.mock.calls[0][0]
    disposeFn()
  })

  it('core-forward handles lifecycle', async () => {
    mock.clearAllMocks()
    const ctx = {
      native: {},
      on: mock(),
      logger: {},
      onUnload: mock(),
    }
    await coreForwardPlugin.install(ctx as any)

    const binder = bindInstanceLifecycle.mock.calls[0][1]

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
    mock.clearAllMocks()
    const ctx = {
      native: {},
      on: mock(),
      logger: {},
      onUnload: mock(),
    }
    await coreMediaPlugin.install(ctx as any)

    const binder = bindInstanceLifecycle.mock.calls[0][1]

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
