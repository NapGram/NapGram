import { describe, it, expect, vi } from 'vitest'
import { CommandsFeature } from '../CommandsFeature.js'
import { CommandRegistry } from '../services/CommandRegistry.js'

vi.mock('../services/CommandRegistry.js', () => ({
  CommandRegistry: vi.fn(function CommandRegistryMock() {
    return {
      register: vi.fn(),
      unregister: vi.fn(),
      getCommand: vi.fn(),
      get: vi.fn(),
      execute: vi.fn(),
      getAll: vi.fn().mockReturnValue([]),
      getHelpText: vi.fn().mockReturnValue('help'),
      clear: vi.fn(),
      getUniqueCommandCount: vi.fn().mockReturnValue(0),
    }
  }),
}))

describe('CommandsFeature Anonymous Handlers', () => {
  it('covers handlers', async () => {
    const mockInstance = { id: 1, config: {} } as any
    const mockTgBot = { addNewMessageEventHandler: vi.fn(), on: vi.fn() } as any
    const mockQqClient = { on: vi.fn(), off: vi.fn() } as any
    
    const feature = new CommandsFeature(mockInstance, mockTgBot, mockQqClient)
    await feature.reloadCommands()
    const registryMock = (vi.mocked(CommandRegistry).mock.results[0].value as any).register
    const calls = registryMock.mock.calls

    // Mock internal methods so we can just execute the handlers
    const f = feature as any
    f.handleWorkModeCommand = vi.fn().mockResolvedValue(undefined)
    f.helpHandler = { execute: vi.fn().mockResolvedValue(undefined) }
    f.statusHandler = { execute: vi.fn().mockResolvedValue(undefined) }
    f.bindHandler = { execute: vi.fn().mockResolvedValue(undefined) }
    f.unbindHandler = { execute: vi.fn().mockResolvedValue(undefined) }
    f.recallHandler = { execute: vi.fn().mockResolvedValue(undefined) }
    f.forwardControlHandler = { execute: vi.fn().mockResolvedValue(undefined) }
    f.infoHandler = { execute: vi.fn().mockResolvedValue(undefined) }
    f.handleAddQQTargetCommand = vi.fn().mockResolvedValue(undefined)

    const msg = { chat: { id: 1 }, sender: { id: 2 }, content: [] } as any
    
    for (const call of calls) {
      console.log('Registered command:', call[0]?.name)
      const cmd = call[0]
      if (cmd && cmd.handler) {
        try { await cmd.handler(msg, ['args']) } catch(e) {}
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
