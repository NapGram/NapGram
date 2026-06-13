import { beforeEach, describe, expect, it, vi } from 'vitest'
import { messageConverter } from '@napgram/message-kit'
import { FeatureManager } from '../FeatureManager'

const lifecycleEvents = vi.hoisted(() => [] as string[])

function createFeatureClass(name: 'media' | 'commands' | 'forward') {
  return class {
    destroy = vi.fn(async () => {
      lifecycleEvents.push(`destroy:${name}`)
    })

    constructor() {
      lifecycleEvents.push(`create:${name}`)
    }
  }
}

vi.mock('../runtime/index.js', () => ({
  MediaFeature: createFeatureClass('media'),
  CommandsFeature: createFeatureClass('commands'),
  ForwardFeature: createFeatureClass('forward'),
}))

vi.mock('@napgram/message-kit', () => ({
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
      forwardFeature: undefined,
    }
  })

  it('host-manages the core features in order', async () => {
    const manager = new FeatureManager(mockInstance, mockTgBot, mockQqClient)
    await manager.initialize()

    expect(lifecycleEvents).toEqual([
      'create:media',
      'create:commands',
      'create:forward',
    ])
    expect(messageConverter.setInstance).toHaveBeenCalledWith(mockInstance)
    expect(manager.getFeatureStatus()).toEqual({
      media: true,
      commands: true,
      forward: true,
    })
    expect(mockInstance.mediaFeature).toBeDefined()
    expect(mockInstance.commandsFeature).toBeDefined()
    expect(mockInstance.forwardFeature).toBeDefined()
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
      'destroy:forward',
      'destroy:commands',
      'destroy:media',
    ])
    expect(mockInstance.mediaFeature).toBeUndefined()
    expect(mockInstance.commandsFeature).toBeUndefined()
    expect(mockInstance.forwardFeature).toBeUndefined()
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

  it('enableFeature returns true when feature exists', async () => {
    const manager = new FeatureManager(mockInstance, mockTgBot, mockQqClient)
    await manager.initialize()
    expect(manager.enableFeature('media')).toBe(true)
    expect(manager.enableFeature('nonexistent')).toBe(false)
  })

  it('disableFeature returns true when feature exists', async () => {
    const manager = new FeatureManager(mockInstance, mockTgBot, mockQqClient)
    await manager.initialize()
    expect(manager.disableFeature('media')).toBe(true)
    expect(manager.disableFeature('nonexistent')).toBe(false)
  })

  it('handles destroy when feature map has gaps', async () => {
    const manager = new FeatureManager(mockInstance, mockTgBot, mockQqClient)
    await manager.initialize()
    // Manually remove a feature to test the `continue` branch
    ;(manager as any).features.delete('forward')
    await manager.destroy()
    // Should not crash
  })

  it('handles features without destroy method', async () => {
    const manager = new FeatureManager(mockInstance, mockTgBot, mockQqClient)
    // Register a feature without destroy
    manager.registerFeature('media', {} as any)
    await manager.destroy()
    // Should not crash
  })
})
