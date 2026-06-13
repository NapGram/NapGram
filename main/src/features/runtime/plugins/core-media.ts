import type { NapGramPlugin } from '@napgram/plugin-kit'
import { bindInstanceLifecycle } from '@napgram/plugin-kit'
import { MediaFeature } from '../features/MediaFeature.js'

const plugin: NapGramPlugin = {
  id: 'core-media',
  name: 'Core Media Feature',
  version: '1.0.0',
  description: 'Native media helper used by the forward pipeline',
  install: async (ctx) => {
    const lifecycle = await bindInstanceLifecycle(ctx, {
      shouldAttach: instance => Boolean(instance.tgBot && instance.qqClient),
      attach: (instance: any) => {
        const existing = instance.mediaFeature as MediaFeature | undefined
        const feature = existing ?? new MediaFeature(instance, instance.tgBot, instance.qqClient)
        instance.mediaFeature = feature
        return true
      },
      detach: (instance: any) => {
        try {
          instance.mediaFeature?.destroy?.()
        }
        finally {
          instance.mediaFeature = undefined
        }
      },
    })

    ctx.onUnload(() => lifecycle.dispose())
  },
}

export default plugin
