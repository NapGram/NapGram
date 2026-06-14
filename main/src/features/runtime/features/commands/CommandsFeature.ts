import type { Message } from '@mtcute/core'
import type { MessageContent, UnifiedMessage } from '@napgram/message-kit'
import type { RuntimePluginHandle } from '@napgram/runtime-kit'
import type { ForwardMap, Instance, IQQClient, Telegram } from '../../runtime-types.js'
import type { Command } from './types.js'
import { md } from '@mtcute/markdown-parser'
import { messageConverter } from '@napgram/message-kit'
import { telegramSend } from '../../../../shared/utils/index.js'
import { getEventPublisher } from '../../capabilities/events.js'
import { getLogger } from '../../capabilities/logging.js'
import { buildWorkModePrompt, hasConfiguredWorkMode, isWorkModeCommand, parseWorkMode, WORK_MODE_LABELS, type WorkMode } from '../../work-mode-gate.js'
import { BindCommandHandler } from './handlers/BindCommandHandler.js'
import { CommandContext } from './handlers/CommandContext.js'
import { ForwardControlCommandHandler } from './handlers/ForwardControlCommandHandler.js'
import { HelpCommandHandler } from './handlers/HelpCommandHandler.js'
import { InfoCommandHandler } from './handlers/InfoCommandHandler.js'
import { RecallCommandHandler } from './handlers/RecallCommandHandler.js'
import { StatusCommandHandler } from './handlers/StatusCommandHandler.js'
import { UnbindCommandHandler } from './handlers/UnbindCommandHandler.js'
import { CommandRegistry } from './services/CommandRegistry.js'
import { InteractiveStateManager } from './services/InteractiveStateManager.js'
import { CommandAccessChecker } from './services/CommandAccessChecker.js'
import { ThreadIdExtractor } from './services/ThreadIdExtractor.js'
import { PersonalPairProvisioner } from '../forward/services/PersonalPairProvisioner.js'
import { hasQ2tgSkipMarker } from '../../utils/QqLoopbackMarker.js'
import { addForwardPairWithChatType, findPairByTGWithChatType, formatQqChatTypeLabel, qqChatTypeFromMessage, type QqChatType } from './utils/ForwardPairChatType.js'

const logger = getLogger('CommandsFeature')

const QQ_GROUP_ONLY_PLUGIN_COMMANDS = new Set([
  'ban',
  'unban',
  'kick',
  'card',
  'mute',
  'muteall',
  'unmuteall',
  'admin',
  'groupname',
  'title',
  'poke',
  'nick',
  'honor',
  'refresh',
  'refresh_all',
])

/**
 * 命令类型
 */
export type CommandHandler = (msg: UnifiedMessage, args: string[]) => Promise<void>
export type { Command }

type CommandPermissionResult = { allowed: boolean, reason?: string }

type PermissionAuditEvent = {
  eventType: string
  operatorId?: string
  targetUserId?: string
  instanceId?: number
  commandName?: string
  details?: Record<string, unknown>
}

type PermissionServiceLike = {
  checkCommandPermission: (
    userId: string,
    commandName: string,
    requiredLevel: number,
    requireOwner: boolean,
    instanceId?: number,
  ) => Promise<CommandPermissionResult>
  logAudit?: (event: PermissionAuditEvent) => Promise<void>
}

type PermissionPluginExports = {
  permissionService: PermissionServiceLike
}

type CommandCapablePluginContext = {
  logger?: unknown
  getCommands: () => Map<string, {
    name: string
    aliases?: string[]
    description?: string
    usage?: string
    permission?: Command['permission']
    adminOnly?: boolean
    handler: (event: unknown, args: string[]) => void | Promise<void>
  }>
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? value as Record<string, unknown>
    : null
}

function toPermissionExports(value: unknown): PermissionPluginExports | null {
  const candidate = asRecord(value)
  if (!candidate) {
    return null
  }

  const permissionService = asRecord(candidate.permissionService)
  if (!permissionService || typeof permissionService.checkCommandPermission !== 'function') {
    return null
  }

  return {
    permissionService: {
      checkCommandPermission: permissionService.checkCommandPermission as PermissionServiceLike['checkCommandPermission'],
      logAudit: typeof permissionService.logAudit === 'function'
        ? permissionService.logAudit as PermissionServiceLike['logAudit']
        : undefined,
    },
  }
}

function resolvePermissionExports(entry: RuntimePluginHandle | undefined): PermissionPluginExports | null {
  if (!entry) {
    return null
  }

  return toPermissionExports(entry.plugin?.exports)
}

function getCommandPluginContext(entry: RuntimePluginHandle): CommandCapablePluginContext | null {
  const context = asRecord(entry.context)
  if (!context || typeof context.getCommands !== 'function') {
    return null
  }

  return context as unknown as CommandCapablePluginContext
}

/**
 * 命令处理功能
 * Phase 3: 统一的命令处理系统
 */
export class CommandsFeature {
  private readonly registry: CommandRegistry
  private readonly permissionChecker: CommandAccessChecker
  private readonly stateManager: InteractiveStateManager
  private readonly commandContext: CommandContext
  private permissionPlugin: PermissionPluginExports | null = null

  // 命令处理器
  private readonly helpHandler: HelpCommandHandler
  private readonly statusHandler: StatusCommandHandler
  private readonly bindHandler: BindCommandHandler
  private readonly unbindHandler: UnbindCommandHandler
  private readonly recallHandler: RecallCommandHandler
  private readonly forwardControlHandler: ForwardControlCommandHandler
  private readonly infoHandler: InfoCommandHandler
  private personalPairProvisioner?: PersonalPairProvisioner

