import type { Instance } from '../../../runtime-types.js'
import { isInstanceAdmin } from '../../../admin-access.js'

/**
 * 命令权限检查器
 */
export class CommandAccessChecker {
  constructor(private readonly instance: Instance) {}

  /**
   * 检查是否为当前实例管理员
   */
  isAdmin(userId: string): boolean {
    return isInstanceAdmin(userId, this.instance.owner)
  }
}
