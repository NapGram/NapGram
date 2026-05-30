import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { ApiResponse, drizzleDb, getLogger, sql } from './shared-host.js'

const logger = getLogger('PermissionAdmin')

/**
 * 权限管理 Web API
 * 使用原始 SQL 查询避免循环依赖
 */
export default async function permissionsRoutes(fastify: FastifyInstance) {
    async function requirePluginAdmin(request: any, reply: any) {
        const header = String(request.headers?.authorization || '')
        const bearer = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : ''
        const cookieToken = request.cookies?.admin_token ? String(request.cookies.admin_token) : ''
        const queryToken = request.query && typeof request.query === 'object' && 'token' in request.query ? String(request.query.token) : ''
        const token = bearer || cookieToken || queryToken

        const direct = String(process.env.PLUGIN_ADMIN_TOKEN || '').trim()
        if (direct && token && token === direct)
            return

        const { authMiddleware } = await import('@napgram/auth-kit')
        await authMiddleware(request, reply)
    }

    // ========== 用户权限管理 ==========

    fastify.get('/api/admin/permissions/users', { preHandler: requirePluginAdmin }, async (request, reply) => {
        try {
            const { instanceId } = request.query as { instanceId?: string }
            const targetInstanceId = instanceId !== undefined ? parseInt(instanceId) : 0

            const db = drizzleDb
            const results = await db.execute(sql`
                SELECT * FROM "UserPermissions"
                WHERE "instanceId" = ${targetInstanceId}
                ORDER BY "grantedAt" DESC
            `)

            const permissions = results.rows.map((r: any) => ({
                id: r.id,
                userId: r.userId,
                instanceId: r.instanceId,
                permissionLevel: r.permissionLevel,
                customPermissions: r.customPermissions,
                grantedBy: r.grantedBy,
                grantedAt: r.grantedAt,
                expiresAt: r.expiresAt,
                note: r.note,
            }))

            return ApiResponse.success({ permissions, total: permissions.length })
        } catch (error: any) {
            logger.error({ error }, 'Failed to list user permissions')
            return reply.code(500).send(ApiResponse.error(error?.message || String(error)))
        }
    })

    const grantPermissionSchema = z.object({
        userId: z.string().min(1),
        permissionLevel: z.number().int().min(0).max(4),
        instanceId: z.number().int().optional(),
        expiresInDays: z.number().int().min(1).optional(),
        note: z.string().optional(),
    })

    fastify.post('/api/admin/permissions/users', { preHandler: requirePluginAdmin }, async (request, reply) => {
        try {
            const body = grantPermissionSchema.safeParse(request.body ?? {})
            if (!body.success) {
                return reply.code(400).send({ success: false, error: 'Invalid request', details: body.error.issues })
            }

            const { userId, permissionLevel, instanceId, expiresInDays, note } = body.data
            const targetInstanceId = instanceId ?? 0
            const operatorId = (request as any).user?.userId || 'system'

            const db = drizzleDb
            const expiresAt = expiresInDays
                ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
                : null

            await db.execute(sql`
                INSERT INTO "UserPermissions" 
                    ("userId", "instanceId", "permissionLevel", "grantedBy", "grantedAt", "expiresAt", "note", "customPermissions")
                VALUES 
                    (${userId}, ${targetInstanceId}, ${permissionLevel}, ${operatorId}, NOW(), ${expiresAt}, ${note}, '{}'::jsonb)
                ON CONFLICT ("userId", "instanceId") 
                DO UPDATE SET
                    "permissionLevel" = ${permissionLevel},
                    "grantedBy" = ${operatorId},
                    "grantedAt" = NOW(),
                    "expiresAt" = ${expiresAt},
                    "note" = ${note}
            `)

            // 记录审计日志
            await db.execute(sql`
                INSERT INTO "PermissionAuditLogs" 
                    ("eventType", "operatorId", "targetUserId", "instanceId", "details", "createdAt")
                VALUES 
                    ('grant', ${operatorId}, ${userId}, ${targetInstanceId}, 
                     ${JSON.stringify({ permissionLevel, expiresAt, note })}::jsonb, NOW())
            `)

            logger.info({ userId, permissionLevel, operatorId }, 'Permission granted via Web UI')
            return ApiResponse.success({ message: 'Permission granted successfully' })
        } catch (error: any) {
            logger.error({ error }, 'Failed to grant permission')
            return reply.code(500).send(ApiResponse.error(error?.message || String(error)))
        }
    })

    fastify.delete('/api/admin/permissions/users/:userId', { preHandler: requirePluginAdmin }, async (request, reply) => {
        try {
            const userId = String((request.params as any).userId || '').trim()
            const { instanceId } = request.query as { instanceId?: string }
            const targetInstanceId = instanceId !== undefined ? parseInt(instanceId) : 0
            const operatorId = (request as any).user?.userId || 'system'

            if (!userId) {
                return reply.code(400).send(ApiResponse.error('Missing userId'))
            }

            const db = drizzleDb
            await db.execute(sql`
                DELETE FROM "UserPermissions"
                WHERE "userId" = ${userId} AND "instanceId" = ${targetInstanceId}
            `)

            await db.execute(sql`
                INSERT INTO "PermissionAuditLogs" 
                    ("eventType", "operatorId", "targetUserId", "instanceId", "details", "createdAt")
                VALUES 
                    ('revoke', ${operatorId}, ${userId}, ${targetInstanceId}, '{}'::jsonb, NOW())
            `)

            logger.info({ userId, operatorId }, 'Permission revoked via Web UI')
            return ApiResponse.success({ message: 'Permission revoked successfully' })
        } catch (error: any) {
            logger.error({ error }, 'Failed to revoke permission')
            return reply.code(500).send(ApiResponse.error(error?.message || String(error)))
        }
    })

    // ========== 命令权限配置 ==========

    fastify.get('/api/admin/permissions/commands', { preHandler: requirePluginAdmin }, async (request, reply) => {
        try {
            const { instanceId } = request.query as { instanceId?: string }
            const targetInstanceId = instanceId !== undefined ? parseInt(instanceId) : 0

            const db = drizzleDb
            const results = await db.execute(sql`
                SELECT * FROM "CommandPermissions"
                WHERE "instanceId" = ${targetInstanceId}
                ORDER BY "commandName"
            `)

            const commands = results.rows.map((r: any) => ({
                id: r.id,
                commandName: r.commandName,
                instanceId: r.instanceId,
                requiredLevel: r.requiredLevel,
                requireOwner: r.requireOwner === 1,
                enabled: r.enabled === 1,
                restrictions: r.restrictions,
                updatedAt: r.updatedAt,
            }))

            return ApiResponse.success({ commands, total: commands.length })
        } catch (error: any) {
            logger.error({ error }, 'Failed to list command permissions')
            return reply.code(500).send(ApiResponse.error(error?.message || String(error)))
        }
    })

    const updateCommandPermissionSchema = z.object({
        requiredLevel: z.number().int().min(0).max(4).optional(),
        requireOwner: z.boolean().optional(),
        enabled: z.boolean().optional(),
    })

    fastify.patch('/api/admin/permissions/commands/:commandName', { preHandler: requirePluginAdmin }, async (request, reply) => {
        try {
            const commandName = String((request.params as any).commandName || '').trim()
            const { instanceId } = request.query as { instanceId?: string }
            const targetInstanceId = instanceId !== undefined ? parseInt(instanceId) : 0

            const body = updateCommandPermissionSchema.safeParse(request.body ?? {})
            if (!body.success) {
                return reply.code(400).send({ success: false, error: 'Invalid request', details: body.error.issues })
            }

            if (!commandName) {
                return reply.code(400).send(ApiResponse.error('Missing commandName'))
            }

            const db = drizzleDb

            if (body.data.requiredLevel !== undefined) {
                await db.execute(sql`
                    UPDATE "CommandPermissions"
                    SET "requiredLevel" = ${body.data.requiredLevel}, "updatedAt" = NOW()
                    WHERE "commandName" = ${commandName} AND "instanceId" = ${targetInstanceId}
                `)
            }
            if (body.data.requireOwner !== undefined) {
                await db.execute(sql`
                    UPDATE "CommandPermissions"
                    SET "requireOwner" = ${body.data.requireOwner ? 1 : 0}, "updatedAt" = NOW()
                    WHERE "commandName" = ${commandName} AND "instanceId" = ${targetInstanceId}
                `)
            }
            if (body.data.enabled !== undefined) {
                await db.execute(sql`
                    UPDATE "CommandPermissions"
                    SET "enabled" = ${body.data.enabled ? 1 : 0}, "updatedAt" = NOW()
                    WHERE "commandName" = ${commandName} AND "instanceId" = ${targetInstanceId}
                `)
            }

            logger.info({ commandName, updates: body.data }, 'Command permission updated via Web UI')
            return ApiResponse.success({ message: 'Command permission updated successfully' })
        } catch (error: any) {
            logger.error({ error }, 'Failed to update command permission')
            return reply.code(500).send(ApiResponse.error(error?.message || String(error)))
        }
    })

    // ========== 审计日志 ==========

    fastify.get('/api/admin/permissions/audit-logs', { preHandler: requirePluginAdmin }, async (request, reply) => {
        try {
            const { limit = '100', eventType, userId } = request.query as {
                limit?: string
                eventType?: string
                userId?: string
            }

            const maxLimit = Math.min(parseInt(limit as string) || 100, 500)

            const db = drizzleDb
            const results = await db.execute(sql`
                SELECT * FROM "PermissionAuditLogs"
                ORDER BY "createdAt" DESC
                LIMIT ${maxLimit}
            `)

            const logs = results.rows.map((r: any) => ({
                id: r.id,
                eventType: r.eventType,
                operatorId: r.operatorId,
                targetUserId: r.targetUserId,
                instanceId: r.instanceId,
                commandName: r.commandName,
                details: r.details,
                createdAt: r.createdAt,
            }))

            return ApiResponse.success({ logs, total: logs.length })
        } catch (error: any) {
            logger.error({ error }, 'Failed to fetch audit logs')
            return reply.code(500).send(ApiResponse.error(error?.message || String(error)))
        }
    })
}
