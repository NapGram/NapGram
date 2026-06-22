import { bindInstanceLifecycle } from '@napgram/plugin-kit'
import { definePlugin } from '@napgram/sdk'
import { createInstanceFeatureBinder } from '../feature-binder.js'
import { ForwardFeature } from '../features/forward/ForwardFeature.js'

const plugin = definePlugin({
  id: 'core-forward',
  name: 'Core Forward Feature',
  version: '1.0.0',
  description: 'Native QQ <-> Telegram forwarding lifecycle for runtime instances',
  install: async (ctx) => {
    const lifecycle = await bindInstanceLifecycle({
      native: (ctx as any).native,
      on: ctx.on.bind(ctx),
      logger: ctx.logger,
    }, {
      ...createInstanceFeatureBinder<any, ForwardFeature>({
        shouldAttach: instance => Boolean(instance.tgBot && instance.qqClient),
        getFeature: instance => instance.forwardFeature as ForwardFeature | undefined,
        setFeature: (instance, feature) => {
          instance.forwardFeature = feature
        },
        createFeature: instance => new ForwardFeature(
          instance,
          instance.tgBot,
          instance.qqClient,
          instance.mediaFeature,
          instance.commandsFeature,
        ),
        destroyFeature: feature => feature.destroy?.(),
      }),
    })

    ctx.onUnload(() => lifecycle.dispose())
  },
})

export default plugin