  constructor(
    private readonly instance: Instance,
    private readonly tgBot: Telegram,
    private readonly qqClient: IQQClient,
  ) {
    this.registry = new CommandRegistry()
    this.permissionChecker = new CommandAccessChecker(instance)
    this.stateManager = new InteractiveStateManager()

    this.commandContext = new CommandContext(
      instance,
      tgBot,
      qqClient,
      this.registry,
      this.permissionChecker,
      this.stateManager,
      this.replyTG.bind(this),
      this.extractThreadId.bind(this),
    )

    this.helpHandler = new HelpCommandHandler(this.commandContext)
    this.statusHandler = new StatusCommandHandler(this.commandContext)
    this.bindHandler = new BindCommandHandler(this.commandContext)
    this.unbindHandler = new UnbindCommandHandler(this.commandContext)
    this.recallHandler = new RecallCommandHandler(this.commandContext)
    this.forwardControlHandler = new ForwardControlCommandHandler(this.commandContext)
    this.infoHandler = new InfoCommandHandler(this.commandContext)

    // 异步注册命令（包括从插件加载）
    this.registerDefaultCommands().catch((err) => {
      logger.error('Failed to register default commands:', err)
    })

    // 延迟加载权限插件，避免循环依赖
    this.initializePermissionPlugin().catch((err) => {
      logger.debug('Permission plugin not available:', err)
    })

    this.setupListeners()
    logger.info('CommandsFeature ✓ 初始化完成')
  }

  /**
   * 重新加载命令（用于插件重载后刷新命令处理器）
   */
  async reloadCommands() {
    this.registry.clear()
    await this.registerDefaultCommands()
    // 重新获取权限插件
    await this.initializePermissionPlugin().catch(() => {
      // 忽略错误
    })
    logger.info('CommandsFeature commands reloaded')
  }

  /**
   * 延迟加载权限插件
   */
  private async initializePermissionPlugin() {
    try {
      const { getGlobalRuntime } = await import('@napgram/plugin-kit')
      const runtime = getGlobalRuntime()

      if (!runtime) {
        return
      }

      const report = runtime.getLastReport()
      const loadedPlugins = report?.loadedPlugins || []

      const permPlugin = loadedPlugins.find(plugin => plugin.id === 'permission-management')
      let permissionExports = resolvePermissionExports(permPlugin)

      if (!permissionExports) {
        permissionExports = resolvePermissionExports(runtime.getPlugin('permission-management'))
      }

      if (permissionExports?.permissionService) {
        this.permissionPlugin = permissionExports
        logger.info('✓ Permission plugin integrated')
      }
    }
    catch {
      logger.debug('Plugin system not available, using fallback permission checker')
    }
  }

  /**
   * 检查命令权限
   */
  private async checkPermission(userId: string, command: Command): Promise<{ allowed: boolean, reason?: string }> {
    if (this.permissionPlugin?.permissionService) {
      const requiredLevel = command.permission?.level ?? (command.adminOnly ? 1 : 3)
      const requireOwner = command.permission?.requireOwner ?? false

      try {
        return await this.permissionPlugin.permissionService.checkCommandPermission(
          userId,
          command.name,
          requiredLevel,
          requireOwner,
          this.instance.id,
        )
      }
      catch (error) {
        logger.warn('Permission check failed, falling back to CommandAccessChecker:', error)
      }
    }

    const fallbackLevel = command.permission?.level
    if (command.adminOnly || (fallbackLevel !== undefined && fallbackLevel <= 1)) {
      const isAdmin = this.permissionChecker.isAdmin(userId)
      return {
        allowed: isAdmin,
        reason: isAdmin ? undefined : '此命令仅限管理员使用',
      }
    }

    return { allowed: true }
  }

  /**
   * 记录审计日志
   */
  private async logAudit(event: {
    eventType: string
    userId: string
    commandName: string
    reason?: string
  }): Promise<void> {
    if (this.permissionPlugin?.permissionService?.logAudit) {
      try {
        await this.permissionPlugin.permissionService.logAudit({
          eventType: event.eventType,
          operatorId: event.userId,
          commandName: event.commandName,
          instanceId: this.instance.id,
          details: event.reason ? { reason: event.reason } : {},
        })
      }
      catch (error) {
        logger.debug('Failed to log audit:', error)
      }
    }
  }

  private isWorkModeConfigured(): boolean {
    return hasConfiguredWorkMode(this.instance)
  }

  private parseWorkMode(value: string | undefined): WorkMode | undefined {
    return parseWorkMode(value)
  }

  private buildWorkModePrompt(): string {
    return buildWorkModePrompt(this.instance)
  }

  private async applyWorkMode(mode: WorkMode): Promise<void> {
    const setWorkMode = (this.instance as any).setWorkMode
    if (typeof setWorkMode === 'function') {
      await setWorkMode.call(this.instance, mode)
      return
    }

    ;(this.instance as any).workMode = mode
    if (mode === 'personal' && typeof (this.instance as any).startUserBot === 'function') {
      await (this.instance as any).startUserBot()
    }
    else if (mode !== 'personal' && typeof (this.instance as any).stopUserBot === 'function') {
      await (this.instance as any).stopUserBot()
    }
  }

  private async replyWorkModeMessage(msg: UnifiedMessage, text: string): Promise<void> {
    if (msg.platform === 'telegram') {
      const threadId = this.commandContext.extractThreadId(msg, [])
      await this.replyTG(msg.chat.id, text, threadId)
      return
    }

    await this.commandContext.replyQQ(msg.chat.id, text, qqChatTypeFromMessage(msg))
  }

  private async handleWorkModeCommand(msg: UnifiedMessage, args: string[]): Promise<void> {
    const mode = this.parseWorkMode(args[0])
    if (!mode) {
      await this.replyWorkModeMessage(msg, this.buildWorkModePrompt())
      return
    }

    const userId = msg.platform === 'telegram'
      ? `tg:u:${msg.sender.id}`
      : `qq:u:${msg.sender.id}`
    if (!this.permissionChecker.isAdmin(userId)) {
      await this.replyWorkModeMessage(msg, '您没有权限设置工作模式')
      return
    }

    await this.applyWorkMode(mode)
    await this.replyWorkModeMessage(
      msg,
      `工作模式已设置为 ${WORK_MODE_LABELS[mode]}。\n现在可以继续使用绑定、转发和其他功能。`,
    )
  }

  private async blockUntilWorkModeConfigured(msg: UnifiedMessage, commandName: string): Promise<boolean> {
    if (this.isWorkModeConfigured())
      return false
    if (isWorkModeCommand(commandName))
      return false

    await this.replyWorkModeMessage(msg, this.buildWorkModePrompt())
    return true
  }

