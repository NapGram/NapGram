import { afterEach, describe, expect, it, vi } from 'vitest'

const clearGlobals = () => {
  delete (globalThis as any).__naplinkMockConstructor
  delete (globalThis as any).__naplinkMockInstance
}

describe('naplink mock', () => {
  afterEach(() => {
    clearGlobals()
  })

  it('uses fallback constructor and instance when globals are missing', async () => {
    clearGlobals()
    const { NapLink } = await import('./naplink')
    const instance = new NapLink('arg1')
    expect(instance).toHaveProperty('on')
    expect(instance).toHaveProperty('connect')
    expect(instance).toHaveProperty('disconnect')
    expect(instance).toHaveProperty('api')
  })

  it('uses injected constructor and instance when provided', async () => {
    const ctor = vi.fn()
    const customInstance = { tag: 'custom' }
    ;(globalThis as any).__naplinkMockConstructor = ctor
    ;(globalThis as any).__naplinkMockInstance = customInstance
    const { NapLink } = await import('./naplink')
    const instance = new NapLink('arg2')
    expect(ctor).toHaveBeenCalledWith('arg2')
    expect(instance).toBe(customInstance)
  })
})
