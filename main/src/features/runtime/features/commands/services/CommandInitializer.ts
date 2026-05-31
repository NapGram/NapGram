import type { CommandsFeature } from '../CommandsFeature.js'

export class CommandInitializer {
  constructor(private feature: CommandsFeature) {}

  async registerDefaultCommands(): Promise<void> {
    // === 从插件系统加载命令（双轨并行策略） ===
    await (this.feature as any).loadPluginCommands()

    this.feature.registerCommand({
      name: 'start',
      aliases: ['开始'],
      description: '设置或查看工作模式',
      usage: '/start <group|personal|public>',
      permission: { level: 3 },
      handler: (msg, args) => (this.feature as any).handleWorkModeCommand(msg, args),
    })

    this.feature.registerCommand({
      name: 'workmode',
      aliases: ['工作模式'],
      description: '设置或查看工作模式',
      usage: '/workmode <group|personal|public>',
      permission: { level: 1 },
      handler: (msg, args) => (this.feature as any).handleWorkModeCommand(msg, args),
      adminOnly: true,
    })

    // 帮助命令
    this.feature.registerCommand({
      name: 'help',
      aliases: ['h', '帮助'],
      description: '显示帮助信息',
      permission: { level: 3 }, // USER
      handler: (msg, args) => (this.feature as any).helpHandler.execute(msg, args),
    })

    // 状态命令
    this.feature.registerCommand({
      name: 'status',
      aliases: ['状态'],
      description: '显示机器人状态',
      permission: { level: 3 }, // USER
      handler: (msg, args) => (this.feature as any).statusHandler.execute(msg, args),
    })

    // 绑定命令
    this.feature.registerCommand({
      name: 'bind',
      aliases: ['绑定'],
      description: '绑定指定 QQ 群到当前 TG 聊天',
      usage: '/bind <qq_group_id> [thread_id]',
      permission: { level: 1 }, // ADMIN
      handler: (msg, args) => (this.feature as any).bindHandler.execute(msg, args),
      adminOnly: true, // 保持向后兼容
    })

    this.feature.registerCommand({
      name: 'bindgroup',
      aliases: ['绑定群'],
      description: '绑定指定 QQ 群到当前 TG 聊天',
      usage: '/bindgroup <qq_group_id> [thread_id]',
      permission: { level: 1 }, // ADMIN
      handler: (msg, args) => (this.feature as any).bindHandler.execute(msg, args, 'group'),
      adminOnly: true, // 保持向后兼容
    })

    this.feature.registerCommand({
      name: 'bindfriend',
      aliases: ['绑定好友'],
      description: '绑定指定 QQ 好友到当前 TG 聊天',
      usage: '/bindfriend <qq_user_id> [thread_id]',
      permission: { level: 1 }, // ADMIN
      handler: (msg, args) => (this.feature as any).bindHandler.execute(msg, args, 'private'),
      adminOnly: true, // 保持向后兼容
    })

    this.feature.registerCommand({
      name: 'addfriend',
      aliases: ['添加好友'],
      description: '为指定 QQ 好友创建 Telegram 群并绑定',
      usage: '/addfriend <qq_user_id>',
      permission: { level: 1 }, // ADMIN
      handler: (msg, args) => (this.feature as any).handleAddQQTargetCommand(msg, args, 'private'),
      adminOnly: true,
    })

    this.feature.registerCommand({
      name: 'addgroup',
      aliases: ['添加群'],
      description: '为指定 QQ 群创建 Telegram 群并绑定',
      usage: '/addgroup <qq_group_id>',
      permission: { level: 1 }, // ADMIN
      handler: (msg, args) => (this.feature as any).handleAddQQTargetCommand(msg, args, 'group'),
      adminOnly: true,
    })

    this.feature.registerCommand({
      name: 'unbind',
      aliases: ['解绑'],
      description: '解除当前 TG 聊天的 QQ 绑定',
      permission: { level: 1 }, // ADMIN
      handler: (msg, args) => (this.feature as any).unbindHandler.execute(msg, args),
      adminOnly: true, // 保持向后兼容
    })

    this.feature.registerCommand({
      name: 'rm',
      aliases: ['撤回', 'rmq'],
      description: '撤回回复的 QQ 消息',
      permission: { level: 2 }, // MEMBER
      handler: (msg, args) => (this.feature as any).recallHandler.execute(msg, args),
    })

    this.feature.registerCommand({
      name: 'forwardoff',
      aliases: ['暂停转发'],
      description: '暂停当前会话的转发功能',
      permission: { level: 1 }, // ADMIN
      handler: (msg, args) => (this.feature as any).forwardControlHandler.execute(msg, args, 'off'),
      adminOnly: true, // 保持向后兼容
    })

    this.feature.registerCommand({
      name: 'forwardon',
      aliases: ['恢复转发'],
      description: '恢复当前会话的转发功能',
      permission: { level: 1 }, // ADMIN
      handler: (msg, args) => (this.feature as any).forwardControlHandler.execute(msg, args, 'on'),
      adminOnly: true, // 保持向后兼容
    })

    this.feature.registerCommand({
      name: 'disable_qq_forward',
      description: '禁用 QQ -> TG 的单向转发',
      permission: { level: 1 }, // ADMIN
      handler: (msg, args) => (this.feature as any).forwardControlHandler.execute(msg, args, 'disable_qq'),
      adminOnly: true, // 保持向后兼容
    })

    this.feature.registerCommand({
      name: 'enable_qq_forward',
      description: '启用 QQ -> TG 的单向转发',
      permission: { level: 1 }, // ADMIN
      handler: (msg, args) => (this.feature as any).forwardControlHandler.execute(msg, args, 'enable_qq'),
      adminOnly: true, // 保持向后兼容
    })

    this.feature.registerCommand({
      name: 'disable_tg_forward',
      description: '禁用 TG -> QQ 的单向转发',
      permission: { level: 1 }, // ADMIN
      handler: (msg, args) => (this.feature as any).forwardControlHandler.execute(msg, args, 'disable_tg'),
      adminOnly: true, // 保持向后兼容
    })

    this.feature.registerCommand({
      name: 'enable_tg_forward',
      description: '启用 TG -> QQ 的单向转发',
      permission: { level: 1 }, // ADMIN
      handler: (msg, args) => (this.feature as any).forwardControlHandler.execute(msg, args, 'enable_tg'),
      adminOnly: true, // 保持向后兼容
    })

    // 信息命令
    this.feature.registerCommand({
      name: 'info',
      aliases: ['信息'],
      description: '显示用户或群组信息',
      permission: { level: 3 }, // USER
      handler: (msg, args) => (this.feature as any).infoHandler.execute(msg, args),
    })
  }
}
