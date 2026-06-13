import type { Instance } from '../../../shared-types.js'
import { env } from '../../../shared-types.js'

/**
 * 命令访问控制检查器
 *
 * 只负责当前实例维度的管理员判定，不等同于共享的 QQ 权限工具。
 */
export class CommandAccessChecker {
  constructor(private readonly instance: Instance) {}

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
