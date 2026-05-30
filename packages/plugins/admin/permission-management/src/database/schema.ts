import { pgTable, serial, integer, text, timestamp, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';


/**
 * 用户权限表
 * 存储用户的权限配置
 */
export const userPermissions = pgTable('UserPermissions', {
    id: serial('id').primaryKey(),

    // 用户标识（格式：tg:u:123456 或 qq:u:123456）
    userId: text('userId').notNull(),

    // 实例ID（0 表示全局权限）
    instanceId: integer('instanceId').notNull().default(0),

    // 权限等级 (0: SUPER_ADMIN, 1: ADMIN, 2: MODERATOR, 3: USER, 4: GUEST)
    permissionLevel: integer('permissionLevel').notNull().default(3),

    // 自定义权限（JSON，可扩展）
    customPermissions: jsonb('customPermissions').notNull().default({}),

    // 授权人
    grantedBy: text('grantedBy'),

    // 授权时间
    grantedAt: timestamp('grantedAt').defaultNow().notNull(),

    // 过期时间（NULL 表示永久）
    expiresAt: timestamp('expiresAt'),

    // 备注
    note: text('note'),
}, (t) => ({
    // 唯一约束：同一用户在同一实例只能有一条权限记录
    uniqueUserInstance: uniqueIndex('UserPermissions_userId_instanceId_key').on(t.userId, t.instanceId),

    // 索引：加速查询
    idxUserId: index('UserPermissions_userId_idx').on(t.userId),
    idxInstanceId: index('UserPermissions_instanceId_idx').on(t.instanceId),
    idxPermissionLevel: index('UserPermissions_permissionLevel_idx').on(t.permissionLevel),
    idxExpiresAt: index('UserPermissions_expiresAt_idx').on(t.expiresAt),
}));

/**
 * 命令权限配置表
 * 存储每个命令的权限要求
 */
export const commandPermissions = pgTable('CommandPermissions', {
    id: serial('id').primaryKey(),

    // 命令名称
    commandName: text('commandName').notNull(),

    // 实例ID（0 表示全局配置）
    instanceId: integer('instanceId').notNull().default(0),

    // 所需权限等级
    requiredLevel: integer('requiredLevel').notNull().default(3),

    // 是否需要实例所有者
    requireOwner: integer('requireOwner').notNull().default(0), // 使用 0/1 而不是 boolean

    // 是否启用该命令
    enabled: integer('enabled').notNull().default(1), // 使用 0/1 而不是 boolean

    // 自定义限制（JSON）
    restrictions: jsonb('restrictions').notNull().default({}),

    // 更新时间
    updatedAt: timestamp('updatedAt').defaultNow().notNull(),
}, (t) => ({
    // 唯一约束：同一命令在同一实例只能有一条配置
    uniqueCommandInstance: uniqueIndex('CommandPermissions_commandName_instanceId_key').on(t.commandName, t.instanceId),

    // 索引
    idxCommandName: index('CommandPermissions_commandName_idx').on(t.commandName),
    idxRequiredLevel: index('CommandPermissions_requiredLevel_idx').on(t.requiredLevel),
    idxEnabled: index('CommandPermissions_enabled_idx').on(t.enabled),
}));

/**
 * 权限审计日志表
 * 记录所有权限相关操作
 */
export const permissionAuditLogs = pgTable('PermissionAuditLogs', {
    id: serial('id').primaryKey(),

    // 事件类型（grant, revoke, command_execute, command_deny 等）
    eventType: text('eventType').notNull(),

    // 操作者
    operatorId: text('operatorId'),

    // 目标用户
    targetUserId: text('targetUserId'),

    // 实例ID
    instanceId: integer('instanceId'),

    // 命令名称（如果是命令执行）
    commandName: text('commandName'),

    // 详情（JSON）
    details: jsonb('details').notNull().default({}),

    // 时间戳
    createdAt: timestamp('createdAt').defaultNow().notNull(),
}, (t) => ({
    // 索引：加速日志查询
    idxEventType: index('PermissionAuditLogs_eventType_idx').on(t.eventType),
    idxOperatorId: index('PermissionAuditLogs_operatorId_idx').on(t.operatorId),
    idxTargetUserId: index('PermissionAuditLogs_targetUserId_idx').on(t.targetUserId),
    idxInstanceId: index('PermissionAuditLogs_instanceId_idx').on(t.instanceId),
    idxCommandName: index('PermissionAuditLogs_commandName_idx').on(t.commandName),
    idxCreatedAt: index('PermissionAuditLogs_createdAt_idx').on(t.createdAt),
}));

// Relations
export const userPermissionsRelations = relations(userPermissions, ({ one }) => ({
    // 如果 instanceId > 0，可以关联到 Instance 表（可选）
    // instance: one(instance, {
    //   fields: [userPermissions.instanceId],
    //   references: [instance.id],
    // }),
}));

export const commandPermissionsRelations = relations(commandPermissions, ({ one }) => ({
    // 同上
}));

export const permissionAuditLogsRelations = relations(permissionAuditLogs, ({ one }) => ({
    // 同上
}));
