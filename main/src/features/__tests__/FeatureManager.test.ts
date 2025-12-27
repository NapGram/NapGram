import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CommandsFeature } from '../commands/CommandsFeature'
import { FeatureManager } from '../FeatureManager'
import { MediaFeature } from '../MediaFeature'
import { RecallFeature } from '../RecallFeature'

vi.mock('../commands/CommandsFeature')
vi.mock('../MediaFeature')
vi.mock('../RecallFeature')
vi.mock('../domain/message', () => ({
  messageConverter: {
    setInstance: vi.fn(),
  },
}))

describe('featureManager', () => {
  const mockInstance = { id: 1 } as any
  const mockTgBot = {} as any
  const mockQqClient = {} as any

  beforeEach(() => {
    vi.clearAllMocks()
    mockInstance.mediaFeature = undefined
    mockInstance.commandsFeature = undefined
    mockInstance.recallFeature = undefined
    mockInstance.forwardFeature = undefined
  })

  it('should initialize all features', async () => {
    const manager = new FeatureManager(mockInstance, mockTgBot, mockQqClient)
    await manager.initialize()

    expect(MediaFeature).toHaveBeenCalledWith(mockInstance, mockTgBot, mockQqClient)
    expect(CommandsFeature).toHaveBeenCalledWith(mockInstance, mockTgBot, mockQqClient)
    expect(RecallFeature).toHaveBeenCalledWith(mockInstance, mockTgBot, mockQqClient)

    const status = manager.getFeatureStatus()
    expect(status).toEqual({
      media: true,
      commands: true,
      recall: true,
    })
  })

  it('should use plugin-provided forward feature', async () => {
    const forwardFeature = { destroy: vi.fn() }
    const instanceWithForward = { id: 1, forwardFeature } as any
    const manager = new FeatureManager(instanceWithForward, mockTgBot, mockQqClient)

    await manager.initialize()

    expect(manager.forward).toBe(forwardFeature)
    const status = manager.getFeatureStatus()
    expect(status).toEqual({
      media: true,
      commands: true,
      forward: true,
      recall: true,
    })
  })

  it('should use plugin-provided commands feature', async () => {
    const commandsFeature = { destroy: vi.fn() }
    const instanceWithCommands = { id: 1, commandsFeature } as any
    const manager = new FeatureManager(instanceWithCommands, mockTgBot, mockQqClient)

    await manager.initialize()

    expect(manager.commands).toBe(commandsFeature)
    expect(CommandsFeature).not.toHaveBeenCalled()
    const status = manager.getFeatureStatus()
    expect(status.commands).toBe(true)
  })

  it('should enable and disable features', async () => {
    const manager = new FeatureManager(mockInstance, mockTgBot, mockQqClient)
    await manager.initialize()

    expect(manager.enableFeature('media')).toBe(true)
    expect(manager.disableFeature('media')).toBe(true)

    expect(manager.enableFeature('unknown')).toBe(false)
    expect(manager.disableFeature('unknown')).toBe(false)
  })

  it('should handle errors during initialization', async () => {
    vi.mocked(MediaFeature).mockImplementationOnce(() => {
      throw new Error('Init error')
    })
    const manager = new FeatureManager(mockInstance, mockTgBot, mockQqClient)
    await expect(manager.initialize()).rejects.toThrow('Init error')
  })

  it('should destroy all features', async () => {
    const manager = new FeatureManager(mockInstance, mockTgBot, mockQqClient)
    await manager.initialize()

    // Mock destroy methods
    const mockDestroy = vi.fn()
    manager.media!.destroy = mockDestroy
    manager.commands!.destroy = mockDestroy
    manager.recall!.destroy = mockDestroy

    await manager.destroy()
    expect(mockDestroy).toHaveBeenCalledTimes(3)
  })

  it('should skip non-function destroy handlers', async () => {
    const manager = new FeatureManager(mockInstance, mockTgBot, mockQqClient)
    await manager.initialize()

    const mockDestroy = vi.fn()
    manager.media!.destroy = mockDestroy
    manager.commands!.destroy = 'noop' as any
    manager.recall!.destroy = mockDestroy

    await manager.destroy()
    expect(mockDestroy).toHaveBeenCalledTimes(2)
  })

  it('should handle errors during destroy', async () => {
    const manager = new FeatureManager(mockInstance, mockTgBot, mockQqClient)
    await manager.initialize()

    const failingDestroy = vi.fn().mockImplementation(() => {
      throw new Error('Destroy failed')
    })
    const workingDestroy = vi.fn()

    manager.media!.destroy = failingDestroy
    manager.commands!.destroy = workingDestroy

    await manager.destroy()
    expect(workingDestroy).toHaveBeenCalled()
    expect(failingDestroy).toHaveBeenCalled()
  })
})
