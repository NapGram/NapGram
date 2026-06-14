import { definePlugin } from '@napgram/sdk'
import type { PluginContext, PluginLogger } from '@napgram/sdk'
import { getSystemOwners, type AdminIdentityValue } from '@napgram/env-kit'
import { sql } from 'drizzle-orm'
import { PermissionService } from './services/PermissionService.js'
import type { PermissionDatabase, PermissionServiceExports } from './services/PermissionService.js'
import { PermissionCommands } from './commands/PermissionCommands.js'
import { PermissionLevel } from './types/index.js'
import { commandPermissions, permissionAuditLogs, userPermissions } from './database/schema.js'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const moduleFilePath = fileURLToPath(import.meta.url)
const moduleDir = dirname(moduleFilePath)

type SystemOwnersConfig = {
    qq?: AdminIdentityValue
    tg?: AdminIdentityValue
}

/**
 * 检查权限管理表是否存在
 */
async function checkPermissionTablesExist(db: PermissionDatabase, logger: PluginLogger): Promise<boolean> {
    try {
        const result = await db.execute(sql`
            SELECT COUNT(*) as count
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name IN ('UserPermissions', 'CommandPermissions', 'PermissionAuditLogs')
        `)

        const count = parseInt(String((result.rows[0] as any)?.count || '0'))
        return count === 3
    } catch (error) {
        logger.warn({ error }, 'Failed to check permission tables')
        return false
    }
}

/**
 * 自动执行数据库迁移
 */
async function runAutoMigration(db: PermissionDatabase, logger: PluginLogger): Promise<void> {
    try {
        const migrationPath = join(moduleDir, 'database/migrations/001_initial.sql')
        const migrationSQL = readFileSync(migrationPath, 'utf-8')

        logger.info('Running database migration for permission management...')
        await db.execute(sql.raw(migrationSQL))
        logger.info('Database migration completed successfully')
    } catch (error) {
        logger.error({ error }, 'Failed to run database migration')
        throw error
    }
}

/**
 * 权限管理插件
 * 提供完整的多级权限控制系统
 */
const plugin = definePlugin({
    id: 'permission-management',
    name: '权限管理',
    version: '0.1.0',
    author: 'NapGram Team',
    description: '提供完整的多级权限控制系统，支持权限授予/撤销与审计日志',
    permissions: {
        instances: [],
    },
    drizzleSchema: {
        userPermissions,
        commandPermissions,
        permissionAuditLogs,
    },
    async install(ctx: PluginContext) {
        const db = ctx.database as PermissionDatabase | null | undefined
        if (!db || typeof db.execute !== 'function') {
            throw new Error('Permission management plugin requires a database client')
        }

        ctx.logger.info('Initializing Permission Management Plugin')

        const tablesExist = await checkPermissionTablesExist(db, ctx.logger)
        if (!tablesExist) {
            ctx.logger.info('Permission tables not found, running auto-migration...')
            await runAutoMigration(db, ctx.logger)
        } else {
            ctx.logger.info('Permission tables already exist, skipping migration')
        }

        const permissionService = new PermissionService(
            db,
            ctx.logger,
            async (instanceId: number) => ctx.instance.get(instanceId),
            {
                cacheEnabled: ctx.config?.cacheEnabled,
                cacheExpireMinutes: ctx.config?.cacheExpireMinutes,
                defaultLevel: typeof ctx.config?.defaultLevel === 'number'
                    ? (ctx.config.defaultLevel as PermissionLevel)
                    : undefined,
                enableAuditLog: ctx.config?.enableAuditLog,
                systemOwners: (ctx.config?.systemOwners as SystemOwnersConfig | undefined) ?? getSystemOwners(),
            },
        )

        const permissionCommands = new PermissionCommands(ctx, permissionService)
        permissionCommands.register()

        const pluginExports: PermissionServiceExports = {
            permissionService,
        }
        ;(plugin as typeof plugin & { exports?: PermissionServiceExports }).exports = pluginExports

        ctx.onUnload(() => {
            permissionService.clearCache()
            ctx.logger.info('Permission Management Plugin unloaded')
        })

        ctx.logger.info('Permission Management Plugin initialized successfully')
    },
})

export default plugin

export { PermissionLevel } from './types/index.js'
export type {
    UserPermission,
    PermissionCheckResult,
    CommandPermissionConfig,
    AuditEventType,
    AuditLogEntry,
} from './types/index.js'
export { PermissionService } from './services/PermissionService.js'
export type { PermissionServiceExports } from './services/PermissionService.js'

export { userPermissions, commandPermissions, permissionAuditLogs } from './database/schema.js'
