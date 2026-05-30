# NapGram 权限管理插件

完整的多级权限控制系统，为 NapGram 提供精细化的权限管理功能。

## 功能特性

- ✅ **5级权限系统** - 超级管理员、管理员、版主、普通用户、访客
- ✅ **灵活的权限配置** - 支持永久和临时权限
- ✅ **完整的审计日志** - 记录所有权限操作
- ✅ **命令行管理** - 通过命令管理权限
- ✅ **性能优化** - 内置缓存机制
- ✅ **安全保护** - 防止权限提升攻击

## 权限等级

| 等级 | 名称 | 权限范围 |
|------|------|---------|
| 0 | 超级管理员 | 系统所有者，完全控制 |
| 1 | 管理员 | 实例管理，用户授权，插件配置 |
| 2 | 版主 | 消息管理，群组管理 |
| 3 | 普通用户 | 基本功能使用 |
| 4 | 访客 | 受限访问 |

## 安装

### 1. 数据库迁移

首次安装需要创建权限相关的数据库表：

```bash
# 连接到 PostgreSQL 数据库
psql $DATABASE_URL

# 执行迁移文件
\i src/database/migrations/001_initial.sql
```

### 2. 启用插件

在 NapGram Web 控制台中：
1. 进入"插件管理"页面
2. 找到"权限管理"插件
3. 点击"启用"

## 使用方法

### 命令行管理

#### 授予权限

```bash
# 授予永久管理员权限
/permission grant tg:u:123456789 1

# 授予 30 天临时版主权限
/permission grant qq:u:987654321 2 30

# 授予权限并添加备注
/permission grant tg:u:111222333 2 90 负责技术群管理
```

#### 撤销权限

```bash
/permission revoke tg:u:123456789
```

#### 查看权限列表

```bash
/permission list
```

#### 检查权限

```bash
# 检查自己的权限
/permission check

# 检查其他用户的权限（需要管理员权限）
/permission check tg:u:123456789
```

### 用户ID格式

- **Telegram 用户**: `tg:u:<user_id>`（例: `tg:u:123456789`）
- **QQ 用户**: `qq:u:<qq_number>`（例: `qq:u:987654321`）

## 配置选项

在插件设置中可以配置：

- **enableAuditLog**: 是否启用审计日志（默认: true）
- **defaultLevel**: 默认权限等级（默认: 3 - 普通用户）
- **cacheEnabled**: 是否启用权限缓存（默认: true）
- **cacheExpireMinutes**: 缓存过期时间（默认: 60 分钟）
- **auditLogRetentionDays**: 审计日志保留天数（默认: 90 天）

## 开发指南

### 在其他插件中使用

```typescript
import type { PermissionLevel, PermissionService } from '@napgram/plugin-permission-management'

// 获取权限服务
const permissionService = ctx.getPlugin('permission-management').permissionService

// 检查用户权限等级
const level = await permissionService.getPermissionLevel('tg:u:123456')

// 检查命令权限
const check = await permissionService.checkCommandPermission(
  'tg:u:123456',
  'my-command',
  PermissionLevel.ADMIN
)

if (check.allowed) {
  // 执行命令
} else {
  // 权限不足
  console.log(check.reason)
}
```

### 注册带权限的命令

```typescript
import { PermissionLevel } from '@napgram/plugin-permission-management'

ctx.command({
  name: 'my-admin-command',
  permission: {
    level: PermissionLevel.ADMIN,  // 需要管理员权限
    requireOwner: false,           // 不要求实例所有者
  },
  handler: async (msg, args) => {
    // 权限已由系统自动检查
    await msg.reply('命令执行成功')
  }
})
```

## 数据库表结构

### UserPermissions - 用户权限表

存储用户的权限配置。

### CommandPermissions - 命令权限配置表

存储每个命令的权限要求。

### PermissionAuditLogs - 审计日志表

记录所有权限相关操作。

## 安全建议

1. **定期审查权限** - 每月检查并更新权限配置
2. **使用临时权限** - 对临时管理员设置过期时间
3. **监控审计日志** - 定期查看异常操作
4. **保护超级管理员** - 只有系统所有者可以授予
5. **备份权限数据** - 定期备份 UserPermissions 表

## 故障排查

### 权限不生效

1. 检查缓存：重启插件或清除缓存
2. 验证用户ID格式：确保使用 `tg:u:` 或 `qq:u:` 前缀
3. 检查数据库：查询 UserPermissions 表确认权限是否存在

### 命令无法执行

1. 检查权限等级：确认用户有足够权限
2. 检查命令配置：确认命令未被禁用
3. 查看审计日志：确认权限检查失败原因

## 更新日志

### v0.0.1 (2026-01-09)

- ✅ 初始版本发布
- ✅ 5级权限系统
- ✅ 命令行管理功能
- ✅ 审计日志功能
- ✅ 权限缓存优化

## 许可证

与 NapGram 主项目相同

## 作者

NapGram Team

## 支持

如有问题，请访问 [NapGram GitHub Issues](https://github.com/NapGram/NapGram/issues)
