import type { Message } from '@mtcute/core'
import type { MessageContent, UnifiedMessage } from '@napgram/message-kit'
import type { ForwardMap } from '../../shared-types.js'
import type { Instance } from '../../shared-types.js'
import type { IQQClient } from '../../shared-types.js'
import type { Telegram } from '../../shared-types.js'
import type { Command } from './types.js'
import { md } from '@mtcute/markdown-parser'
import { messageConverter } from '@napgram/message-kit'
import { getEventPublisher, getLogger } from '../../shared-types.js'
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
import { PermissionChecker } from './services/PermissionChecker.js'
import { ThreadIdExtractor } from './services/ThreadIdExtractor.js'

const logger = getLogger('CommandsFeature')

/**
 * 命令类型
 */
export type CommandHandler = (msg: UnifiedMessage, args: string[]) => Promise<void>
export type { Command }

/**
 * 命令处理功能
 * Phase 3: 统一的命令处理系统
 */
export class CommandsFeature {
  private readonly registry: CommandRegistry
  private readonly permissionChecker: PermissionChecker
  private readonly stateManager: InteractiveStateManager
  private readonly commandContext: CommandContext
  private permissionPlugin: any | null = null

  // Command handlers
  private readonly helpHandler: HelpCommandHandler
  private readonly statusHandler: StatusCommandHandler
  private readonly bindHandler: BindCommandHandler
  private readonly unbindHandler: UnbindCommandHandler
  private readonly recallHandler: RecallCommandHandler
  private readonly forwardControlHandler: ForwardControlCommandHandler
  private readonly infoHandler: InfoCommandHandler

