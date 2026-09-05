/* eslint-disable eslint-comments/no-unlimited-disable */
/* eslint-disable */
import { describe, expect, it, mock } from 'bun:test'
import { CommandsFeature } from '../CommandsFeature.js'
import { CommandRegistry } from '../services/CommandRegistry.js'

mock.module('../services/CommandRegistry.js', () => ({
  CommandRegistry: mock(function () {
    return {
      register: mock(),
      unregister: mock(),
      getCommand: mock(),
      get: mock(),
      execute: mock(),
      getAll: mock().mockReturnValue([]),
      getHelpText: mock().mockReturnValue('help'),
      clear: mock(),
      getUniqueCommandCount: mock().mockReturnValue(0),
    }
  }),
}))

describe('commandsFeature Anonymous Handlers', () => {
  it('covers handlers', async () => {
    const mockInstance = { id: 1, config: {} } as any
    const mockTgBot = { addNewMessageEventHandler: mock(), on: mock() } as any
    const mockQqClient = { on: mock(), off: mock() } as any

    const feature = new CommandsFeature(mockInstance, mockTgBot, mockQqClient)
    await feature.reloadCommands()
    const registryMock = (CommandRegistry.mock.results[0].value as any).register
    const calls = registryMock.mock.calls

    // Mock internal methods so we can just execute the handlers
    const f = feature as any
    f.handleWorkModeCommand = mock().mockResolvedValue(undefined)
    f.helpHandler = { execute: mock().mockResolvedValue(undefined) }
    f.statusHandler = { execute: mock().mockResolvedValue(undefined) }
    f.bindHandler = { execute: mock().mockResolvedValue(undefined) }
    f.unbindHandler = { execute: mock().mockResolvedValue(undefined) }
    f.recallHandler = { execute: mock().mockResolvedValue(undefined) }
    f.forwardControlHandler = { execute: mock().mockResolvedValue(undefined) }
    f.infoHandler = { execute: mock().mockResolvedValue(undefined) }
    f.handleAddQQTargetCommand = mock().mockResolvedValue(undefined)

    const msg = { chat: { id: 1 }, sender: { id: 2 }, content: [] } as any

    for (const call of calls) {
      console.log('Registered command:', call[0]?.name)
      const cmd = call[0]
      if (cmd && cmd.handler) {
        try { await cmd.handler(msg, ['args']) }
        catch (e) {}
      }
    }

    expect(f.handleWorkModeCommand).toHaveBeenCalled()
    expect(f.helpHandler.execute).toHaveBeenCalled()
    expect(f.statusHandler.execute).toHaveBeenCalled()
    expect(f.bindHandler.execute).toHaveBeenCalled()
    expect(f.unbindHandler.execute).toHaveBeenCalled()
    expect(f.recallHandler.execute).toHaveBeenCalled()
    expect(f.forwardControlHandler.execute).toHaveBeenCalled()
    expect(f.infoHandler.execute).toHaveBeenCalled()
    expect(f.handleAddQQTargetCommand).toHaveBeenCalled()
  })
})
