import { and, drizzleDb, env, eq, getLogger } from '../shared-runtime.js'
import type { IInstance } from '../shared-runtime.js'
import { userPermissions, commandPermissions, permissionAuditLogs } from '../database/schema.js'
import { PermissionLevel } from '../types/index.js'
import type { UserPermission, PermissionCheckResult } from '../types/index.js'

const logger = getLogger('PermissionService')

/**
 * 权限管理服务
 * 提供完整的权限管理功能，包括权限等级查询、授予、撤销和审计
 */
type InstanceResolver = (instanceId: number) => IInstance | undefined
type PermissionServiceOptions = {
  cacheEnabled?: boolean
  cacheExpireMinutes?: number
  defaultLevel?: PermissionLevel
  enableAuditLog?: boolean
}

type CachedPermission = {
  value: UserPermission
  cacheExpiresAt?: number
}

export class PermissionService {
  private permissionCache = new Map<string, CachedPermission>()

  constructor(
    private readonly instanceResolver?: InstanceResolver,
    private readonly options: PermissionServiceOptions = {}
  ) { }

  /**
   * 获取用户权限等级
   * @param userId 用户ID（格式：tg:u:123 或 qq:u:456）
   * @param instanceId 实例ID（可选，默认使用全局权限）
   */
  async getPermissionLevel(userId: string, instanceId?: number): Promise<PermissionLevel> {
    const targetInstanceId = instanceId ?? 0

    // 1. 检查是否是系统所有者
    if (this.isSystemOwner(userId)) {
      return PermissionLevel.SUPER_ADMIN
    }

    // 2. 检查是否是实例所有者
    if (targetInstanceId !== 0 && this.isInstanceOwner(userId, targetInstanceId)) {
      return PermissionLevel.ADMIN
    }

    // 3. 检查缓存
    const cacheKey = `${userId}:${targetInstanceId}`
    const cached = this.getCached(cacheKey)
    if (cached) {
      return cached.permissionLevel
    }

    if (targetInstanceId !== 0) {
      const globalCached = this.getCached(`${userId}:0`)
      if (globalCached) {
        return globalCached.permissionLevel
      }
    }

    // 4. 从数据库查询（优先实例权限，其次全局权限）
    try {
      const db = drizzleDb
      const instanceResult = await db
        .select()
        .from(userPermissions)
        .where(
          and(
            eq(userPermissions.userId, userId),
            eq(userPermissions.instanceId, targetInstanceId)
          )
        )
        .limit(1)

      if (instanceResult.length > 0) {
        const perm = instanceResult[0]

        // 检查是否过期
        if (perm.expiresAt && new Date(perm.expiresAt) < new Date()) {
          logger.debug(`Permission expired for ${userId}`)
          return this.getDefaultLevel()
        }

        // 缓存结果
        this.setCache(cacheKey, {
          userId,
          instanceId: targetInstanceId,
          permissionLevel: perm.permissionLevel,
          customPermissions: perm.customPermissions as Record<string, any>,
          expiresAt: perm.expiresAt ? new Date(perm.expiresAt) : undefined,
        })

        return perm.permissionLevel
      }

      if (targetInstanceId !== 0) {
        const globalResult = await db
          .select()
          .from(userPermissions)
          .where(
            and(
              eq(userPermissions.userId, userId),
              eq(userPermissions.instanceId, 0)
            )
          )
          .limit(1)

        if (globalResult.length > 0) {
          const perm = globalResult[0]

          if (perm.expiresAt && new Date(perm.expiresAt) < new Date()) {
            logger.debug(`Global permission expired for ${userId}`)
            return this.getDefaultLevel()
          }

          this.setCache(`${userId}:0`, {
            userId,
            instanceId: 0,
            permissionLevel: perm.permissionLevel,
            customPermissions: perm.customPermissions as Record<string, any>,
            expiresAt: perm.expiresAt ? new Date(perm.expiresAt) : undefined,
          })

          return perm.permissionLevel
        }
      }
    } catch (error) {
      logger.error('Failed to query user permission:', error)
    }

    // 5. 默认为普通用户
    return this.getDefaultLevel()
  }

