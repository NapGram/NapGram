import { definePlugin } from '@napgram/sdk'
import { drizzleDb, getLogger, InstanceRegistry, sql } from './shared-runtime.js'
import { PermissionService } from './services/PermissionService.js'
import { PermissionCommands } from './commands/PermissionCommands.js'
import { PermissionLevel } from './types/index.js'
import { commandPermissions, permissionAuditLogs, userPermissions } from './database/schema.js'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const logger = getLogger('PermissionManagementPlugin')

// ESM __dirname alternative
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * 检查权限管理表是否存在
 */
async function checkPermissionTablesExist(): Promise<boolean> {
    try {
        const db = drizzleDb
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
async function runAutoMigration(): Promise<void> {
    try {
        const db = drizzleDb
        const migrationPath = join(__dirname, 'database/migrations/001_initial.sql')
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
    async install(ctx) {
        logger.info('Initializing Permission Management Plugin')

        // 1. 检查并执行数据库迁移
        const tablesExist = await checkPermissionTablesExist()
        if (!tablesExist) {
            logger.info('Permission tables not found, running auto-migration...')
            await runAutoMigration()
        } else {
            logger.info('Permission tables already exist, skipping migration')
        }

        // 2. 创建权限服务实例
        const permissionService = new PermissionService(InstanceRegistry.getById, {
            cacheEnabled: ctx.config?.cacheEnabled,
            cacheExpireMinutes: ctx.config?.cacheExpireMinutes,
            defaultLevel: typeof ctx.config?.defaultLevel === 'number'
                ? (ctx.config.defaultLevel as PermissionLevel)
                : undefined,
            enableAuditLog: ctx.config?.enableAuditLog,
        })

        // 3. 创建并注册命令
        const permissionCommands = new PermissionCommands(ctx, permissionService)
        permissionCommands.register()

            // 4. 暴露给命令系统/其他插件使用
            ; (ctx as any).exports = {
                permissionService,
                PermissionLevel,
            }

        ctx.onUnload(() => {
            permissionService.clearCache()
            logger.info('Permission Management Plugin unloaded')
        })

        logger.info('Permission Management Plugin initialized successfully')
    },
})

export default plugin

// 导出类型供其他插件使用
export { PermissionLevel } from './types/index.js'
export type {
    UserPermission,
    PermissionCheckResult,
    CommandPermissionConfig,
    AuditEventType,
    AuditLogEntry,
} from './types/index.js'
export { PermissionService } from './services/PermissionService.js'

// 导出数据库Schema供其他包使用
export { userPermissions, commandPermissions, permissionAuditLogs } from './database/schema.js'