  private isPersonalMode(): boolean {
    return (this.instance as any).workMode === 'personal'
      || (this.instance as any).getPersonalModeDiagnostics?.().workMode === 'personal'
  }

  private getPersonalPairProvisioner(): PersonalPairProvisioner | undefined {
    const forwardMap = this.instance.forwardPairs as ForwardMap | undefined
    const isForwardMap = forwardMap
      && typeof (forwardMap as any).findByQQ === 'function'
      && typeof (forwardMap as any).findByTG === 'function'
    if (!isForwardMap)
      return undefined

    if (!this.personalPairProvisioner)
      this.personalPairProvisioner = new PersonalPairProvisioner(this.instance, forwardMap, this.qqClient)

    return this.personalPairProvisioner
  }

  private async handleAddQQTargetCommand(msg: UnifiedMessage, args: string[], qqChatType: QqChatType): Promise<void> {
    if (!this.isPersonalMode()) {
      await this.replyWorkModeMessage(msg, '该命令仅在个人模式下可用')
      return
    }

    const qqRoomId = args[0]?.trim()
    if (!qqRoomId || !/^\d+$/.test(qqRoomId)) {
      const commandName = qqChatType === 'private' ? 'addfriend' : 'addgroup'
      const targetName = qqChatType === 'private' ? 'qq_user_id' : 'qq_group_id'
      await this.replyWorkModeMessage(msg, `用法：/${commandName} <${targetName}>`)
      return
    }

    const provisioner = this.getPersonalPairProvisioner()
    if (!provisioner) {
      await this.replyWorkModeMessage(msg, '转发表尚未初始化，无法创建绑定')
      return
    }

    const label = formatQqChatTypeLabel(qqChatType)
    const pair = await provisioner.ensurePairForQQTarget(qqRoomId, qqChatType)
    if (!pair) {
      await this.replyWorkModeMessage(msg, `无法为 ${label} ${qqRoomId} 创建 Telegram 群，请检查个人模式 UserBot 状态`)
      return
    }

    await this.replyWorkModeMessage(
      msg,
      `已创建 Telegram 群并绑定 ${label} ${qqRoomId}。\nTG: ${pair.tgChatId}`,
    )
  }

  /**
   * 注册默认命令
   */
  private async registerDefaultCommands() {
    await this.loadPluginCommands()

    this.registerCommand({
      name: 'start',
      aliases: ['开始'],
      description: '设置或查看工作模式',
      usage: '/start <group|personal|public>',
      permission: { level: 3 },
      handler: (msg, args) => this.handleWorkModeCommand(msg, args),
    })

    this.registerCommand({
      name: 'workmode',
      aliases: ['工作模式'],
      description: '设置或查看工作模式',
      usage: '/workmode <group|personal|public>',
      permission: { level: 1 },
      handler: (msg, args) => this.handleWorkModeCommand(msg, args),
      adminOnly: true,
    })

    this.registerCommand({
      name: 'help',
      aliases: ['h', '帮助'],
      description: '显示帮助信息',
      permission: { level: 3 },
      handler: (msg, args) => this.helpHandler.execute(msg, args),
    })

    this.registerCommand({
      name: 'status',
      aliases: ['状态'],
      description: '显示机器人状态',
      permission: { level: 3 },
      handler: (msg, args) => this.statusHandler.execute(msg, args),
    })

    this.registerCommand({
      name: 'bind',
      aliases: ['绑定'],
      description: '绑定指定 QQ 群到当前 TG 聊天',
      usage: '/bind <qq_group_id> [thread_id]',
      permission: { level: 1 },
      handler: (msg, args) => this.bindHandler.execute(msg, args),
      adminOnly: true,
    })

    this.registerCommand({
      name: 'bindgroup',
      aliases: ['绑定群'],
      description: '绑定指定 QQ 群到当前 TG 聊天',
      usage: '/bindgroup <qq_group_id> [thread_id]',
      permission: { level: 1 },
      handler: (msg, args) => this.bindHandler.execute(msg, args, 'group'),
      adminOnly: true,
    })

    this.registerCommand({
      name: 'bindfriend',
      aliases: ['绑定好友'],
      description: '绑定指定 QQ 好友到当前 TG 聊天',
      usage: '/bindfriend <qq_user_id> [thread_id]',
      permission: { level: 1 },
      handler: (msg, args) => this.bindHandler.execute(msg, args, 'private'),
      adminOnly: true,
    })

    this.registerCommand({
      name: 'addfriend',
      aliases: ['添加好友'],
      description: '为指定 QQ 好友创建 Telegram 群并绑定',
      usage: '/addfriend <qq_user_id>',
      permission: { level: 1 },
      handler: (msg, args) => this.handleAddQQTargetCommand(msg, args, 'private'),
      adminOnly: true,
    })

    this.registerCommand({
      name: 'addgroup',
      aliases: ['添加群'],
      description: '为指定 QQ 群创建 Telegram 群并绑定',
      usage: '/addgroup <qq_group_id>',
      permission: { level: 1 },
      handler: (msg, args) => this.handleAddQQTargetCommand(msg, args, 'group'),
      adminOnly: true,
    })

    this.registerCommand({
      name: 'unbind',
      aliases: ['解绑'],
      description: '解除当前 TG 聊天的绑定',
      usage: '/unbind [group|friend] [qq_id]',
      permission: { level: 1 },
      handler: (msg, args) => this.unbindHandler.execute(msg, args),
      adminOnly: true,
    })

    this.registerCommand({
      name: 'rm',
      aliases: ['撤回', 'recall'],
      description: '撤回消息',
      usage: '/rm [count]',
      permission: { level: 2 },
      handler: (msg, args) => this.recallHandler.execute(msg, args),
    })

    this.registerCommand({
      name: 'forwardoff',
      description: '暂停双向转发',
      permission: { level: 1 },
      handler: (msg, args) => this.forwardControlHandler.execute(msg, args, 'forwardoff'),
      adminOnly: true,
    })

    this.registerCommand({
      name: 'forwardon',
      description: '恢复双向转发',
      permission: { level: 1 },
      handler: (msg, args) => this.forwardControlHandler.execute(msg, args, 'forwardon'),
      adminOnly: true,
    })

    this.registerCommand({
      name: 'disable_qq_forward',
      description: '停止 QQ → TG 的转发',
      permission: { level: 1 },
      handler: (msg, args) => this.forwardControlHandler.execute(msg, args, 'disable_qq_forward'),
      adminOnly: true,
    })

    this.registerCommand({
      name: 'enable_qq_forward',
      description: '恢复 QQ → TG 的转发',
      permission: { level: 1 },
      handler: (msg, args) => this.forwardControlHandler.execute(msg, args, 'enable_qq_forward'),
      adminOnly: true,
    })

    this.registerCommand({
      name: 'disable_tg_forward',
      description: '停止 TG → QQ 的转发',
      permission: { level: 1 },
      handler: (msg, args) => this.forwardControlHandler.execute(msg, args, 'disable_tg_forward'),
      adminOnly: true,
    })

    this.registerCommand({
      name: 'enable_tg_forward',
      description: '恢复 TG → QQ 的转发',
      permission: { level: 1 },
      handler: (msg, args) => this.forwardControlHandler.execute(msg, args, 'enable_tg_forward'),
      adminOnly: true,
    })

    this.registerCommand({
      name: 'info',
      aliases: ['信息'],
      description: '查看本群或选定消息的详情',
      permission: { level: 2 },
      handler: (msg, args) => this.infoHandler.execute(msg, args),
      adminOnly: true,
    })

    // QQ 交互命令由交互插件提供

    logger.debug(`Registered ${this.registry.getUniqueCommandCount()} commands (${this.registry.getAll().size} including aliases)`)
  }

