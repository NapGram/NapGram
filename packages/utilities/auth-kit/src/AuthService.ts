import process from 'node:process'
import { count, db, eq, getLogger, schema, stringifyBigInts } from './shared-runtime.js'
import { PasswordUtil, TokenManager } from './TokenManager.js'

const logger = getLogger('AuthService')

/**
 * 认证服务
 */
export class AuthService {
  /**
   * 用户名密码登录
   */
  static async loginWithPassword(
    username: string,
    password: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ token: string, user: { id: number, username: string, displayName: string | null } } | null> {
    const rows = await db.query.adminUser.findMany({
      where: eq(schema.adminUser.username, username),
      limit: 1,
    })
    const user = rows[0]

    if (!user || !user.isActive) {
      return null
    }

    if (!PasswordUtil.verifyPassword(password, user.passwordHash)) {
      return null
    }

    // 创建 session token
    const token = await TokenManager.createSessionToken(
      user.id,
      ipAddress,
      userAgent,
    )

    // 记录审计日志
    await this.logAudit(user.id, 'login', undefined, undefined, { ipAddress, userAgent })

    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
      },
    }
  }

  /**
   * Token 登录（Access Token 或 Session Token）
   */
  static async loginWithToken(token: string): Promise<{ type: 'access' | 'session' | 'env', userId?: number } | null> {
    return await TokenManager.verifyToken(token)
  }

  /**
   * 登出
   */
  static async logout(token: string, userId?: number): Promise<boolean> {
    const revoked = await TokenManager.revokeSessionToken(token)

    if (userId) {
      await this.logAudit(userId, 'logout')
    }

    return revoked
  }

  /**
   * 创建管理员用户
   */
  static async createAdminUser(
    username: string,
    password: string,
    displayName?: string,
    email?: string,
    createdBy?: number,
  ): Promise<{ id: number, username: string }> {
    const passwordHash = PasswordUtil.hashPassword(password)

    const userArr = await db.insert(schema.adminUser).values({
      username,
      passwordHash,
      displayName,
      email,
    }).returning()
    const user = userArr[0]

    if (createdBy) {
      await this.logAudit(createdBy, 'create_user', 'admin_user', String(user.id), {
        username: user.username,
      })
    }

    return {
      id: user.id,
      username: user.username,
    }
  }

  /**
   * 修改密码
   */
  static async changePassword(
    userId: number,
    oldPassword: string,
    newPassword: string,
  ): Promise<boolean> {
    const rows = await db.query.adminUser.findMany({
      where: eq(schema.adminUser.id, userId),
      limit: 1,
    })
    const user = rows[0]

    if (!user) {
      return false
    }

    if (!PasswordUtil.verifyPassword(oldPassword, user.passwordHash)) {
      return false
    }

    const newPasswordHash = PasswordUtil.hashPassword(newPassword)

    await db.update(schema.adminUser)
      .set({ passwordHash: newPasswordHash })
      .where(eq(schema.adminUser.id, userId))

    await this.logAudit(userId, 'change_password')

    return true
  }

  /**
   * 记录审计日志
   */
  static async logAudit(
    userId: number | undefined,
    action: string,
    resource?: string,
    resourceId?: string,
    details?: any,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    await db.insert(schema.adminAuditLog).values({
      userId: userId || null,
      action,
      resource,
      resourceId,
      details: stringifyBigInts(details) || {},
      ipAddress,
      userAgent,
    }).catch(() => { }) // 审计日志失败不应影响主流程
  }

  /**
   * 检查是否有管理员用户存在
   */
  static async hasAdminUsers(): Promise<boolean> {
    const result = await db.select({ value: count() }).from(schema.adminUser)
    return result[0].value > 0
  }

  /**
   * 初始化默认管理员（如果不存在）
   */
  static async initializeDefaultAdmin(): Promise<void> {
    const hasUsers = await this.hasAdminUsers()

    if (!hasUsers) {
      const defaultUsername = process.env.DEFAULT_ADMIN_USERNAME || 'admin'
      const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD || TokenManager.generateToken().slice(0, 16)

      await this.createAdminUser(defaultUsername, defaultPassword, 'Default Admin')

      logger.warn('============================================')
      logger.warn('🔐 Default Admin User Created')
      logger.warn(`   Username: ${defaultUsername}`)
      logger.warn(`   Password: ${defaultPassword}`)
      logger.warn('   Please change the password after first login!')
      logger.warn('============================================')
    }
  }
}
