import type { Instance } from '../../../shared-types.js'
import { env } from '../../../shared-types.js'

/**
 * 权限检查服务
 */
export class PermissionChecker {
  constructor(private readonly instance: Instance) { }

  private normalizeUserId(value: unknown): string {
    return String(value ?? '')
      .trim()
      .replace(/^(?:tg|qq):u:/i, '')
  }

  private isConfiguredAdmin(value: unknown): boolean {
    return value !== undefined && value !== null && String(value).trim() !== ''
  }

  /**
   * 检查是否是管理员
   */
  isAdmin(userId: string): boolean {
    const normalizedUserId = this.normalizeUserId(userId)
    return [this.instance.owner, env.ADMIN_QQ, env.ADMIN_TG]
      .filter(value => this.isConfiguredAdmin(value))
      .some(value => normalizedUserId === this.normalizeUserId(value))
  }
}