  /**
   * 注册命令
   */
  registerCommand(command: Command) {
    logger.debug(`registerCommand: ${command.name}`)
    this.registry.register(command)
  }

  /**
   * 从插件系统加载命令
   * @returns 已加载的命令名集合
   */
  private async loadPluginCommands(): Promise<Set<string>> {
    const loadedCommands = new Set<string>()

    try {
      // 动态导入 plugin runtime（避免循环依赖，ESM 兼容）
      const { getGlobalRuntime } = await import('@napgram/plugin-kit')
      const runtime = getGlobalRuntime()

      if (!runtime) {
        logger.debug('Plugin runtime not initialized, skipping plugin command loading')
        return loadedCommands
      }

      const report = runtime.getLastReport()
      const loadedPlugins = report?.loadedPlugins || []

      logger.debug(`Loading commands from ${loadedPlugins.length} plugins`)

      for (const pluginInfo of loadedPlugins) {
        try {
          const context = getCommandPluginContext(pluginInfo)
          if (!context) {
            continue
          }

          const commands = context.getCommands()
          logger.debug(`Plugin ${pluginInfo.id}: found ${commands.size} command(s)`)

          for (const [, config] of commands) {
            this.registerCommand({
              name: config.name,
              aliases: config.aliases,
              description: config.description ?? config.name,
              usage: config.usage,
              permission: (config as any).permission,
              adminOnly: config.adminOnly,
              handler: async (msg, args) => {
                if (QQ_GROUP_ONLY_PLUGIN_COMMANDS.has(config.name) && await this.isFriendPairCommand(msg)) {
                  const threadId = this.commandContext.extractThreadId(msg, [])
                  await this.commandContext.replyTG(msg.chat.id, '❌ 当前绑定是 QQ 好友，QQ 群相关指令不可用', threadId)
                  return
                }

                const event = this.convertToMessageEvent(msg, context.logger)
                await config.handler(event, args)
              },
            })

            loadedCommands.add(config.name)
            if (config.aliases) {
              config.aliases.forEach((alias: string) => loadedCommands.add(alias))
            }

            logger.debug(`  ✓ Loaded command: /${config.name}${config.aliases ? ` (aliases: ${config.aliases.join(', ')})` : ''} from plugin ${pluginInfo.id}`)
          }
        }
        catch (error) {
          logger.warn(`Failed to load commands from plugin ${pluginInfo.id}:`, error)
        }
      }

      if (loadedCommands.size > 0) {
        logger.info(`✓ Loaded ${loadedCommands.size} command(s) from plugins`)
      }
    }
    catch (error) {
      logger.warn('Failed to load plugin commands:', error)
    }

    return loadedCommands
  }

  private async isFriendPairCommand(msg: UnifiedMessage): Promise<boolean> {
    if (msg.platform !== 'telegram')
      return false

    const forwardMap = this.instance.forwardPairs as ForwardMap
    const threadId = this.commandContext.extractThreadId(msg, [])
    const pair = await findPairByTGWithChatType(forwardMap, msg.chat.id, threadId, true)
    return pair?.qqChatType === 'private'
  }

