import type { NapGramPlugin } from '@napgram/plugin-kit'
import { bindInstanceLifecycle } from '@napgram/plugin-kit'
import { CommandsFeature } from '../features/commands/CommandsFeature.js'

const plugin: NapGramPlugin = {
  id: 'core-commands',
  name: 'Core Commands Feature',
  version: '1.0.0',
  description: 'Native command handling lifecycle for runtime instances',
  install: async (ctx) => {
    const lifecycle = await bindInstanceLifecycle(ctx, {
      shouldAttach: instance => Boolean(instance.tgBot && instance.qqClient),
      attach: (instance: any) => {
        const existing = instance.commandsFeature as CommandsFeature | undefined
        const feature = existing ?? new CommandsFeature(instance, instance.tgBot, instance.qqClient)
        instance.commandsFeature = feature
        return true
      },
      detach: (instance: any) => {
        try {
          instance.commandsFeature?.destroy?.()
        }
        finally {
          instance.commandsFeature = undefined
        }
      },
    })

    ctx.onUnload(() => lifecycle.dispose())
  },
}

export default plugin
