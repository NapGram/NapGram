import { definePlugin } from '@napgram/sdk'
import { bindInstanceLifecycle } from '@napgram/plugin-kit'
import { CommandsFeature } from '../features/commands/CommandsFeature.js'
import { createInstanceFeatureBinder } from '../feature-binder.js'

const plugin = definePlugin({
  id: 'core-commands',
  name: 'Core Commands Feature',
  version: '1.0.0',
  description: 'Native command handling lifecycle for runtime instances',
  install: async (ctx) => {
    const lifecycle = await bindInstanceLifecycle({
      native: (ctx as any).native,
      on: ctx.on,
      logger: ctx.logger,
    }, {
      ...createInstanceFeatureBinder<any, CommandsFeature>({
        shouldAttach: instance => Boolean(instance.tgBot && instance.qqClient),
        getFeature: instance => instance.commandsFeature as CommandsFeature | undefined,
        setFeature: (instance, feature) => {
          instance.commandsFeature = feature
        },
        createFeature: instance => new CommandsFeature(instance, instance.tgBot, instance.qqClient),
        destroyFeature: feature => feature.destroy?.(),
      }),
    })

    ctx.onUnload(() => lifecycle.dispose())
  },
})

export default plugin
