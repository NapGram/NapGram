import { env, getLogger } from '@napgram/infra-kit'

// 使用动态导入避免打包时的路径问题
const builtinQqNapcatAdapter = () => import('@napgram/plugin-adapter-qq-napcat')
const builtinTelegramAdapter = () => import('@napgram/plugin-adapter-telegram-mtcute')
const builtinAdminAuth = () => import('@napgram/plugin-admin-auth')
const builtinAdminDatabase = () => import('@napgram/plugin-admin-database')
const builtinAdminInstances = () => import('@napgram/plugin-admin-instances')
const builtinAdminLogs = () => import('@napgram/plugin-admin-logs')
const builtinAdminMessages = () => import('@napgram/plugin-admin-messages')
const builtinAdminPairs = () => import('@napgram/plugin-admin-pairs')
const builtinAdminPlugins = () => import('@napgram/plugin-admin-plugins')
const builtinAdminSettings = () => import('@napgram/plugin-admin-settings')
const builtinAdminSuite = () => import('@napgram/plugin-admin-suite')
const builtinCommands = () => import('@napgram/plugin-commands')
const builtinFlags = () => import('@napgram/plugin-flags')
const builtinForward = () => import('@napgram/plugin-forward')
const builtinGateway = () => import('@napgram/plugin-gateway')
const builtinGroupManagement = () => import('@napgram/plugin-group-management')
const builtinMedia = () => import('@napgram/plugin-media')
const builtinMonitoring = () => import('@napgram/plugin-monitoring')
const builtinNotifications = () => import('@napgram/plugin-notifications')
const builtinPingPong = () => import('@napgram/plugin-ping-pong')
const builtinQQInteraction = () => import('@napgram/plugin-qq-interaction')
const builtinRecall = () => import('@napgram/plugin-recall')
const builtinRefresh = () => import('@napgram/plugin-refresh')
const builtinRequestHandler = () => import('@napgram/plugin-request-handler')
const builtinRequestManagement = () => import('@napgram/plugin-request-management')
const builtinStatistics = () => import('@napgram/plugin-statistics')
const builtinWebAssets = () => import('@napgram/plugin-web-assets')
const builtinWebConsole = () => import('@napgram/plugin-web-console')

const logger = getLogger('Builtins')

export const builtins = [
    {
        id: 'adapter-qq-napcat',
        module: '@builtin/adapter-qq-napcat',
        enabled: true,
        load: builtinQqNapcatAdapter,
    },
    {
        id: 'adapter-telegram-mtcute',
        module: '@builtin/adapter-telegram-mtcute',
        enabled: true,
        load: builtinTelegramAdapter,
    },
    {
        id: 'ping-pong',
        module: '@builtin/ping-pong',
        enabled: true,
        load: builtinPingPong,
    },
    {
        id: 'commands',
        module: '@builtin/commands',
        enabled: true,
        load: builtinCommands,
    },
    {
        id: 'qq-interaction',
        module: '@builtin/qq-interaction',
        enabled: true,
        load: builtinQQInteraction,
    },
    {
        id: 'refresh',
        module: '@builtin/refresh',
        enabled: true,
        load: builtinRefresh,
    },
    {
        id: 'flags',
        module: '@builtin/flags',
        enabled: true,
        load: builtinFlags,
    },
    {
        id: 'request-handler',
        module: '@builtin/request-handler',
        enabled: true,
        load: builtinRequestHandler,
    },
    {
        id: 'request-management',
        module: '@builtin/request-management',
        enabled: true,
        load: builtinRequestManagement,
    },
    {
        id: 'group-management',
        module: '@builtin/group-management',
        enabled: true,
        load: builtinGroupManagement,
    },
    {
        id: 'media',
        module: '@builtin/media',
        enabled: true,
        load: builtinMedia,
    },
    {
        id: 'recall',
        module: '@builtin/recall',
        enabled: true,
        load: builtinRecall,
    },
    {
        id: 'forward',
        module: '@builtin/forward',
        enabled: true,
        load: builtinForward,
    },
    {
        id: 'monitoring',
        module: '@builtin/monitoring',
        enabled: true,
        load: builtinMonitoring,
    },
    {
        id: 'statistics',
        module: '@builtin/statistics',
        enabled: true,
        load: builtinStatistics,
    },
    {
        id: 'gateway',
        module: '@builtin/gateway',
        enabled: false,
        load: builtinGateway,
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
        load: builtinNotifications,
    },
    {
        id: 'admin-auth',
        module: '@builtin/admin-auth',
        enabled: false,
        load: builtinAdminAuth,
    },
    {
        id: 'admin-instances',
        module: '@builtin/admin-instances',
        enabled: false,
        load: builtinAdminInstances,
    },
    {
        id: 'admin-pairs',
        module: '@builtin/admin-pairs',
        enabled: false,
        load: builtinAdminPairs,
    },
    {
        id: 'admin-messages',
        module: '@builtin/admin-messages',
        enabled: false,
        load: builtinAdminMessages,
    },
    {
        id: 'admin-logs',
        module: '@builtin/admin-logs',
        enabled: false,
        load: builtinAdminLogs,
    },
    {
        id: 'admin-settings',
        module: '@builtin/admin-settings',
        enabled: false,
        load: builtinAdminSettings,
    },
    {
        id: 'admin-plugins',
        module: '@builtin/admin-plugins',
        enabled: false,
        load: builtinAdminPlugins,
    },
    {
        id: 'admin-database',
        module: '@builtin/admin-database',
        enabled: false,
        load: builtinAdminDatabase,
    },
    {
        id: 'admin-suite',
        module: '@builtin/admin-suite',
        enabled: true,
        load: builtinAdminSuite,
    },
    {
        id: 'web-assets',
        module: '@builtin/web-assets',
        enabled: true,
        load: builtinWebAssets,
    },
    {
        id: 'web-console',
        module: '@builtin/web-console',
        enabled: true,
        load: builtinWebConsole,
    },
]