  /**
   * 检查用户是否有执行命令的权限
   */
  async checkCommandPermission(
    userId: string,
    commandName: string,
    requiredLevel: PermissionLevel,
    requireOwner = false,
    instanceId?: number
  ): Promise<PermissionCheckResult> {
    const targetInstanceId = instanceId ?? 0

    // 1. 读取命令配置（实例优先、全局兜底）
    const commandConfig = await this.getCommandConfig(commandName, targetInstanceId)
    const effectiveRequiredLevel = commandConfig ? commandConfig.requiredLevel : requiredLevel
    const effectiveRequireOwner = commandConfig ? commandConfig.requireOwner === 1 : requireOwner

    // 2. 检查命令是否被禁用
    if (commandConfig && !commandConfig.enabled) {
      return {
        allowed: false,
        reason: '该命令已被禁用'
      }
    }

    // 3. 检查所有者要求
    if (effectiveRequireOwner && !this.isInstanceOwner(userId, targetInstanceId)) {
      return {
        allowed: false,
        reason: '此命令仅限实例所有者执行'
      }
    }

    // 4. 获取用户权限等级
    const userLevel = await this.getPermissionLevel(userId, targetInstanceId)

    // 5. 检查权限等级（数字越小权限越高）
    if (userLevel > effectiveRequiredLevel) {
      return {
        allowed: false,
        reason: `权限不足。需要: ${this.getLevelName(effectiveRequiredLevel)}，当前: ${this.getLevelName(userLevel)}`
      }
    }

    return { allowed: true }
  }

  /**
   * 授予用户权限
   */
  async grantPermission(
    targetUserId: string,
    permissionLevel: PermissionLevel,
    operatorId: string,
    instanceId?: number,
    options?: {
      expiresAt?: Date
      note?: string
      customPermissions?: Record<string, any>
    }
  ): Promise<boolean> {
    const targetInstanceId = instanceId ?? 0

    // 检查操作者权限
    const operatorLevel = await this.getPermissionLevel(operatorId, targetInstanceId)

    // 操作者不能授予比自己更高的权限
    if (operatorLevel > permissionLevel) {
      logger.warn(`User ${operatorId} tried to grant higher permission than they have`)
      return false
    }

    // 超级管理员权限只能由系统所有者授予
    if (permissionLevel === PermissionLevel.SUPER_ADMIN && !this.isSystemOwner(operatorId)) {
      logger.warn(`Non-owner ${operatorId} tried to grant SUPER_ADMIN permission`)
      return false
    }

    try {
      const db = drizzleDb

      await db
        .insert(userPermissions)
        .values({
          userId: targetUserId,
          instanceId: targetInstanceId,
          permissionLevel,
          grantedBy: operatorId,
          grantedAt: new Date(),
          expiresAt: options?.expiresAt,
          note: options?.note,
          customPermissions: options?.customPermissions || {},
        })
        .onConflictDoUpdate({
          target: [userPermissions.userId, userPermissions.instanceId],
          set: {
            permissionLevel,
            grantedBy: operatorId,
            grantedAt: new Date(),
            expiresAt: options?.expiresAt,
            note: options?.note,
            customPermissions: options?.customPermissions || {},
          }
        })

      // 清除缓存
      this.permissionCache.delete(`${targetUserId}:${targetInstanceId}`)

      // 记录审计日志
      await this.logAudit({
        eventType: 'grant',
        operatorId,
        targetUserId,
        instanceId: targetInstanceId,
        details: {
          permissionLevel,
          expiresAt: options?.expiresAt,
          note: options?.note,
        }
      })

      logger.info(`Permission granted: ${targetUserId} -> ${this.getLevelName(permissionLevel)}`)

      return true
    } catch (error) {
      logger.error('Failed to grant permission:', error)
      return false
    }
  }

  /**
   * 撤销用户权限
   */
  async revokePermission(
    targetUserId: string,
    operatorId: string,
    instanceId?: number
  ): Promise<boolean> {
    const targetInstanceId = instanceId ?? 0

    try {
      const db = drizzleDb

      await db
        .delete(userPermissions)
        .where(
          and(
            eq(userPermissions.userId, targetUserId),
            eq(userPermissions.instanceId, targetInstanceId)
          )
        )

      // 清除缓存
      this.permissionCache.delete(`${targetUserId}:${targetInstanceId}`)

      // 记录审计日志
      await this.logAudit({
        eventType: 'revoke',
        operatorId,
        targetUserId,
        instanceId: targetInstanceId,
      })

      logger.info(`Permission revoked: ${targetUserId}`)

      return true
    } catch (error) {
      logger.error('Failed to revoke permission:', error)
      return false
    }
  }

  /**
   * 列出所有用户权限
   */
  async listPermissions(instanceId?: number): Promise<UserPermission[]> {
    const targetInstanceId = instanceId ?? 0

    try {
      const db = drizzleDb

      const results = await db
        .select()
        .from(userPermissions)
        .where(eq(userPermissions.instanceId, targetInstanceId))

      return results.map((r: any) => ({
        userId: r.userId,
        instanceId: r.instanceId,
        permissionLevel: r.permissionLevel,
        customPermissions: r.customPermissions as Record<string, any>,
        expiresAt: r.expiresAt ? new Date(r.expiresAt) : undefined,
      }))
    } catch (error) {
      logger.error('Failed to list permissions:', error)
      return []
    }
  }

