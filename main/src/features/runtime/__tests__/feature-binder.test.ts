import { describe, expect, it, mock } from 'bun:test'
import { createInstanceFeatureBinder } from '../feature-binder.js'

describe('createInstanceFeatureBinder', () => {
  it('creates binder with correct lifecycle methods', async () => {
    const getFeature = mock()
    const setFeature = mock()
    const createFeature = mock().mockResolvedValue('feature')
    const destroyFeature = mock().mockResolvedValue(undefined)

    const binder = createInstanceFeatureBinder<any, any>({
      shouldAttach: instance => instance.ready,
      getFeature,
      setFeature,
      createFeature,
      destroyFeature,
    })

    const instance = { ready: true }
    expect(binder.shouldAttach?.(instance)).toBe(true)

    // Attach without existing
    await binder.attach(instance)
    expect(getFeature).toHaveBeenCalledWith(instance)
    expect(createFeature).toHaveBeenCalledWith(instance)
    expect(setFeature).toHaveBeenCalledWith(instance, 'feature')

    // Attach with existing
    getFeature.mockReturnValueOnce('existing')
    createFeature.mockClear()
    await binder.attach(instance)
    expect(createFeature).not.toHaveBeenCalled()
    expect(setFeature).toHaveBeenCalledWith(instance, 'existing')

    // Detach
    getFeature.mockReturnValueOnce('feature')
    await binder.detach(instance)
    expect(destroyFeature).toHaveBeenCalledWith('feature', instance)
    expect(setFeature).toHaveBeenCalledWith(instance, undefined)
  })
})
