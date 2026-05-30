/**
 * 权限等级枚举
 */
export enum PermissionLevel {
    SUPER_ADMIN = 0,   // 超级管理员
    ADMIN = 1,         // 管理员
    MODERATOR = 2,     // 版主
    USER = 3,          // 普通用户
    GUEST = 4,         // 访客
}

/**
 * 用户权限接口
 */
export interface UserPermission {
    userId: string
    instanceId: number
    permissionLevel: PermissionLevel
    customPermissions?: Record<string, any>
    expiresAt?: Date
}

/**
 * 权限检查结果接口
 */
export interface PermissionCheckResult {
    allowed: boolean
    reason?: string
}

/**
 * 命令权限配置
 */
export interface CommandPermissionConfig {
    level: PermissionLevel
    requireOwner?: boolean
    customCheck?: (userId: string, instanceId: number) => Promise<boolean>
}

/**
 * 审计日志事件类型
 */
export type AuditEventType =
    | 'grant'            // 授予权限
    | 'revoke'           // 撤销权限
    | 'command_execute'  // 命令执行
    | 'command_deny'     // 命令拒绝
    | 'permission_check' // 权限检查

/**
 * 审计日志接口
 */
export interface AuditLogEntry {
    eventType: AuditEventType
    operatorId?: string
    targetUserId?: string
    instanceId?: number
    commandName?: string
    details?: Record<string, any>
}
