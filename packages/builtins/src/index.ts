import { env } from '@napgram/env-kit'

// ---------------------------------------------------------------------------
// Plugin import map — static strings required for bundler compatibility
// ---------------------------------------------------------------------------
type BuiltinModuleLoader = () => Promise<unknown>

const IMPORT_MAP: Record<string, BuiltinModuleLoader> = {
  'adapter-qq-napcat': () => import('@napgram/plugin-adapter-qq-napcat'),
  'adapter-telegram-mtcute': () => import('@napgram/plugin-adapter-telegram-mtcute'),
  'admin-auth': () => import('@napgram/plugin-admin-auth'),
  'admin-database': () => import('@napgram/plugin-admin-database'),
  'admin-instances': () => import('@napgram/plugin-admin-instances'),
  'admin-logs': () => import('@napgram/plugin-admin-logs'),
  'admin-messages': () => import('@napgram/plugin-admin-messages'),
  'admin-pairs': () => import('@napgram/plugin-admin-pairs'),
  'admin-plugins': () => import('@napgram/plugin-admin-plugins'),
  'admin-settings': () => import('@napgram/plugin-admin-settings'),
  'admin-suite': () => import('@napgram/plugin-admin-suite'),
  'flags': () => import('@napgram/plugin-flags'),
  'gateway': () => import('@napgram/plugin-gateway'),
  'group-management': () => import('@napgram/plugin-group-management'),
  'monitoring': () => import('@napgram/plugin-monitoring'),
  'notifications': () => import('@napgram/plugin-notifications'),
  'permission-management': () => import('@napgram/plugin-permission-management'),
  'ping-pong': () => import('@napgram/plugin-ping-pong'),
  'qq-interaction': () => import('@napgram/plugin-qq-interaction'),
  'refresh': () => import('@napgram/plugin-refresh'),
  'request-handler': () => import('@napgram/plugin-request-handler'),
  'request-management': () => import('@napgram/plugin-request-management'),
  'statistics': () => import('@napgram/plugin-statistics'),
  'web-assets': () => import('@napgram/plugin-web-assets'),
  'web-console': () => import('@napgram/plugin-web-console'),
}

// ---------------------------------------------------------------------------
// Declarative plugin registry: [id, enabled, config?]
// ---------------------------------------------------------------------------
interface BuiltinPlugin {
  id: string
  module: string
  enabled: boolean
  config?: Record<string, unknown>
  load: BuiltinModuleLoader
}

type PluginDef = [id: string, enabled: boolean] | [id: string, enabled: boolean, config: Record<string, unknown>]

const REGISTRY: PluginDef[] = [
  // Adapters
  ['adapter-qq-napcat', true],
  ['adapter-telegram-mtcute', true],

  // Core features
  ['ping-pong', false],
  ['qq-interaction', true],
  ['refresh', true],
  ['flags', true],
  ['request-handler', true],
  ['request-management', true],
  ['group-management', true],
  ['monitoring', true],
  ['statistics', true],

  // Optional / env-gated
  ['gateway', false],
  ['notifications', Boolean(env.ENABLE_OFFLINE_NOTIFICATION), {
    enabled: Boolean(env.ENABLE_OFFLINE_NOTIFICATION),
    adminQQ: env.ADMIN_QQ,
    adminTG: env.ADMIN_TG,
    cooldownMs: env.OFFLINE_NOTIFICATION_COOLDOWN,
  }],

  // Admin panel
  ['admin-auth', false],
  ['admin-instances', false],
  ['admin-pairs', false],
  ['admin-messages', false],
  ['admin-logs', false],
  ['admin-settings', false],
  ['admin-plugins', false],
  ['admin-database', false],
  ['admin-suite', true],
  ['permission-management', true],

  // Web UI
  ['web-assets', true],
  ['web-console', true],
]

export const builtins: BuiltinPlugin[] = REGISTRY.map(([id, enabled, config]) => ({
  id,
  module: `@builtin/${id}`,
  enabled,
  ...(config ? { config } : {}),
  load: IMPORT_MAP[id],
}))
