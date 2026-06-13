import type { NapGramPlugin } from '@napgram/plugin-kit'
import { bindInstanceLifecycle } from '@napgram/plugin-kit'
import { ForwardFeature } from '../features/forward/ForwardFeature.js'

const plugin: NapGramPlugin = {
  id: 'core-forward',
  name: 'Core Forward Feature',
  version: '1.0.0',
  description: 'Native QQ <-> Telegram forwarding lifecycle for runtime instances',
  install: async (ctx) => {
    const lifecycle = await bindInstanceLifecycle(ctx, {
      shouldAttach: instance => Boolean(instance.tgBot && instance.qqClient && instance.mediaFeature && instance.commandsFeature),
      attach: (instance: any) => {
        const existing = instance.forwardFeature as ForwardFeature | undefined
        const feature = existing ?? new ForwardFeature(
          instance,
          instance.tgBot,
          instance.qqClient,
          instance.mediaFeature,
          instance.commandsFeature,
        )
        instance.forwardFeature = feature
        return true
      },
      detach: (instance: any) => {
        try {
          instance.forwardFeature?.destroy?.()
        }
        finally {
          instance.forwardFeature = undefined
        }
      },
    })

    ctx.onUnload(() => lifecycle.dispose())
  },
}

export default plugin