  /**
   * 记录审计日志
   */
  async logAudit(event: {
    eventType: string
    operatorId?: string
    targetUserId?: string
    instanceId?: number
    commandName?: string
    details?: Record<string, any>
  }): Promise<void> {
    if (this.options.enableAuditLog === false) {
      return
    }
    try {
      const db = drizzleDb
      await db.insert(permissionAuditLogs).values({
        eventType: event.eventType,
        operatorId: event.operatorId,
        targetUserId: event.targetUserId,
        instanceId: event.instanceId,
        commandName: event.commandName,
        details: event.details || {},
        createdAt: new Date(),
      })
    } catch (error) {
      logger.error('Failed to log audit:', error)
    }
  }

  /**
   * 清除权限缓存
   */
  clearCache(): void {
    this.permissionCache.clear()
    logger.debug('Permission cache cleared')
  }

  // ============ 辅助方法 ============

  private getCached(cacheKey: string): UserPermission | null {
    if (!this.isCacheEnabled()) return null
    const cached = this.permissionCache.get(cacheKey)
    if (!cached) return null
    if (cached.cacheExpiresAt && cached.cacheExpiresAt <= Date.now()) {
      this.permissionCache.delete(cacheKey)
      return null
    }
    if (cached.value.expiresAt && cached.value.expiresAt <= new Date()) {
      this.permissionCache.delete(cacheKey)
      return null
    }
    return cached.value
  }

  private setCache(cacheKey: string, value: UserPermission): void {
    if (!this.isCacheEnabled()) return
    this.permissionCache.set(cacheKey, this.buildCacheEntry(value))
  }

  private buildCacheEntry(value: UserPermission): CachedPermission {
    const minutes = this.options.cacheExpireMinutes
    const cacheExpiresAt = minutes ? Date.now() + minutes * 60 * 1000 : undefined
    return { value, cacheExpiresAt }
  }

  private isCacheEnabled(): boolean {
    return this.options.cacheEnabled !== false
  }

  private getDefaultLevel(): PermissionLevel {
    return this.options.defaultLevel ?? PermissionLevel.USER
  }

  private matchesUserId(userId: string, rawId?: string | number | null): boolean {
    if (rawId === null || rawId === undefined) return false
    const raw = String(rawId)
    return userId === raw || userId === `qq:u:${raw}` || userId === `tg:u:${raw}`
  }

  /**
   * 检查是否是系统所有者
   */
  private isSystemOwner(userId: string): boolean {
    return this.matchesUserId(userId, env.ADMIN_QQ) || this.matchesUserId(userId, env.ADMIN_TG)
  }

  /**
   * 检查是否是实例所有者
   */
  private isInstanceOwner(userId: string, instanceId: number): boolean {
    const instance = this.instanceResolver?.(instanceId)
    if (!instance) return false

    return this.matchesUserId(userId, instance.owner)
  }

  /**
   * 获取命令配置
   */
  private async getCommandConfig(commandName: string, instanceId: number) {
    try {
      const db = drizzleDb
      const results = await db
        .select()
        .from(commandPermissions)
        .where(
          and(
            eq(commandPermissions.commandName, commandName),
            eq(commandPermissions.instanceId, instanceId)
          )
        )
        .limit(1)

      if (results.length > 0) {
        return results[0]
      }

      if (instanceId !== 0) {
        const globalResults = await db
          .select()
          .from(commandPermissions)
          .where(
            and(
              eq(commandPermissions.commandName, commandName),
              eq(commandPermissions.instanceId, 0)
            )
          )
          .limit(1)

        return globalResults.length > 0 ? globalResults[0] : null
      }

      return null
    } catch (error) {
      return null
    }
  }

  /**
   * 获取权限等级名称
   */
  private getLevelName(level: PermissionLevel): string {
    const names = {
      [PermissionLevel.SUPER_ADMIN]: '超级管理员',
      [PermissionLevel.ADMIN]: '管理员',
      [PermissionLevel.MODERATOR]: '版主',
      [PermissionLevel.USER]: '普通用户',
      [PermissionLevel.GUEST]: '访客',
    }
    return names[level] || '未知'
  }

  /**
   * 兼容旧版本的 isAdmin 方法
   * @deprecated 使用 getPermissionLevel 替代
   */
  isAdmin(userId: string, instanceId?: number): boolean {
    // 简化版本的同步检查，仅用于向后兼容
    if (instanceId !== undefined) {
      const instance = this.instanceResolver?.(instanceId)
      if (instance && this.matchesUserId(userId, instance.owner)) {
        return true
      }
    }

    return this.matchesUserId(userId, env.ADMIN_QQ) || this.matchesUserId(userId, env.ADMIN_TG)
  }
}

// 导出权限等级枚举，方便外部使用
export { PermissionLevel }