  /**
   * 将 UnifiedMessage 转换为 MessageEvent（用于插件命令处理）
   */
  private convertToMessageEvent(msg: UnifiedMessage, pluginLogger?: any) {
    const commandContext = this.commandContext
    const eventLogger = pluginLogger || logger
    const segmentsToText = (segments: any[]): string => {
      if (!Array.isArray(segments))
        return ''
      return segments
        .map((seg) => {
          if (!seg || typeof seg !== 'object')
            return ''
          switch (seg.type) {
            case 'text':
              return String(seg.data?.text ?? '')
            case 'at':
              return seg.data?.userName ? `@${seg.data.userName}` : '@'
            case 'image':
              return '[图片]'
            case 'video':
              return '[视频]'
            case 'audio':
              return '[语音]'
            case 'file':
              return seg.data?.name ? `[文件:${seg.data.name}]` : '[文件]'
            default:
              return ''
          }
        })
        .filter(Boolean)
        .join('')
    }

    const platform = msg.platform === 'telegram' ? 'tg' : 'qq'
    const senderId = msg.sender.id
    const senderUserId = platform === 'tg' ? `tg:u:${senderId}` : `qq:u:${senderId}`

    return {
      eventId: msg.id,
      instanceId: this.instance.id,
      platform,
      channelId: msg.chat.id,
      threadId: commandContext.extractThreadId(msg, []),
      channelType: msg.chat.type as any,
      sender: {
        userId: senderUserId,
        userName: msg.sender.name,
      },
      message: {
        id: msg.id,
        text: msg.content.find(c => c.type === 'text')?.data.text || '',
        segments: msg.content as any[],
        timestamp: msg.timestamp,
      },
      logger: eventLogger,
      raw: {
        ...msg.metadata?.raw,
        rawReply: msg.metadata?.rawReply,
      },
      reply: async (content: string | any[]) => {
        if (msg.platform === 'telegram') {
          const chatId = msg.chat.id
          const threadId = commandContext.extractThreadId(msg, [])
          const text = typeof content === 'string' ? content : segmentsToText(content)
          await commandContext.replyTG(chatId, text, threadId)
        }
        else {
          await this.sendQQCommandReply(msg, content, segmentsToText)
        }
        return { messageId: `qq:${msg.id}`, timestamp: Date.now() }
      },
      send: async (content: string | any[]) => {
        // 发送与回复一致（暂时没有独立发送接口）
        if (msg.platform === 'telegram') {
          const chatId = msg.chat.id
          const threadId = commandContext.extractThreadId(msg, [])
          const text = typeof content === 'string' ? content : segmentsToText(content)
          await commandContext.replyTG(chatId, text, threadId)
        }
        else {
          await this.sendQQCommandReply(msg, content, segmentsToText)
        }
        return { messageId: `qq:${msg.id}`, timestamp: Date.now() }
      },
      recall: async () => {
        // 撤回功能暂不实现
        throw new Error('recall() not yet implemented')
      },
      qq: this.qqClient,
      tg: this.tgBot,
      instance: this.instance,
    }
  }

  private isForwardSegment(seg: any): seg is { type: 'forward', data: { messages: any[] } } {
    return !!seg && seg.type === 'forward' && Array.isArray(seg.data?.messages)
  }

  private resolveForwardUin(rawId: string | undefined, fallback: number): number {
    if (!rawId)
      return fallback
    const numeric = rawId.match(/\d+/g)?.join('')
    return numeric ? Number(numeric) : fallback
  }

  private pluginSegmentsToContents(segments: any[]): MessageContent[] {
    const out: MessageContent[] = []
    if (!Array.isArray(segments))
      return out
    for (const seg of segments) {
      if (!seg || typeof seg !== 'object')
        continue
      switch (seg.type) {
        case 'text':
          out.push({ type: 'text', data: { text: String(seg.data?.text ?? '') } })
          break
        case 'at':
          out.push({ type: 'at', data: { userId: String(seg.data?.userId ?? ''), userName: seg.data?.userName } })
          break
        case 'reply':
          out.push({ type: 'reply', data: { messageId: String(seg.data?.messageId ?? ''), senderId: '', senderName: '' } })
          break
        case 'image':
          out.push({ type: 'image', data: { url: seg.data?.url, file: seg.data?.file } })
          break
        case 'video':
          out.push({ type: 'video', data: { url: seg.data?.url, file: seg.data?.file } })
          break
        case 'audio':
          out.push({ type: 'audio', data: { url: seg.data?.url, file: seg.data?.file } })
          break
        case 'file':
          out.push({ type: 'file', data: { url: seg.data?.url, file: seg.data?.file, filename: seg.data?.name || 'file' } })
          break
        default:
          out.push({ type: 'text', data: { text: '' } })
          break
      }
    }
    return out
  }

  private async sendQQCommandReply(
    msg: UnifiedMessage,
    content: string | any[],
    segmentsToText: (segments: any[]) => string,
  ) {
    const chatId = msg.chat.id
    const qqChatType = qqChatTypeFromMessage(msg)
    if (typeof content === 'string') {
      await this.commandContext.replyQQ(chatId, content, qqChatType)
      return
    }

    if (!Array.isArray(content) || content.length === 0) {
      await this.commandContext.replyQQ(chatId, '', qqChatType)
      return
    }

    const forwardSegments = content.filter(seg => this.isForwardSegment(seg))
    const normalSegments = content.filter(seg => !this.isForwardSegment(seg))

    if (normalSegments.length) {
      const text = segmentsToText(normalSegments)
      if (text)
        await this.commandContext.replyQQ(chatId, text, qqChatType)
    }

    if (!forwardSegments.length)
      return

    if (msg.chat.type !== 'group') {
      const fallbackText = segmentsToText(content)
      if (fallbackText)
        await this.commandContext.replyQQ(chatId, fallbackText, qqChatType)
      return
    }

    const nodes: any[] = []
    const botUin = Number(this.qqClient.uin || 0)
    const botName = String(this.qqClient.nickname || this.qqClient.uin || 'Bot')
    let index = 0
    for (const seg of forwardSegments) {
      for (const fwd of seg.data?.messages || []) {
        const name = botName
        const userId = String(fwd?.userId || '')
        const parsedUin = this.resolveForwardUin(userId, botUin)
        const uin = botUin || parsedUin
        const contentSegments = this.pluginSegmentsToContents(fwd?.segments || [])
        const unified: UnifiedMessage = {
          id: `cmd-forward-${Date.now()}-${index++}`,
          platform: 'qq',
          sender: { id: userId || String(uin), name },
          chat: { id: chatId, type: msg.chat.type as any },
          content: contentSegments,
          timestamp: Date.now(),
        }
        const napCatSegments = await messageConverter.toNapCat(unified)
        nodes.push({
          type: 'node',
          data: {
            name,
            uin,
            content: napCatSegments,
          },
        })
      }
    }

    if (nodes.length) {
      await this.qqClient.sendGroupForwardMsg(String(chatId), nodes)
    }
  }

  /**
   * 设置事件监听器
   */
  private setupListeners() {
    // 监听 TG 侧消息
    logger.info('CommandsFeature listening Telegram messages for commands')
    this.tgBot.addNewMessageEventHandler(this.handleTgMessage)

    // 监听 QQ 侧消息
    logger.info('CommandsFeature listening QQ messages for commands')
    this.qqClient.on('message', this.handleQqMessage)
  }

  /**
   * 对外暴露的处理函数，便于其他模块手动调用
   * 返回 true 表示命令已处理，外部可中断后续逻辑
   */
  public processTgMessage = async (tgMsg: any): Promise<boolean> => {
    return await this.handleTgMessage(tgMsg)
  }

