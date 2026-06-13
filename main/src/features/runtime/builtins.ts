import type { PluginSpec } from '@napgram/plugin-kit'

export const coreFeatureBuiltins: PluginSpec[] = [
  {
    id: 'core-media',
    module: '@builtin/core-media',
    enabled: true,
    load: () => import('./plugins/core-media.js'),
  },
  {
    id: 'core-commands',
    module: '@builtin/core-commands',
    enabled: true,
    load: () => import('./plugins/core-commands.js'),
  },
  {
    id: 'core-forward',
    module: '@builtin/core-forward',
    enabled: true,
    load: () => import('./plugins/core-forward.js'),
  },
]
