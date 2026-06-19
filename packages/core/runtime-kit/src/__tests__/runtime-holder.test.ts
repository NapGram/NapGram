import { describe, expect, it, vi, beforeEach } from 'vitest'

describe('runtime-holder', () => {
  describe('RuntimeRegistry', () => {
    it('should add items', async () => {
      const { RuntimeRegistry } = await import('../runtime-holder.js')
      const registry = new RuntimeRegistry<{ id: number }>()

      registry.add({ id: 1 })
      registry.add({ id: 2 })

      expect(registry.getAll()).toHaveLength(2)
    })

    it('should not add duplicate items', async () => {
      const { RuntimeRegistry } = await import('../runtime-holder.js')
      const registry = new RuntimeRegistry<{ id: number }>()

      registry.add({ id: 1 })
      registry.add({ id: 1 })

      expect(registry.getAll()).toHaveLength(1)
    })

    it('should remove items by id', async () => {
      const { RuntimeRegistry } = await import('../runtime-holder.js')
      const registry = new RuntimeRegistry<{ id: number }>()

      registry.add({ id: 1 })
      registry.add({ id: 2 })
      registry.remove(1)

      expect(registry.getAll()).toHaveLength(1)
      expect(registry.getById(1)).toBeUndefined()
      expect(registry.getById(2)).toBeDefined()
    })

    it('should handle removing non-existent items', async () => {
      const { RuntimeRegistry } = await import('../runtime-holder.js')
      const registry = new RuntimeRegistry<{ id: number }>()

      registry.add({ id: 1 })
      registry.remove(999)

      expect(registry.getAll()).toHaveLength(1)
    })

    it('should get items by id', async () => {
      const { RuntimeRegistry } = await import('../runtime-holder.js')
      const registry = new RuntimeRegistry<{ id: number; name: string }>()

      registry.add({ id: 1, name: 'first' })
      registry.add({ id: 2, name: 'second' })

      expect(registry.getById(1)).toEqual({ id: 1, name: 'first' })
      expect(registry.getById(2)).toEqual({ id: 2, name: 'second' })
      expect(registry.getById(3)).toBeUndefined()
    })

    it('should return copy of items array', async () => {
      const { RuntimeRegistry } = await import('../runtime-holder.js')
      const registry = new RuntimeRegistry<{ id: number }>()

      registry.add({ id: 1 })
      const items = registry.getAll()
      items.push({ id: 2 })

      expect(registry.getAll()).toHaveLength(1)
    })

    it('should reset all items', async () => {
      const { RuntimeRegistry } = await import('../runtime-holder.js')
      const registry = new RuntimeRegistry<{ id: number }>()

      registry.add({ id: 1 })
      registry.add({ id: 2 })
      registry.reset()

      expect(registry.getAll()).toHaveLength(0)
    })

    it('should dispose all items', async () => {
      const { RuntimeRegistry } = await import('../runtime-holder.js')
      const registry = new RuntimeRegistry<{ id: number }>()

      registry.add({ id: 1 })
      registry.dispose()

      expect(registry.getAll()).toHaveLength(0)
    })
  })

  describe('global runtime', () => {
    beforeEach(async () => {
      const { resetGlobalRuntime } = await import('../runtime-holder.js')
      resetGlobalRuntime()
    })

    it('should set and get global runtime', async () => {
      const { setGlobalRuntime, getGlobalRuntime } = await import('../runtime-holder.js')
      const mockRuntime = { id: 'test' } as any

      setGlobalRuntime(mockRuntime)
      expect(getGlobalRuntime()).toBe(mockRuntime)
    })

    it('should throw when getting uninitialized runtime', async () => {
      const { getGlobalRuntime } = await import('../runtime-holder.js')

      expect(() => getGlobalRuntime()).toThrow('PluginRuntime not initialized')
    })

    it('should reset global runtime', async () => {
      const { setGlobalRuntime, resetGlobalRuntime, tryGetGlobalRuntime } = await import('../runtime-holder.js')

      setGlobalRuntime({ id: 'test' } as any)
      resetGlobalRuntime()

      expect(tryGetGlobalRuntime()).toBeNull()
    })

    it('should tryGetGlobalRuntime return null when not initialized', async () => {
      const { tryGetGlobalRuntime } = await import('../runtime-holder.js')

      expect(tryGetGlobalRuntime()).toBeNull()
    })

    it('should tryGetGlobalRuntime return runtime when initialized', async () => {
      const { setGlobalRuntime, tryGetGlobalRuntime } = await import('../runtime-holder.js')
      const mockRuntime = { id: 'test' } as any

      setGlobalRuntime(mockRuntime)
      expect(tryGetGlobalRuntime()).toBe(mockRuntime)
    })
  })

  describe('InstanceRegistry', () => {
    beforeEach(async () => {
      const { InstanceRegistry } = await import('../runtime-holder.js')
      InstanceRegistry.reset()
    })

    it('should be a RuntimeRegistry instance', async () => {
      const { InstanceRegistry } = await import('../runtime-holder.js')

      expect(InstanceRegistry).toBeDefined()
      expect(typeof InstanceRegistry.add).toBe('function')
      expect(typeof InstanceRegistry.remove).toBe('function')
      expect(typeof InstanceRegistry.getAll).toBe('function')
    })
  })
})