  private buildTgCommandMessage(tgMsg: Message, text: string, chatId: any, senderId: any): UnifiedMessage {
    return {
      id: String((tgMsg as any).id ?? ''),
      platform: 'telegram',
      chat: {
        id: String(chatId),
        type: (tgMsg.chat as any)?.type === 'private' ? 'private' : 'group',
      },
      sender: {
        id: String(senderId),
        name: (tgMsg.sender as any)?.displayName || (tgMsg.sender as any)?.username || String(senderId),
      },
      content: [{ type: 'text', data: { text } }],
      timestamp: tgMsg.date instanceof Date ? tgMsg.date.getTime() : typeof tgMsg.date === 'number' ? tgMsg.date : Date.now(),
      metadata: { raw: tgMsg },
    } as UnifiedMessage
  }

  private handleTgMessage = async (tgMsg: Message): Promise<boolean> => {
    try {
      const text = tgMsg.text
      const chatId = tgMsg.chat.id
      const senderId = tgMsg.sender.id
      const myUsername = this.tgBot.me?.username?.toLowerCase()
      const myId = this.tgBot.me?.id

      // 记录所有到达的 TG 文本，方便排查是否收不到事件
      logger.debug('[Commands] TG message', {
        id: tgMsg.id,
        chatId,
        senderId,
        text: (text || '').slice(0, 200),
      })

      // 忽略由 Bot 发送的消息（包含自身），避免被其他转发 Bot 再次触发命令导致重复回复
      const senderPeer = tgMsg.sender as any
      if (senderPeer?.isBot || (myId !== undefined && senderId === myId)) {
        logger.debug(`Ignored bot/self message for command handling: ${senderId}`)
        return false
      }

      if (!this.isWorkModeConfigured() && text && !text.startsWith(this.registry.prefix)) {
        const staleBindingState = this.stateManager.getBindingState(String(chatId), String(senderId))
        if (staleBindingState) {
          this.stateManager.deleteBindingState(String(chatId), String(senderId))
          await this.replyTG(chatId, this.buildWorkModePrompt(), staleBindingState.threadId)
          return true
        }
      }

      // 检查是否有正在进行的绑定操作
      const bindingState = this.stateManager.getBindingState(String(chatId), String(senderId))

      // 如果有等待输入的绑定状态，且消息不是命令（防止命令嵌套）
      if (bindingState && text && !text.startsWith(this.registry.prefix)) {
        // 检查是否超时
        if (this.stateManager.isTimeout(bindingState)) {
          this.stateManager.deleteBindingState(String(chatId), String(senderId))
          await this.replyTG(chatId, '绑定操作已超时，请重新开始', bindingState.threadId)
          return true // 即使超时也视为已处理（防止误触其他逻辑）
        }

        // 尝试解析 QQ 号
        if (/^-?\d+$/.test(text.trim())) {
          const qqTargetId = text.trim()
          const threadId = bindingState.threadId
          const qqChatType = bindingState.qqChatType ?? 'group'
          const qqLabel = formatQqChatTypeLabel(qqChatType)

          // 执行绑定逻辑
          const forwardMap = this.instance.forwardPairs as ForwardMap

          // 检查冲突
          const tgOccupied = await findPairByTGWithChatType(forwardMap, chatId, threadId, false)
          if (tgOccupied && (tgOccupied.qqRoomId.toString() !== qqTargetId || tgOccupied.qqChatType !== qqChatType)) {
            await this.replyTG(chatId, `绑定失败：该 TG 话题已绑定到其他 ${formatQqChatTypeLabel(tgOccupied.qqChatType)} (${tgOccupied.qqRoomId})`, threadId)
            this.stateManager.deleteBindingState(String(chatId), String(senderId))
            return true
          }

          try {
            const rec = await addForwardPairWithChatType(forwardMap, this.instance.id, qqTargetId, chatId, threadId, qqChatType)
            if (rec && (rec.qqRoomId.toString() !== qqTargetId || rec.qqChatType !== qqChatType)) {
              await this.replyTG(chatId, '绑定失败：检测到冲突，请检查现有绑定', threadId)
            }
            else {
              const threadInfo = threadId ? ` (话题 ${threadId})` : ''
              await this.replyTG(chatId, `绑定成功：${qqLabel} ${qqTargetId} <-> TG ${chatId}${threadInfo}`, threadId)
              logger.info(`Interactive Bind: ${qqLabel} ${qqTargetId} <-> TG ${chatId}${threadInfo}`)
            }
          }
          catch (e) {
            logger.error('Interactive bind failed:', e)
            await this.replyTG(chatId, '绑定过程中发生错误', threadId)
          }

          this.stateManager.deleteBindingState(String(chatId), String(senderId))
          return true
        }
        else {
          // 输入非数字，视为取消
          await this.replyTG(chatId, '输入格式错误或已取消绑定操作', bindingState.threadId)
          this.stateManager.deleteBindingState(String(chatId), String(senderId))
          return true
        }
      }

      if (!text || !text.startsWith(this.registry.prefix))
        return false
      if (!chatId)
        return false

      logger.info('[Commands] TG message', {
        id: tgMsg.id,
        chatId,
        senderId,
        text: text.slice(0, 200),
      })

      const senderName = tgMsg.sender.displayName || `${senderId}`
      const parts = text.slice(this.registry.prefix.length).split(/\s+/)

      // 如果命令里显式 @ 了其他 bot，则忽略，避免多个 bot 同时回复
      const mentionedBots = this.extractMentionedBotUsernames(tgMsg, parts)
      if (mentionedBots.size > 0) {
        if (!myUsername) {
          logger.debug('Bot username unavailable, skip explicitly-targeted command')
          return false
        }
        if (!mentionedBots.has(myUsername)) {
          logger.debug(`Ignored command for other bot(s): ${Array.from(mentionedBots).join(',')}`)
          return false
        }
      }

      // 兼容 /cmd@bot 的写法，以及 /cmd @bot (空格分隔) 的写法
      let commandName = parts[0]
      const shiftArgs = 0

      // 场景 1：/cmd@bot
      if (commandName.includes('@')) {
        const [cmd, targetBot] = commandName.split('@')

        // 如果指定了 bot 但不是我，则忽略该命令
        if (targetBot && myUsername && targetBot.toLowerCase() !== myUsername) {
          logger.debug(`Ignored command for other bot (suffix): ${targetBot}`)
          return false
        }
        commandName = cmd
      }
      // 场景 2：/cmd ... @bot（检查所有参数中的 @ 提及）
      else {
        // 查找参数里的 @ 提及（跳过命令本身）
        const botMentionIndex = parts.findIndex((part, idx) => idx > 0 && part.startsWith('@'))

        if (botMentionIndex > 0) {
          const targetBot = parts[botMentionIndex].slice(1)

          if (myUsername && targetBot.toLowerCase() !== myUsername) {
            // 发给别的 bot，忽略
            logger.debug(`Ignored command for other bot at position ${botMentionIndex}: ${targetBot}`)
            return false
          }
          else if (myUsername && targetBot.toLowerCase() === myUsername) {
            // 明确发给我，移除 @ 提及
            parts.splice(botMentionIndex, 1)
          }
        }
      }

      commandName = commandName.toLowerCase()
      const args = parts.slice(1 + shiftArgs)

      const command = this.registry.get(commandName)
      if (!command) {
        logger.debug(`Unknown command: ${commandName}`)
        return false
      }

      const commandMsg = this.buildTgCommandMessage(tgMsg, text, chatId, senderId)
      if (isWorkModeCommand(command)) {
        await this.handleWorkModeCommand(commandMsg, args)
        return true
      }

      if (await this.blockUntilWorkModeConfigured(commandMsg, command.name)) {
        return true
      }

      // 检查权限
      const userId = `tg:u:${senderId}`
      const permissionCheck = await this.checkPermission(userId, command)

      if (!permissionCheck.allowed) {
        logger.warn(`User ${senderId} denied access to command: ${commandName}`)
        await this.replyTG(chatId, `❌ ${permissionCheck.reason || '权限不足'}`)

        // 记录审计日志
        await this.logAudit({
          eventType: 'command_deny',
          userId,
          commandName,
          reason: permissionCheck.reason,
        })

        return true
      }

      logger.info(`Executing command: ${commandName} by ${senderName}`)

      // 记录命令执行审计日志
      await this.logAudit({
        eventType: 'command_execute',
        userId,
        commandName,
      })

      // 如果有回复但回复对象不完整，尝试获取完整消息
      let replenishedReply: Message | undefined
      const replyToId = ((tgMsg as any).replyTo as any)?.messageId || (tgMsg.replyToMessage as any)?.id

      if (replyToId && (!tgMsg.replyToMessage || !(tgMsg.replyToMessage as any).text)) {
        try {
          const repliedMsg = await this.tgBot.client.getMessages(tgMsg.chat.id, [replyToId])
          if (repliedMsg[0]) {
            replenishedReply = repliedMsg[0]
            logger.debug(`Fetched full replenished replied message for ${tgMsg.id}`)
          }
        }
        catch (e) {
          logger.warn(`Failed to fetch replied message for ${tgMsg.id}:`, e)
        }
      }

      const unifiedMsg = messageConverter.fromTelegram(tgMsg, replenishedReply)
      if (replenishedReply) {
        unifiedMsg.metadata = { ...unifiedMsg.metadata, rawReply: replenishedReply }
        logger.debug(`Added rawReply to metadata for msg ${tgMsg.id}`)
      }

      try {
        const eventPublisher = getEventPublisher()
        const threadId = new ThreadIdExtractor().extractFromRaw((tgMsg as any).raw || tgMsg)
        const channelType = (tgMsg.chat as any)?.type === 'private' ? 'private' : 'group'
        const contentToText = (content: string | any[]) => {
          if (typeof content === 'string')
            return content
          if (!Array.isArray(content))
            return String(content ?? '')
          return content
            .map((seg: any) => {
              if (!seg)
                return ''
              if (typeof seg === 'string')
                return seg
              if (seg.type === 'text')
                return String(seg.data?.text ?? '')
              if (seg.type === 'at')
                return seg.data?.userName ? `@${seg.data.userName}` : '@'
              return ''
            })
            .filter(Boolean)
            .join('')
        }

        eventPublisher.publishMessage({
          eventId: `tg:cmd:${tgMsg.id}`,
          instanceId: this.instance.id,
          platform: 'tg',
          channelId: String(tgMsg.chat.id),
          channelType,
          threadId: threadId as any,
          sender: {
            userId: `tg:u:${tgMsg.sender?.id || 0}`,
            userName: tgMsg.sender?.displayName || tgMsg.sender?.username || 'Unknown',
          },
          message: {
            id: String(tgMsg.id),
            text: text || '',
            segments: [{ type: 'text', data: { text: text || '' } }],
            timestamp: tgMsg.date ? (typeof tgMsg.date === 'number' ? tgMsg.date : tgMsg.date.getTime()) : Date.now(),
          },
          raw: tgMsg,
          reply: async (content) => {
            const chat = await this.tgBot.getChat(telegramSend.normalizeTelegramChatId(tgMsg.chat.id) as any)
            const textContent = contentToText(content)
            const params: any = {}
            const replyTo = telegramSend.normalizeTelegramMessageId(tgMsg.id)
            if (replyTo)
              params.replyTo = replyTo
            const sent = await chat.sendMessage(textContent, params)
            return { messageId: `tg:${String(tgMsg.chat.id)}:${String((sent as any)?.id ?? '')}`, timestamp: Date.now() }
          },
          send: async (content) => {
            const chat = await this.tgBot.getChat(telegramSend.normalizeTelegramChatId(tgMsg.chat.id) as any)
            const textContent = contentToText(content)
            const params: any = {}
            const replyTo = telegramSend.normalizeTelegramMessageId(threadId)
            if (replyTo)
              params.replyTo = replyTo
            const sent = await chat.sendMessage(textContent, params)
            return { messageId: `tg:${String(tgMsg.chat.id)}:${String((sent as any)?.id ?? '')}`, timestamp: Date.now() }
          },
          recall: async () => {
            const chat = await this.tgBot.getChat(telegramSend.normalizeTelegramChatId(tgMsg.chat.id) as any)
            const messageId = telegramSend.normalizeTelegramMessageId(tgMsg.id)
            if (!messageId)
              return
            await chat.deleteMessages([messageId])
          },
        })
      }
      catch (error) {
        logger.debug(error, '[Commands] publishMessage (TG command) failed')
      }

      await command.handler(unifiedMsg, args)
      return true
    }
    catch (error) {
      logger.error('Failed to handle command:', error)
      return false
    }
  }

