import { env, getLogger } from '@napgram/infra-kit'
import builtinQqNapcatAdapter from '../../../packages/plugin-adapter-qq-napcat/src/index'
import builtinTelegramAdapter from '../../../packages/plugin-adapter-telegram-mtcute/src/index'
import builtinAdminAuth from '../../../packages/plugin-admin-auth/src/index'
import builtinAdminDatabase from '../../../packages/plugin-admin-database/src/index'
import builtinAdminInstances from '../../../packages/plugin-admin-instances/src/index'
import builtinAdminLogs from '../../../packages/plugin-admin-logs/src/index'
import builtinAdminMessages from '../../../packages/plugin-admin-messages/src/index'
import builtinAdminPairs from '../../../packages/plugin-admin-pairs/src/index'
import builtinAdminPlugins from '../../../packages/plugin-admin-plugins/src/index'
import builtinAdminSettings from '../../../packages/plugin-admin-settings/src/index'
import builtinAdminSuite from '../../../packages/plugin-admin-suite/src/index'
import builtinCommands from '../../../packages/plugin-commands/src/index'
import builtinFlags from '../../../packages/plugin-flags/src/index'
import builtinForward from '../../../packages/plugin-forward/src/index'
import builtinGateway from '../../../packages/plugin-gateway/src/index'
import builtinGroupManagement from '../../../packages/plugin-group-management/src/index'
import builtinMedia from '../../../packages/plugin-media/src/index'
import builtinMonitoring from '../../../packages/plugin-monitoring/src/index'
import builtinNotifications from '../../../packages/plugin-notifications/src/index'
import builtinPingPong from '../../../packages/plugin-ping-pong/src/index'
import builtinQQInteraction from '../../../packages/plugin-qq-interaction/src/index'
import builtinRecall from '../../../packages/plugin-recall/src/index'
import builtinRefresh from '../../../packages/plugin-refresh/src/index'
import builtinRequestHandler from '../../../packages/plugin-request-handler/src/index'
import builtinRequestManagement from '../../../packages/plugin-request-management/src/index'
import builtinStatistics from '../../../packages/plugin-statistics/src/index'
import builtinWebAssets from '../../../packages/plugin-web-assets/src/index'
import builtinWebConsole from '../../../packages/plugin-web-console/src/index'

const logger = getLogger('Builtins')

export const builtins = [
    {
        id: 'adapter-qq-napcat',
        module: '@builtin/adapter-qq-napcat',
        enabled: true,
        load: async () => builtinQqNapcatAdapter,
    },
    {
        id: 'adapter-telegram-mtcute',
        module: '@builtin/adapter-telegram-mtcute',
        enabled: true,
        load: async () => builtinTelegramAdapter,
    },
    {
        id: 'ping-pong',
        module: '@builtin/ping-pong',
        enabled: true,
        load: async () => builtinPingPong,
    },
    {
        id: 'commands',
        module: '@builtin/commands',
        enabled: true,
        load: async () => builtinCommands,
    },
    {
        id: 'qq-interaction',
        module: '@builtin/qq-interaction',
        enabled: true,
        load: async () => builtinQQInteraction,
    },
    {
        id: 'refresh',
        module: '@builtin/refresh',
        enabled: true,
        load: async () => builtinRefresh,
    },
    {
        id: 'flags',
        module: '@builtin/flags',
        enabled: true,
        load: async () => builtinFlags,
    },
    {
        id: 'request-handler',
        module: '@builtin/request-handler',
        enabled: true,
        load: async () => builtinRequestHandler,
    },
    {
        id: 'request-management',
        module: '@builtin/request-management',
        enabled: true,
        load: async () => builtinRequestManagement,
    },
    {
        id: 'group-management',
        module: '@builtin/group-management',
        enabled: true,
        load: async () => builtinGroupManagement,
    },
    {
        id: 'media',
        module: '@builtin/media',
        enabled: true,
        load: async () => builtinMedia,
    },
    {
        id: 'recall',
        module: '@builtin/recall',
        enabled: true,
        load: async () => builtinRecall,
    },
    {
        id: 'forward',
        module: '@builtin/forward',
        enabled: true,
        load: async () => builtinForward,
    },
    {
        id: 'monitoring',
        module: '@builtin/monitoring',
        enabled: true,
        load: async () => builtinMonitoring,
    },
    {
        id: 'statistics',
        module: '@builtin/statistics',
        enabled: true,
        load: async () => builtinStatistics,
    },
    {
        id: 'gateway',
        module: '@builtin/gateway',
        enabled: false,
        load: async () => builtinGateway,
    },
    {
        id: 'notifications',
        module: '@builtin/notifications',
        enabled: Boolean(env.ENABLE_OFFLINE_NOTIFICATION),
        config: {
            enabled: Boolean(env.ENABLE_OFFLINE_NOTIFICATION),
            adminQQ: env.ADMIN_QQ,
            adminTG: env.ADMIN_TG,
            cooldownMs: env.OFFLINE_NOTIFICATION_COOLDOWN,
        },
        load: async () => builtinNotifications,
    },
    {
        id: 'admin-auth',
        module: '@builtin/admin-auth',
        enabled: false,
        load: async () => builtinAdminAuth,
    },
    {
        id: 'admin-instances',
        module: '@builtin/admin-instances',
        enabled: false,
        load: async () => builtinAdminInstances,
    },
    {
        id: 'admin-pairs',
        module: '@builtin/admin-pairs',
        enabled: false,
        load: async () => builtinAdminPairs,
    },
    {
        id: 'admin-messages',
        module: '@builtin/admin-messages',
        enabled: false,
        load: async () => builtinAdminMessages,
    },
    {
        id: 'admin-logs',
        module: '@builtin/admin-logs',
        enabled: false,
        load: async () => builtinAdminLogs,
    },
    {
        id: 'admin-settings',
        module: '@builtin/admin-settings',
        enabled: false,
        load: async () => builtinAdminSettings,
    },
    {
        id: 'admin-plugins',
        module: '@builtin/admin-plugins',
        enabled: false,
        load: async () => builtinAdminPlugins,
    },
    {
        id: 'admin-database',
        module: '@builtin/admin-database',
        enabled: false,
        load: async () => builtinAdminDatabase,
    },
    {
        id: 'admin-suite',
        module: '@builtin/admin-suite',
        enabled: true,
        load: async () => builtinAdminSuite,
    },
    {
        id: 'web-assets',
        module: '@builtin/web-assets',
        enabled: true,
        load: async () => builtinWebAssets,
    },
    {
        id: 'web-console',
        module: '@builtin/web-console',
        enabled: true,
        load: async () => builtinWebConsole,
    },
]
