import { bindInstanceLifecycle } from '@napgram/plugin-kit'
import { definePlugin } from '@napgram/sdk'
import { createInstanceFeatureBinder } from '../feature-binder.js'
import { MediaFeature } from '../features/MediaFeature.js'

const plugin = definePlugin({
  id: 'core-media',
  name: 'Core Media Feature',
  version: '1.0.0',
  description: 'Native media helper used by the forward pipeline',
  install: async (ctx) => {
    const lifecycle = await bindInstanceLifecycle({
      native: (ctx as any).native,
      on: ctx.on.bind(ctx),
      logger: ctx.logger,
    }, {
      ...createInstanceFeatureBinder<any, MediaFeature>({
        shouldAttach: instance => Boolean(instance.tgBot && instance.qqClient),
        getFeature: instance => instance.mediaFeature as MediaFeature | undefined,
        setFeature: (instance, feature) => {
          instance.mediaFeature = feature
        },
        createFeature: instance => new MediaFeature(instance, instance.tgBot, instance.qqClient),
        destroyFeature: feature => feature.destroy?.(),
      }),
    })

    ctx.onUnload(() => lifecycle.dispose())
  },
})

export default plugin