  private handleQqMessage = async (qqMsg: UnifiedMessage): Promise<void> => {
    try {
      if (hasQ2tgSkipMarker(qqMsg)) {
        logger.debug(`[Commands] Ignored q2tgSkip QQ loopback message: ${qqMsg.id}`)
        return
      }

      // 提取所有文本内容并合并
      const textContents = qqMsg.content.filter(c => c.type === 'text')
      if (textContents.length === 0)
        return

      const text = textContents.map(c => c.data.text || '').join('').trim()
      if (!text || !text.startsWith(this.registry.prefix))
        return

      const chatId = qqMsg.chat.id
      const senderId = qqMsg.sender.id

      logger.info('[Commands] QQ message', {
        id: qqMsg.id,
        chatId,
        senderId,
        text: text.slice(0, 200),
      })

      const senderName = qqMsg.sender.name || `${senderId}`

      // 解析命令
      const parts = text.slice(this.registry.prefix.length).split(/\s+/)
      const commandName = parts[0].toLowerCase()
      const args = parts.slice(1)

      const command = this.registry.get(commandName)
      if (!command) {
        logger.debug(`Unknown QQ command: ${commandName}`)
        return
      }

      if (isWorkModeCommand(command)) {
        await this.handleWorkModeCommand(qqMsg, args)
        return
      }

      if (await this.blockUntilWorkModeConfigured(qqMsg, command.name)) {
        return
      }

      // 检查权限
      const userId = `qq:u:${senderId}`
      const permissionCheck = await this.checkPermission(userId, command)

      if (!permissionCheck.allowed) {
        logger.warn(`QQ User ${senderId} denied access to command: ${commandName}`)
        // QQ侧暂不回复权限错误，以免干扰正常聊天
        // 记录审计日志
        await this.logAudit({
          eventType: 'command_deny',
          userId,
          commandName,
          reason: permissionCheck.reason,
        })
        return
      }

      logger.info(`Executing QQ command: ${commandName} by ${senderName}`)

      // 记录命令执行审计日志
      await this.logAudit({
        eventType: 'command_execute',
        userId,
        commandName,
      })

      // 执行命令
      await command.handler(qqMsg, args)

      // 命令执行成功后，尝试撤回命令消息本身
      if (command.name === 'rm') {
        try {
          await this.qqClient.recallMessage(qqMsg.id)
          logger.info(`QQ command message ${qqMsg.id} recalled`)
        }
        catch (e) {
          logger.warn(e, 'Failed to recall QQ command message')
        }
      }
    }
    catch (error) {
      logger.error('Failed to handle QQ command:', error)
    }
  }

