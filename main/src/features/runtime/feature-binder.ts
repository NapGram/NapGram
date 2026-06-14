export interface InstanceFeatureBinderOptions<TInstance, TFeature> {
  shouldAttach?: (instance: TInstance) => boolean
  getFeature: (instance: TInstance) => TFeature | undefined
  setFeature: (instance: TInstance, feature: TFeature | undefined) => void
  createFeature: (instance: TInstance) => TFeature | Promise<TFeature>
  destroyFeature?: (feature: TFeature, instance: TInstance) => void | Promise<void>
}

export function createInstanceFeatureBinder<TInstance, TFeature>(
  options: InstanceFeatureBinderOptions<TInstance, TFeature>,
) {
  return {
    shouldAttach: options.shouldAttach,
    attach: async (instance: TInstance) => {
      const existing = options.getFeature(instance)
      const feature = existing ?? await options.createFeature(instance)
      options.setFeature(instance, feature)
      return true
    },
    detach: async (instance: TInstance) => {
      const feature = options.getFeature(instance)
      try {
        if (feature && options.destroyFeature) {
          await options.destroyFeature(feature, instance)
        }
      }
      finally {
        options.setFeature(instance, undefined)
      }
    },
  }
}
