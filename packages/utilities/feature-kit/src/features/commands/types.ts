import type { UnifiedMessage } from '@napgram/message-kit'

/**
 * 命令处理函数类型
 */
export type CommandHandler = (msg: UnifiedMessage, args: string[]) => Promise<void>

/**
 * 命令权限配置
 * 注意: level 使用数字类型以避免循环依赖
 * 0=SUPER_ADMIN, 1=ADMIN, 2=MODERATOR, 3=USER, 4=GUEST
 */
export interface CommandPermission {
  level: number                                                       // 所需权限等级(0-4)
  requireOwner?: boolean                                              // 是否必须是实例所有者
  customCheck?: (userId: string, instanceId: number) => Promise<boolean>  // 自定义权限检查
}

/**
 * 命令定义
 */
export interface Command {
  name: string
  aliases?: string[]
  description: string
  usage?: string
  handler: CommandHandler

  // 新版权限配置
  permission?: CommandPermission

  // 向后兼容：adminOnly 自动映射为 level: 1 (ADMIN)
  adminOnly?: boolean
}

/**
 * 待处理的交互式命令
 */
export interface PendingAction {
  action: 'bind' | 'unbind'
  threadId?: number
}