  private extractThreadId(msg: UnifiedMessage, args: string[]): bigint | undefined {
    // 1. 优先从命令参数获取（显式指定）
    const arg = args[1]
    if (arg && /^-?\d+$/.test(arg)) {
      logger.debug(`[extractThreadId] From arg: ${arg}`)
      return BigInt(arg)
    }

    // 2. 使用 ThreadIdExtractor 从消息元数据中提取
    const raw = (msg.metadata as any)?.raw
    if (raw) {
      const threadId = new ThreadIdExtractor().extractFromRaw(raw)
      logger.debug(`[extractThreadId] From raw: ${threadId}, raw keys: ${Object.keys(raw).join(',')}`)
      if (threadId)
        return threadId
    }

    // 3. 回退：无 thread
    logger.debug(`[extractThreadId] No thread ID found`)
    return undefined
  }

  private async replyTG(chatId: string | number | bigint, text: any, threadId?: bigint | number) {
    try {
      const chat = await this.tgBot.getChat(telegramSend.normalizeTelegramChatId(chatId) as any)

      // 使用 parseMode: 'markdown' 并不稳定，我们直接使用 mtcute 的 md 解析器
      // 能够将包含 markdown 语法的动态字符串解析为 InputText
      let msgContent = text
      if (typeof text === 'string') {
        const parts: any = [text]
        parts.raw = [text]
        msgContent = md(parts as TemplateStringsArray)
      }

      await chat.sendMessage(msgContent, telegramSend.buildTelegramTextSendParams(threadId))
    }
    catch (error) {
      logger.warn(`Failed to send reply to ${chatId}: ${error}`)
    }
  }

  /**
   * 提取消息中显式 @ 的 Bot 名称（只识别以 bot 结尾的用户名）
   */
  private extractMentionedBotUsernames(tgMsg: Message, parts: string[]): Set<string> {
    const mentioned = new Set<string>()
    const tryAdd = (raw?: string) => {
      if (!raw)
        return
      const normalized = raw.trim().toLowerCase()
      if (normalized.endsWith('bot')) {
        mentioned.add(normalized)
      }
    }

    // 1) 文本拆分片段
    for (const part of parts) {
      if (!part)
        continue
      if (part.startsWith('@')) {
        tryAdd(part.slice(1))
      }
      else if (part.includes('@')) {
        const [, bot] = part.split('@')
        tryAdd(bot)
      }
    }

    // 2) Telegram entities（更准确地获取 bot_command/mention）
    for (const entity of tgMsg.entities || []) {
      if (entity.kind === 'mention' || entity.kind === 'bot_command') {
        const match = entity.text?.match(/@(\w+)/)
        if (match?.[1]) {
          tryAdd(match[1])
        }
      }
    }

    return mentioned
  }

  /**
   * 清理资源
   */
  destroy() {
    this.tgBot.removeNewMessageEventHandler(this.handleTgMessage)
    this.qqClient.off('message', this.handleQqMessage)
    this.registry.clear()
    logger.info('CommandsFeature destroyed')
  }
}