  constructor(
    private readonly instance: Instance,
    private readonly tgBot: Telegram,
    private readonly qqClient: IQQClient,
  ) {
    this.registry = new CommandRegistry()
    this.permissionChecker = new PermissionChecker(instance)
    this.stateManager = new InteractiveStateManager()

    // Create command context
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

    // Initialize handlers
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

    // 尝试获取权限插件（延迟加载，避免循环依赖）
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
      // Ignore errors
    })
    logger.info('CommandsFeature commands reloaded')
  }

  /**
   * 初始化权限插件（延迟加载，避免循环依赖）
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

      // 查找权限管理插件
      const permPlugin = loadedPlugins.find((p: any) => p.id === 'permission-management')
      const resolveExports = (entry: any) => {
        if (!entry) return null
        if (entry.context?.exports) return entry.context.exports
        if (entry.plugin?.exports) return entry.plugin.exports
        if (entry.context?.permissionService) {
          return { permissionService: entry.context.permissionService }
        }
        return null
      }

      let permissionExports = resolveExports(permPlugin)

      if (!permissionExports && typeof (runtime as any).getPlugin === 'function') {
        permissionExports = resolveExports((runtime as any).getPlugin('permission-management'))
      }

      if (permissionExports?.permissionService) {
        this.permissionPlugin = permissionExports
        logger.info('✓ Permission plugin integrated')
      }
    } catch (error) {
      // 插件系统不可用，使用降级模式
      logger.debug('Plugin system not available, using fallback permission checker')
    }
  }

  /**
   * 检查用户是否有执行命令的权限
   */
  private async checkPermission(userId: string, command: Command): Promise<{ allowed: boolean, reason?: string }> {
    // 1. 如果权限插件可用，使用新的权限系统
    if (this.permissionPlugin?.permissionService) {
      // 确定所需权限等级
      const requiredLevel = command.permission?.level ?? (command.adminOnly ? 1 : 3)
      const requireOwner = command.permission?.requireOwner ?? false

      try {
        return await this.permissionPlugin.permissionService.checkCommandPermission(
          userId,
          command.name,
          requiredLevel,
          requireOwner,
          this.instance.id
        )
      } catch (error) {
        logger.warn('Permission check failed, falling back to PermissionChecker:', error)
      }
    }

    // 2. 降级：使用旧的 PermissionChecker
    const fallbackLevel = command.permission?.level
    if (command.adminOnly || (fallbackLevel !== undefined && fallbackLevel <= 1)) {
      const isAdmin = this.permissionChecker.isAdmin(userId)
      return {
        allowed: isAdmin,
        reason: isAdmin ? undefined : '此命令仅限管理员使用'
      }
    }

    // 3. 默认：允许执行
    return { allowed: true }
  }

  /**
   * 记录审计日志（如果权限插件可用）
   */
  private async logAudit(event: {
    eventType: string
    userId: string
    commandName: string
    reason?: string
  }): Promise<void> {
    if (this.permissionPlugin?.permissionService) {
      try {
        await this.permissionPlugin.permissionService.logAudit({
          eventType: event.eventType,
          operatorId: event.userId,
          commandName: event.commandName,
          instanceId: this.instance.id,
          details: event.reason ? { reason: event.reason } : {}
        })
      } catch (error) {
        logger.debug('Failed to log audit:', error)
      }
    }
  }

  /**
   * 注册默认命令
   */
  private async registerDefaultCommands() {
    // === 从插件系统加载命令（双轨并行策略） ===
    await this.loadPluginCommands()

    // TODO: 旧版 constants/commands.ts 中有更细分的指令清单（preSetup/group/private 等），后续可按需合并：
    // setup/login/flags/alive/add/addfriend/addgroup/refresh_all/newinstance/info/q/rm/rmt/rmq/forwardoff/forwardon/disable_qq_forward/enable_qq_forward/disable_tg_forward/enable_tg_forward/refresh/poke/nick/mute 等。

    // 帮助命令
    this.registerCommand({
      name: 'help',
      aliases: ['h', '帮助'],
      description: '显示帮助信息',
      permission: { level: 3 }, // USER
      handler: (msg, args) => this.helpHandler.execute(msg, args),
    })

    // 状态命令
    this.registerCommand({
      name: 'status',
      aliases: ['状态'],
      description: '显示机器人状态',
      permission: { level: 3 }, // USER
      handler: (msg, args) => this.statusHandler.execute(msg, args),
    })

    // 绑定命令
    this.registerCommand({
      name: 'bind',
      aliases: ['绑定'],
      description: '绑定指定 QQ 群到当前 TG 聊天',
      usage: '/bind <qq_group_id> [thread_id]',
      permission: { level: 1 }, // ADMIN
      handler: (msg, args) => this.bindHandler.execute(msg, args),
      adminOnly: true, // 保持向后兼容
    })

    // 解绑命令
    this.registerCommand({
      name: 'unbind',
      aliases: ['解绑'],
      description: '解除当前 TG 聊天的绑定',
      usage: '/unbind',
      permission: { level: 1 }, // ADMIN
      handler: (msg, args) => this.unbindHandler.execute(msg, args),
      adminOnly: true, // 保持向后兼容
    })

    // 撤回命令
    this.registerCommand({
      name: 'rm',
      aliases: ['撤回', 'recall'],
      description: '撤回消息',
      usage: '/rm [count]',
      permission: { level: 2 }, // MODERATOR
      handler: (msg, args) => this.recallHandler.execute(msg, args),
    })

    // 转发控制命令
    this.registerCommand({
      name: 'forwardoff',
      description: '暂停双向转发',
      permission: { level: 1 }, // ADMIN
      handler: (msg, args) => this.forwardControlHandler.execute(msg, args, 'forwardoff'),
      adminOnly: true, // 保持向后兼容
    })

    this.registerCommand({
      name: 'forwardon',
      description: '恢复双向转发',
      permission: { level: 1 }, // ADMIN
      handler: (msg, args) => this.forwardControlHandler.execute(msg, args, 'forwardon'),
      adminOnly: true, // 保持向后兼容
    })

    this.registerCommand({
      name: 'disable_qq_forward',
      description: '停止 QQ → TG 的转发',
      permission: { level: 1 }, // ADMIN
      handler: (msg, args) => this.forwardControlHandler.execute(msg, args, 'disable_qq_forward'),
      adminOnly: true, // 保持向后兼容
    })

    this.registerCommand({
      name: 'enable_qq_forward',
      description: '恢复 QQ → TG 的转发',
      permission: { level: 1 }, // ADMIN
      handler: (msg, args) => this.forwardControlHandler.execute(msg, args, 'enable_qq_forward'),
      adminOnly: true, // 保持向后兼容
    })

    this.registerCommand({
      name: 'disable_tg_forward',
      description: '停止 TG → QQ 的转发',
      permission: { level: 1 }, // ADMIN
      handler: (msg, args) => this.forwardControlHandler.execute(msg, args, 'disable_tg_forward'),
      adminOnly: true, // 保持向后兼容
    })

    this.registerCommand({
      name: 'enable_tg_forward',
      description: '恢复 TG → QQ 的转发',
      permission: { level: 1 }, // ADMIN
      handler: (msg, args) => this.forwardControlHandler.execute(msg, args, 'enable_tg_forward'),
      adminOnly: true, // 保持向后兼容
    })

    // Info 命令
    this.registerCommand({
      name: 'info',
      aliases: ['信息'],
      description: '查看本群或选定消息的详情',
      permission: { level: 2 }, // MODERATOR
      handler: (msg, args) => this.infoHandler.execute(msg, args),
      adminOnly: true, // 保持向后兼容
    })

    // 群组管理命令由 plugin-group-management 提供

    // ============ Phase 3: QQ交互增强 ============
    // Note: QQ 交互命令现在完全由 plugin-qq-interaction 提供
    // 它们只会在插件启用时可用

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
          const context = (pluginInfo as any).context

          if (!context || typeof context.getCommands !== 'function') {
            continue
          }

          const commands = context.getCommands()
          logger.debug(`Plugin ${pluginInfo.id}: found ${commands.size} command(s)`)

          for (const [, config] of commands) {
            // 将插件命令注册到 CommandsFeature
            this.registerCommand({
              name: config.name,
              aliases: config.aliases,
              description: config.description,
              usage: config.usage,
              permission: (config as any).permission,
              adminOnly: config.adminOnly,
              handler: async (msg, args) => {
                // 将 UnifiedMessage 转换为 MessageEvent
                const event = this.convertToMessageEvent(msg, (context as any).logger)
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

  /**
   * 将 UnifiedMessage 转换为 MessageEvent（用于插件命令处理）
   */
  private convertToMessageEvent(msg: UnifiedMessage, pluginLogger?: any) {
    // 捕获 commandContext 供闭包使用
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
      // 便捷方法（使用 CommandContext 的方法）
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
        // send 与 reply 相同（暂时没有独立的 send API）
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
        // recall 功能暂不实现
        throw new Error('recall() not yet implemented')
      },
      // API 访问
      qq: this.qqClient,
      tg: this.tgBot,
      instance: this.instance,
    }
  }

  private isForwardSegment(seg: any): seg is { type: 'forward'; data: { messages: any[] } } {
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
    if (typeof content === 'string') {
      await this.commandContext.replyQQ(chatId, content)
      return
    }

    if (!Array.isArray(content) || content.length === 0) {
      await this.commandContext.replyQQ(chatId, '')
      return
    }

    const forwardSegments = content.filter(seg => this.isForwardSegment(seg))
    const normalSegments = content.filter(seg => !this.isForwardSegment(seg))

    if (normalSegments.length) {
      const text = segmentsToText(normalSegments)
      if (text)
        await this.commandContext.replyQQ(chatId, text)
    }

    if (!forwardSegments.length)
      return

    if (msg.chat.type !== 'group') {
      const fallbackText = segmentsToText(content)
      if (fallbackText)
        await this.commandContext.replyQQ(chatId, fallbackText)
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

        // 尝试解析 QQ 群号
        if (/^-?\d+$/.test(text.trim())) {
          const qqGroupId = text.trim()
          const threadId = bindingState.threadId

          // 执行绑定逻辑
          const forwardMap = this.instance.forwardPairs as ForwardMap

          // 检查冲突
          const tgOccupied = forwardMap.findByTG(chatId, threadId, false)
          if (tgOccupied && tgOccupied.qqRoomId.toString() !== qqGroupId) {
            await this.replyTG(chatId, `绑定失败：该 TG 话题已绑定到其他 QQ 群 (${tgOccupied.qqRoomId})`, threadId)
            this.stateManager.deleteBindingState(String(chatId), String(senderId))
            return true
          }

          try {
            const rec = await forwardMap.add(qqGroupId, chatId, threadId)
            if (rec && rec.qqRoomId.toString() !== qqGroupId) {
              await this.replyTG(chatId, '绑定失败：检测到冲突，请检查现有绑定', threadId)
            }
            else {
              const threadInfo = threadId ? ` (话题 ${threadId})` : ''
              await this.replyTG(chatId, `绑定成功：QQ ${qqGroupId} <-> TG ${chatId}${threadId ? ` (话题 ${threadId})` : ''}`, threadId)
              logger.info(`Interactive Bind: QQ ${qqGroupId} <-> TG ${chatId}${threadInfo}`)
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

      // Scenario 1: /cmd@bot
      if (commandName.includes('@')) {
        const [cmd, targetBot] = commandName.split('@')

        // 如果指定了 bot 但不是我，则忽略该命令
        if (targetBot && myUsername && targetBot.toLowerCase() !== myUsername) {
          logger.debug(`Ignored command for other bot (suffix): ${targetBot}`)
          return false
        }
        commandName = cmd
      }
      // Scenario 2: /cmd ... @bot (check ALL arguments for @mentions)
      else {
        // Find any @mention in the arguments (skip parts[0] which is the command)
        const botMentionIndex = parts.findIndex((part, idx) => idx > 0 && part.startsWith('@'))

        if (botMentionIndex > 0) {
          const targetBot = parts[botMentionIndex].slice(1)

          if (myUsername && targetBot.toLowerCase() !== myUsername) {
            // Addressed to another bot, ignore this command
            logger.debug(`Ignored command for other bot at position ${botMentionIndex}: ${targetBot}`)
            return false
          }
          else if (myUsername && targetBot.toLowerCase() === myUsername) {
            // Addressed to me explicitly, remove the @mention from args
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
          reason: permissionCheck.reason
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
            const chat = await this.tgBot.getChat(Number(tgMsg.chat.id))
            const textContent = contentToText(content)
            const params: any = { replyTo: Number(tgMsg.id) }
            const sent = await chat.sendMessage(textContent, params)
            return { messageId: `tg:${String(tgMsg.chat.id)}:${String((sent as any)?.id ?? '')}`, timestamp: Date.now() }
          },
          send: async (content) => {
            const chat = await this.tgBot.getChat(Number(tgMsg.chat.id))
            const textContent = contentToText(content)
            const params: any = {}
            if (threadId)
              params.replyTo = Number(threadId)
            const sent = await chat.sendMessage(textContent, params)
            return { messageId: `tg:${String(tgMsg.chat.id)}:${String((sent as any)?.id ?? '')}`, timestamp: Date.now() }
          },
          recall: async () => {
            const chat = await this.tgBot.getChat(Number(tgMsg.chat.id))
            await chat.deleteMessages([Number(tgMsg.id)])
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
          reason: permissionCheck.reason
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
      const normalizedChatId
        = typeof chatId === 'bigint'
          ? Number(chatId)
          : (typeof chatId === 'string' && /^-?\d+$/.test(chatId))
              ? Number(chatId)
              : chatId
      const chat = await this.tgBot.getChat(normalizedChatId as any)
      const params: any = {
        linkPreview: { disable: true },
      }
      if (threadId !== undefined && threadId !== null) {
        const normalizedThreadId = Number(threadId)
        if (Number.isFinite(normalizedThreadId) && normalizedThreadId > 0) {
          params.replyTo = normalizedThreadId
        }
      }

      // 使用 parseMode: 'markdown' 并不稳定，我们直接使用 mtcute 的 md 解析器
      // 能够将包含 markdown 语法的动态字符串解析为 InputText
      let msgContent = text
      if (typeof text === 'string') {
        const parts: any = [text]
        parts.raw = [text]
        msgContent = md(parts as TemplateStringsArray)
      }

      await chat.sendMessage(msgContent, params)
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
