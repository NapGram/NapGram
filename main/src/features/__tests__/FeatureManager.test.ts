import { beforeEach, describe, expect, it, vi } from 'vitest'
import { messageConverter } from '../../domain/message'
import { FeatureManager } from '../FeatureManager'

const lifecycleEvents = vi.hoisted(() => [] as string[])

function createFeatureClass(name: 'media' | 'commands' | 'forward' | 'recall') {
  return class {
    destroy = vi.fn(async () => {
      lifecycleEvents.push(`destroy:${name}`)
    })

    constructor() {
      lifecycleEvents.push(`create:${name}`)
    }
  }
}

vi.mock('@napgram/feature-kit', () => ({
  MediaFeature: createFeatureClass('media'),
  CommandsFeature: createFeatureClass('commands'),
  ForwardFeature: createFeatureClass('forward'),
  RecallFeature: createFeatureClass('recall'),
}))

vi.mock('../../domain/message', () => ({
  messageConverter: {
    setInstance: vi.fn(),
  },
}))

describe('featureManager', () => {
  const mockTgBot = {} as any
  const mockQqClient = {} as any
  let mockInstance: any

  beforeEach(() => {
    vi.clearAllMocks()
    lifecycleEvents.length = 0
    mockInstance = {
      id: 1,
      forwardPairs: {},
      mediaFeature: undefined,
      commandsFeature: undefined,
      recallFeature: undefined,
      forwardFeature: undefined,
    }
  })

  it('host-manages the four core features in order', async () => {
    const manager = new FeatureManager(mockInstance, mockTgBot, mockQqClient)
    await manager.initialize()

    expect(lifecycleEvents).toEqual([
      'create:media',
      'create:commands',
      'create:forward',
      'create:recall',
    ])
    expect(messageConverter.setInstance).toHaveBeenCalledWith(mockInstance)
    expect(manager.getFeatureStatus()).toEqual({
      media: true,
      commands: true,
      forward: true,
      recall: true,
    })
    expect(mockInstance.mediaFeature).toBeDefined()
    expect(mockInstance.commandsFeature).toBeDefined()
    expect(mockInstance.forwardFeature).toBeDefined()
    expect(mockInstance.recallFeature).toBeDefined()
  })

  it('reuses existing feature instances when already attached', async () => {
    const existingForward = { destroy: vi.fn() }
    mockInstance.forwardFeature = existingForward

    const manager = new FeatureManager(mockInstance, mockTgBot, mockQqClient)
    await manager.initialize()

    expect(manager.forward).toBe(existingForward)
    expect(lifecycleEvents).not.toContain('create:forward')
  })

  it('destroys features in reverse order', async () => {
    const manager = new FeatureManager(mockInstance, mockTgBot, mockQqClient)
    await manager.initialize()

    lifecycleEvents.length = 0
    await manager.destroy()

    expect(lifecycleEvents).toEqual([
      'destroy:recall',
      'destroy:forward',
      'destroy:commands',
      'destroy:media',
    ])
    expect(mockInstance.mediaFeature).toBeUndefined()
    expect(mockInstance.commandsFeature).toBeUndefined()
    expect(mockInstance.forwardFeature).toBeUndefined()
    expect(mockInstance.recallFeature).toBeUndefined()
  })

  it('returns false for invalid or duplicate manual registrations', () => {
    const manager = new FeatureManager(mockInstance, mockTgBot, mockQqClient)

    expect(manager.registerFeature('media', undefined)).toBe(false)
    expect(manager.registerFeature('media', { destroy: vi.fn() } as any)).toBe(true)
    expect(manager.registerFeature('media', { destroy: vi.fn() } as any)).toBe(false)
  })

  it('surfaces initialization errors', async () => {
    vi.mocked(messageConverter.setInstance).mockImplementationOnce(() => {
      throw new Error('Init error')
    })

    const manager = new FeatureManager(mockInstance, mockTgBot, mockQqClient)
    await expect(manager.initialize()).rejects.toThrow('Init error')
  })
})
