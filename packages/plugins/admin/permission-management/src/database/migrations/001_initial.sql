-- 权限管理系统数据库迁移
-- 创建时间: 2026-01-09
-- 说明: 添加用户权限、命令权限配置和审计日志表

-- 1. 用户权限表
CREATE TABLE IF NOT EXISTS "UserPermissions" (
  "id" SERIAL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "instanceId" INTEGER NOT NULL DEFAULT 0,
  "permissionLevel" INTEGER NOT NULL DEFAULT 3,
  "customPermissions" JSONB NOT NULL DEFAULT '{}',
  "grantedBy" TEXT,
  "grantedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "expiresAt" TIMESTAMP,
  "note" TEXT
);

-- 用户权限表的唯一约束和索引
CREATE UNIQUE INDEX IF NOT EXISTS "UserPermissions_userId_instanceId_key" 
  ON "UserPermissions" ("userId", "instanceId");

CREATE INDEX IF NOT EXISTS "UserPermissions_userId_idx" 
  ON "UserPermissions" ("userId");

CREATE INDEX IF NOT EXISTS "UserPermissions_instanceId_idx" 
  ON "UserPermissions" ("instanceId");

CREATE INDEX IF NOT EXISTS "UserPermissions_permissionLevel_idx" 
  ON "UserPermissions" ("permissionLevel");

CREATE INDEX IF NOT EXISTS "UserPermissions_expiresAt_idx" 
  ON "UserPermissions" ("expiresAt");

-- 2. 命令权限配置表
CREATE TABLE IF NOT EXISTS "CommandPermissions" (
  "id" SERIAL PRIMARY KEY,
  "commandName" TEXT NOT NULL,
  "instanceId" INTEGER NOT NULL DEFAULT 0,
  "requiredLevel" INTEGER NOT NULL DEFAULT 3,
  "requireOwner" INTEGER NOT NULL DEFAULT 0,
  "enabled" INTEGER NOT NULL DEFAULT 1,
  "restrictions" JSONB NOT NULL DEFAULT '{}',
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 命令权限表的唯一约束和索引
CREATE UNIQUE INDEX IF NOT EXISTS "CommandPermissions_commandName_instanceId_key" 
  ON "CommandPermissions" ("commandName", "instanceId");

CREATE INDEX IF NOT EXISTS "CommandPermissions_commandName_idx" 
  ON "CommandPermissions" ("commandName");

CREATE INDEX IF NOT EXISTS "CommandPermissions_requiredLevel_idx" 
  ON "CommandPermissions" ("requiredLevel");

CREATE INDEX IF NOT EXISTS "CommandPermissions_enabled_idx" 
  ON "CommandPermissions" ("enabled");

-- 3. 权限审计日志表
CREATE TABLE IF NOT EXISTS "PermissionAuditLogs" (
  "id" SERIAL PRIMARY KEY,
  "eventType" TEXT NOT NULL,
  "operatorId" TEXT,
  "targetUserId" TEXT,
  "instanceId" INTEGER,
  "commandName" TEXT,
  "details" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 审计日志表的索引
CREATE INDEX IF NOT EXISTS "PermissionAuditLogs_eventType_idx" 
  ON "PermissionAuditLogs" ("eventType");

CREATE INDEX IF NOT EXISTS "PermissionAuditLogs_operatorId_idx" 
  ON "PermissionAuditLogs" ("operatorId");

CREATE INDEX IF NOT EXISTS "PermissionAuditLogs_targetUserId_idx" 
  ON "PermissionAuditLogs" ("targetUserId");

CREATE INDEX IF NOT EXISTS "PermissionAuditLogs_instanceId_idx" 
  ON "PermissionAuditLogs" ("instanceId");

CREATE INDEX IF NOT EXISTS "PermissionAuditLogs_commandName_idx" 
  ON "PermissionAuditLogs" ("commandName");

CREATE INDEX IF NOT EXISTS "PermissionAuditLogs_createdAt_idx" 
  ON "PermissionAuditLogs" ("createdAt");

-- 4. 插入默认配置（可选）
-- 为常用命令设置默认权限要求
INSERT INTO "CommandPermissions" ("commandName", "instanceId", "requiredLevel", "requireOwner", "enabled")
VALUES 
  ('bind', 0, 1, 0, 1),           -- 管理员
  ('unbind', 0, 1, 0, 1),         -- 管理员
  ('forwardon', 0, 1, 0, 1),      -- 管理员
  ('forwardoff', 0, 1, 0, 1),     -- 管理员
  ('enable_qq_forward', 0, 1, 0, 1),   -- 管理员
  ('disable_qq_forward', 0, 1, 0, 1),  -- 管理员
  ('enable_tg_forward', 0, 1, 0, 1),   -- 管理员
  ('disable_tg_forward', 0, 1, 0, 1),  -- 管理员
  ('rm', 0, 2, 0, 1),             -- 版主
  ('info', 0, 2, 0, 1),           -- 版主
  ('refresh', 0, 2, 0, 1),        -- 版主
  ('help', 0, 3, 0, 1),           -- 普通用户
  ('status', 0, 3, 0, 1),         -- 普通用户
  ('permission', 0, 1, 0, 1)      -- 管理员（权限管理命令）
ON CONFLICT ("commandName", "instanceId") DO NOTHING;

-- 添加注释
COMMENT ON TABLE "UserPermissions" IS '用户权限表：存储用户的权限配置';
COMMENT ON TABLE "CommandPermissions" IS '命令权限配置表：存储每个命令的权限要求';
COMMENT ON TABLE "PermissionAuditLogs" IS '权限审计日志表：记录所有权限相关操作';

COMMENT ON COLUMN "UserPermissions"."userId" IS '用户标识（格式：tg:u:123456 或 qq:u:123456）';
COMMENT ON COLUMN "UserPermissions"."instanceId" IS '实例ID（0 表示全局权限）';
COMMENT ON COLUMN "UserPermissions"."permissionLevel" IS '权限等级（0: SUPER_ADMIN, 1: ADMIN, 2: MODERATOR, 3: USER, 4: GUEST）';
COMMENT ON COLUMN "UserPermissions"."customPermissions" IS '自定义权限（JSON）';
COMMENT ON COLUMN "UserPermissions"."expiresAt" IS '过期时间（NULL 表示永久）';

COMMENT ON COLUMN "CommandPermissions"."commandName" IS '命令名称';
COMMENT ON COLUMN "CommandPermissions"."requiredLevel" IS '所需权限等级';
COMMENT ON COLUMN "CommandPermissions"."requireOwner" IS '是否需要实例所有者（0: 否, 1: 是）';
COMMENT ON COLUMN "CommandPermissions"."enabled" IS '是否启用该命令（0: 否, 1: 是）';

COMMENT ON COLUMN "PermissionAuditLogs"."eventType" IS '事件类型（grant, revoke, command_execute, command_deny 等）';
COMMENT ON COLUMN "PermissionAuditLogs"."details" IS '详情（JSON）';
