import type { MessageEvent, PluginContext } from '@napgram/sdk'
import { PermissionService } from '../services/PermissionService.js'
import { PermissionLevel } from '../types/index.js'

/**
 * 权限管理命令处理器
 */
export class PermissionCommands {
    constructor(
        private readonly ctx: PluginContext,
        private readonly permissionService: PermissionService
    ) { }

    /**
     * 注册权限管理命令
     */
    register() {
        this.ctx.command({
            name: 'permission',
            aliases: ['perm'],
            description: '权限管理命令',
            usage: '/permission <grant|revoke|list|check> [参数...]',
            handler: async (msg, args) => {
                const subCommand = args[0]?.toLowerCase()

                switch (subCommand) {
                    case 'grant':
                        await this.handleGrant(msg, args.slice(1))
                        break
                    case 'revoke':
                        await this.handleRevoke(msg, args.slice(1))
                        break
                    case 'list':
                        await this.handleList(msg)
                        break
                    case 'check':
                        await this.handleCheck(msg, args.slice(1))
                        break
                    default:
                        await msg.reply(this.getHelpText())
                }
            }
        })
    }

    /**
     * 处理授予权限命令
     * 用法: /permission grant <用户ID> <等级> [过期天数] [备注]
     */
    private async handleGrant(msg: MessageEvent, args: string[]) {
        if (!(await this.ensureAdmin(msg))) {
            return
        }

        if (args.length < 2) {
            await msg.reply('❌ 用法: /permission grant <用户ID> <等级> [过期天数] [备注]\n\n等级:\n0 - 超级管理员\n1 - 管理员\n2 - 版主\n3 - 普通用户\n4 - 访客')
            return
        }

        const targetUserId = args[0]
        const levelStr = args[1]
        const expiresInDays = args[2] ? parseInt(args[2]) : undefined
        const note = args.slice(3).join(' ') || undefined

        // 验证权限等级
        const level = parseInt(levelStr)
        if (isNaN(level) || level < 0 || level > 4) {
            await msg.reply('❌ 无效的权限等级，请使用 0-4 之间的数字')
            return
        }

        // 验证过期天数
        if (expiresInDays !== undefined && (isNaN(expiresInDays) || expiresInDays < 1)) {
            await msg.reply('❌ 无效的过期天数')
            return
        }

        // 计算过期时间
        const expiresAt = expiresInDays
            ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
            : undefined

        // 获取操作者ID
        const operatorId = msg.sender.userId

        // 执行授权
        const success = await this.permissionService.grantPermission(
            targetUserId,
            level as PermissionLevel,
            operatorId,
            msg.instanceId,
            {
                expiresAt,
                note,
            }
        )

        if (success) {
            const levelName = this.getLevelName(level as PermissionLevel)
            const expireInfo = expiresAt ? `\n⏰ 过期时间: ${expiresAt.toLocaleString('zh-CN')}` : ''
            const noteInfo = note ? `\n📝 备注: ${note}` : ''

            await msg.reply(`✅ 已授予权限\n\n👤 用户: ${targetUserId}\n🎖️ 等级: ${levelName}${expireInfo}${noteInfo}`)
        } else {
            await msg.reply('❌ 授权失败，请检查权限或参数')
        }
    }

    /**
     * 处理撤销权限命令
     * 用法: /permission revoke <用户ID>
     */
    private async handleRevoke(msg: MessageEvent, args: string[]) {
        if (!(await this.ensureAdmin(msg))) {
            return
        }

        if (args.length < 1) {
            await msg.reply('❌ 用法: /permission revoke <用户ID>')
            return
        }

        const targetUserId = args[0]
        const operatorId = msg.sender.userId

        const success = await this.permissionService.revokePermission(
            targetUserId,
            operatorId,
            msg.instanceId
        )

        if (success) {
            await msg.reply(`✅ 已撤销 ${targetUserId} 的权限`)
        } else {
            await msg.reply('❌ 撤销失败，该用户可能没有特殊权限')
        }
    }

    /**
     * 处理列出权限命令
     * 用法: /permission list
     */
    private async handleList(msg: MessageEvent) {
        if (!(await this.ensureAdmin(msg))) {
            return
        }

        const permissions = await this.permissionService.listPermissions(msg.instanceId)

        if (permissions.length === 0) {
            await msg.reply('📋 当前没有用户拥有特殊权限')
            return
        }

        let response = '📋 权限列表:\n\n'

        for (const perm of permissions) {
            const levelName = this.getLevelName(perm.permissionLevel)
            const expireInfo = perm.expiresAt
                ? `(⏰ ${perm.expiresAt.toLocaleDateString('zh-CN')})`
                : '(永久)'

            response += `• ${perm.userId}: ${levelName} ${expireInfo}\n`
        }

        await msg.reply(response)
    }

    /**
     * 处理检查权限命令
     * 用法: /permission check [用户ID]
     */
    private async handleCheck(msg: MessageEvent, args: string[]) {
        const targetUserId = args.length > 0 ? args[0] : msg.sender.userId

        if (args.length > 0 && targetUserId !== msg.sender.userId) {
            if (!(await this.ensureAdmin(msg))) {
                return
            }
        }

        const level = await this.permissionService.getPermissionLevel(
            targetUserId,
            msg.instanceId
        )

        const levelName = this.getLevelName(level)
        const pronoun = args.length > 0 ? targetUserId : '您'

        await msg.reply(`🔍 ${pronoun} 的权限等级: ${levelName} (${level})`)
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

    private async ensureAdmin(msg: MessageEvent): Promise<boolean> {
        const operatorId = msg.sender.userId
        const level = await this.permissionService.getPermissionLevel(operatorId, msg.instanceId)
        if (level > PermissionLevel.ADMIN) {
            await msg.reply('❌ 权限不足，仅管理员可执行该操作')
            return false
        }
        return true
    }

    /**
     * 获取帮助文本
     */
    private getHelpText(): string {
        return `📖 权限管理命令帮助

用法: /permission <子命令> [参数...]

子命令:
• grant <用户ID> <等级> [天数] [备注] - 授予权限
• revoke <用户ID> - 撤销权限
• list - 列出所有权限
• check [用户ID] - 检查权限等级

权限等级:
0 - 超级管理员 (系统所有者)
1 - 管理员 (实例管理)
2 - 版主 (群组管理)
3 - 普通用户 (基本功能)
4 - 访客 (受限访问)

示例:
/permission grant tg:u:123456 1 - 授予永久管理员权限
/permission grant qq:u:789012 2 30 - 授予30天临时版主权限
/permission revoke tg:u:123456 - 撤销权限
/permission list - 查看所有权限
/permission check - 检查自己的权限`
    }
}
