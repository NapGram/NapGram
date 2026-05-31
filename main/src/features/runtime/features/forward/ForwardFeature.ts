import type { Message } from '@mtcute/core'
import type { MessageContent, UnifiedMessage } from '@napgram/message-kit'
import type { ForwardMap, ForwardPairRecord, Instance, IQQClient, MessageSegment, Telegram } from '../../shared-types.js'
import type { CommandsFeature } from '../commands/CommandsFeature.js'
import type { MediaFeature } from '../MediaFeature.js'
import process from 'node:process'
import { messageConverter } from '@napgram/message-kit'
import { telegramSend } from '../../../../shared/utils/index.js'
import { and, db, env, eq, getEventPublisher, getLogger, performanceMonitor, schema } from '../../shared-types.js'
import { hasQ2tgSkipMarker } from '../../utils/QqLoopbackMarker.js'
import { hasConfiguredWorkMode } from '../../work-mode-gate.js'
import { ThreadIdExtractor } from '../commands/services/ThreadIdExtractor.js'
import { findPairByQQWithChatType, findPairByTGWithChatType } from '../commands/utils/ForwardPairChatType.js'
import { MediaGroupHandler } from './handlers/MediaGroupHandler.js'
import { TelegramMessageHandler } from './handlers/TelegramMessageHandler.js'
import { ForwardMediaPreparer } from './senders/MediaPreparer.js'
import { TelegramSender } from './senders/TelegramSender.js'
import { ForwardMapper } from './services/MessageMapper.js'
import { PersonalPairProvisioner } from './services/PersonalPairProvisioner.js'
import { PersonalSyncService } from './services/PersonalSyncService.js'
import { ReplyResolver } from './services/ReplyResolver.js'
import { MessageUtils } from './utils/MessageUtils.js'

const logger = getLogger('ForwardFeature')
const DEFAULT_TG_SEND_INTERVAL_MS = 350
const FLOOD_WAIT_BUFFER_MS = 2000

interface TelegramSendQueueState {
  chain: Promise<void>
  nextAvailableAt: number
}

/**
 * 基于新架构的简化转发实现（NapCat <-> Telegram）。
 */
export class ForwardFeature {
  private forwardMap: ForwardMap
  private telegramSender: TelegramSender
  private mapper: ForwardMapper
  private replyResolver: ReplyResolver
  private mediaGroupHandler: MediaGroupHandler
  private tgMessageHandler: TelegramMessageHandler
  private mediaPreparer: ForwardMediaPreparer
  private personalPairProvisioner: PersonalPairProvisioner
  private personalSyncService: PersonalSyncService
  private processedMsgIds = new Set<string>()
  private telegramSendQueue: TelegramSendQueueState = {
    chain: Promise.resolve(),
    nextAvailableAt: 0,
  }

  private handleTgMessage = async (tgMsg: Message) => {
    await this.processTelegramMessage(tgMsg, false)
  }

  private handleTgEditedMessage = async (tgMsg: Message) => {
    await this.processTelegramMessage(tgMsg, true)
  }

  private async processTelegramMessage(tgMsg: Message, isEdit: boolean) {
    if (!hasConfiguredWorkMode(this.instance))
      return

    const rawText = tgMsg.text || ''
    logger.debug(isEdit ? '[Forward][TG->QQ] edited incoming' : '[Forward][TG->QQ] incoming', {
      id: tgMsg.id,
      chatId: tgMsg.chat.id,
      text: rawText.slice(0, 100),
    })

    const threadId = new ThreadIdExtractor().extractFromRaw((tgMsg as any).raw || tgMsg)

    const pair = await findPairByTGWithChatType(
      this.forwardMap,
      BigInt(tgMsg.chat.id),
      threadId,
      !threadId, // 如果有 threadId，禁用 fallback，避免落到 general
    )
    if (!pair) {
      logger.debug(`No QQ mapping for TG chat ${tgMsg.chat.id} thread ${threadId || 'none'}`)
      return
    }

    logger.debug('[Forward][TG->QQ] resolved', {
      tgMsgId: tgMsg.id,
      tgChatId: tgMsg.chat.id,
      threadId,
      qqRoomId: pair.qqRoomId,
    })

    let unified: UnifiedMessage | undefined
    try {
      unified = messageConverter.fromTelegram(tgMsg as any)
    }
    catch (e) {
      logger.debug(e, '[Forward] Failed to convert TG message')
    }
    if (isEdit && unified)
      unified.metadata = { ...(unified.metadata || {}), isEdited: true }

    await this.publishTgPluginEvent(tgMsg, pair, unified, threadId ? Number(threadId) : undefined)

    // Publish gateway event (doesn't affect forwarding)
    try {
      const gatewayMessage = unified ?? messageConverter.fromTelegram(tgMsg as any)
      await getEventPublisher().publishMessageCreated(this.instance.id, gatewayMessage as any, pair)
    }
    catch (e) {
      logger.debug(e, '[Gateway] publishMessageCreated (TG) failed')
    }

    if (isEdit && this.isRecallCommandText(rawText)) {
      await this.handleEditedRecallCommand(tgMsg, pair)
      return
    }

    if (rawText.trim().startsWith('/')) {
      logger.debug({ text: rawText }, '[Forward] Skipping command message')
      return
    }

    // Check forward mode (TG -> QQ is index 1)
    const forwardMode = this.getForwardMode(pair)
    if (forwardMode[1] === '0') {
      logger.debug(`Forward TG->QQ disabled for chat ${tgMsg.chat.id} (mode: ${forwardMode})`)
      return
    }

    if (isEdit) {
      await this.recallMappedQQMessage(tgMsg, pair)
    }

    await this.tgMessageHandler.handleTGMessage(tgMsg, pair, unified)
  }

  constructor(
    private readonly instance: Instance,
    private readonly tgBot: Telegram,
    private readonly qqClient: IQQClient,
    private readonly media?: MediaFeature,
    private readonly commands?: CommandsFeature,
  ) {
    const pairs = instance.forwardPairs
    const isForwardMap = pairs && typeof (pairs as any).findByQQ === 'function' && typeof (pairs as any).findByTG === 'function'
    if (!isForwardMap) {
      throw new Error('Forward map is not initialized for NapCat pipeline.')
    }
    this.forwardMap = pairs as ForwardMap
    this.telegramSender = new TelegramSender(instance, media)
    this.mapper = new ForwardMapper()
    this.replyResolver = new ReplyResolver(this.mapper)
    this.personalPairProvisioner = new PersonalPairProvisioner(instance, this.forwardMap, this.qqClient)
    this.personalSyncService = new PersonalSyncService(instance, this.forwardMap, this.qqClient)
    this.personalSyncService.start()
    this.mediaPreparer = new ForwardMediaPreparer(instance, media)
    this.mediaGroupHandler = new MediaGroupHandler(
      this.qqClient,
      msg => this.mediaPreparer.prepareMediaForQQ(msg),
      pair => this.getNicknameMode(pair),
    )
    this.tgMessageHandler = new TelegramMessageHandler(
      this.qqClient,
      this.mediaGroupHandler,
      this.replyResolver,
      msg => this.mediaPreparer.prepareMediaForQQ(msg),
      this.renderContent.bind(this),
      pair => this.getNicknameMode(pair),
    )
    this.setupListeners()
    logger.info('ForwardFeature ✓ 初始化完成')

    // Register commands
    if (this.commands) {
      this.commands.registerCommand({
        name: 'mode',
        aliases: ['模式'],
        description: '控制昵称显示和转发开关 (QQ->TG/TG->QQ)',
        usage: '/mode <nickname|forward> <00|01|10|11>',
        handler: this.handleModeCommand,
        adminOnly: true,
      })
    }
  }

  private sleep(ms: number): Promise<void> {
    if (ms <= 0)
      return Promise.resolve()
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  private getMinSendIntervalMs(): number {
    if (process.env.NODE_ENV === 'test')
      return 0
    return DEFAULT_TG_SEND_INTERVAL_MS
  }

  private extractFloodWaitSeconds(error: unknown): number | null {
    const message = String((error as any)?.message || error || '')
    const directMatch = message.match(/FLOOD_WAIT[_\s]?(\d+)/i)
    if (directMatch?.[1])
      return Number(directMatch[1])

    const waitMatch = message.match(/A wait of (\d+) seconds/i)
    if (waitMatch?.[1])
      return Number(waitMatch[1])

    return null
  }

  private async executeTelegramSendWithRetry<T>(task: () => Promise<T>): Promise<T> {
    const maxAttempts = 3
    let attempt = 0

    while (true) {
      attempt += 1
      try {
        return await task()
      }
      catch (error) {
        const floodWaitSeconds = this.extractFloodWaitSeconds(error)
        if (!floodWaitSeconds || attempt >= maxAttempts) {
          throw error
        }

        const waitMs = (floodWaitSeconds * 1000) + FLOOD_WAIT_BUFFER_MS
        logger.warn(`[Forward][QQ->TG] FLOOD_WAIT ${floodWaitSeconds}s, pausing queue for ${waitMs}ms (attempt ${attempt}/${maxAttempts})`)
        await this.sleep(waitMs)
      }
    }
  }

  private enqueueTelegramSend<T>(task: () => Promise<T>): Promise<T> {
    const queue = this.telegramSendQueue

    const run = async (): Promise<T> => {
      const now = Date.now()
      const waitMs = queue.nextAvailableAt - now
      if (waitMs > 0)
        await this.sleep(waitMs)

      const result = await this.executeTelegramSendWithRetry(task)

      const minIntervalMs = this.getMinSendIntervalMs()
      queue.nextAvailableAt = Date.now() + minIntervalMs
      return result
    }

    const current = queue.chain.then(run, run)
    queue.chain = current.then(() => undefined, () => undefined)
    return current
  }

  private setupListeners() {
    this.qqClient.on('message', this.handleQQMessage)
    this.qqClient.on('poke', this.handlePokeEvent)
    this.qqClient.on('friend.increase', this.handleFriendIncrease)
    this.qqClient.on('friend.decrease', this.handleFriendDecrease)
    this.qqClient.on('group.increase', this.handleGroupIncrease)
    this.qqClient.on('group.decrease', this.handleGroupDecrease)
    this.qqClient.on('input.status', this.handleInputStatus)
    this.tgBot.addNewMessageEventHandler(this.handleTgMessage)
    this.tgBot.addEditedMessageEventHandler?.(this.handleTgEditedMessage)
    logger.debug('[ForwardFeature] listeners attached')
  }

  /**
   * 获取指定 pair 的转发模式配置
   * 优先使用 pair 的配置，若为 null 则使用环境变量默认值
   */
  private getForwardMode(pair: ForwardPairRecord): string {
    return pair.forwardMode || env.FORWARD_MODE
  }

  /**
   * 获取指定 pair 的昵称模式配置
   * 优先使用 pair 的配置，若为 null 则使用环境变量默认值
   */
  private getNicknameMode(pair: ForwardPairRecord): string {
    if (!pair.nicknameMode && (this.instance as any).workMode === 'personal')
      return '10'
    return pair.nicknameMode || env.SHOW_NICKNAME_MODE
  }

  private isPersonalMode(): boolean {
    return (this.instance as any).workMode === 'personal'
      || (this.instance as any).getPersonalModeDiagnostics?.().workMode === 'personal'
  }

  private getProcessedQQMessageKey(msg: UnifiedMessage): string {
    const chatType = msg.chat?.type || 'unknown'
    const chatId = msg.chat?.id ?? 'unknown'
    return [
      this.instance.id,
      msg.platform || 'qq',
      chatType,
      chatId,
      msg.id,
    ].map(value => String(value)).join(':')
  }

  private isRecallCommandText(text: string): boolean {
    const command = text.trim().split(/\s+/)[0]?.split('@')[0]?.toLowerCase()
    return command === '/rm'
  }

  private async deleteTelegramMessageQuietly(tgMsg: Message) {
    try {
      const chat = await this.tgBot.getChat(telegramSend.normalizeTelegramChatId(tgMsg.chat.id) as any)
      const messageId = telegramSend.normalizeTelegramMessageId(tgMsg.id)
      if (!messageId)
        return
      await chat.deleteMessages([messageId])
    }
    catch (error) {
      logger.debug(error, `[Forward][TG->QQ] failed to delete edited /rm command ${tgMsg.id}`)
    }
  }

  private async handleEditedRecallCommand(tgMsg: Message, pair: ForwardPairRecord) {
    await this.recallMappedQQMessage(tgMsg, pair)
    await this.deleteTelegramMessageQuietly(tgMsg)
    logger.info(`[Forward][TG->QQ] handled edited /rm command for TG message ${tgMsg.id}`)
  }

  private async recallMappedQQMessage(tgMsg: Message, pair: ForwardPairRecord) {
    const source = await this.mapper.findQqSource(
      pair.instanceId,
      BigInt(pair.tgChatId),
      BigInt(tgMsg.id),
    )
    if (!source?.seq) {
      logger.debug(`[Forward][TG->QQ] edited message ${tgMsg.id} has no QQ mapping to recall`)
      return
    }

    try {
      await this.qqClient.recallMessage(String(source.seq))
      await db.update(schema.message)
        .set({ ignoreDelete: true })
        .where(and(
          eq(schema.message.instanceId, pair.instanceId),
          eq(schema.message.tgChatId, BigInt(pair.tgChatId)),
          eq(schema.message.tgMsgId, BigInt(tgMsg.id)),
        ))
      logger.info(`[Forward][TG->QQ] recalled old QQ message ${source.seq} before reposting edited TG ${tgMsg.id}`)
    }
    catch (error) {
      logger.warn(error, `[Forward][TG->QQ] failed to recall old QQ message ${source.seq} before edit repost`)
    }
  }

  async sendPluginMessageToTelegram(
    chat: any,
    msg: UnifiedMessage,
    options: { threadId?: number, replyToMsgId?: number } = {},
  ) {
    const pair = {
      id: 0,
      apiKey: '',
      flags: (this.instance as any).flags ?? 0,
      tgThreadId: options.threadId,
    }
    return await this.telegramSender.sendToTelegram(chat, msg, pair, options.replyToMsgId, '00')
  }

  private toPluginSegments(contents: MessageContent[], platform: 'qq' | 'tg'): MessageSegment[] {
    const out: MessageSegment[] = []
    for (const c of contents || []) {
      if (!c)
        continue
      switch (c.type) {
        case 'text':
          out.push({ type: 'text', data: { text: String((c.data as any)?.text ?? '') } })
          break
        case 'at':
          out.push({
            type: 'at',
            data: {
              userId: String((c.data as any)?.userId ?? ''),
              userName: (c.data as any)?.userName ? String((c.data as any).userName) : undefined,
            },
          })
          break
        case 'reply':
          out.push({ type: 'reply', data: { messageId: String((c.data as any)?.messageId ?? '') } })
          break
        case 'image': {
          const data = c.data as any
          out.push({
            type: 'image',
            data: { url: typeof data?.url === 'string' ? data.url : undefined, file: typeof data?.file === 'string' ? data.file : undefined },
          })
          break
        }
        case 'video': {
          const data = c.data as any
          out.push({
            type: 'video',
            data: { url: typeof data?.url === 'string' ? data.url : undefined, file: typeof data?.file === 'string' ? data.file : undefined },
          })
          break
        }
        case 'audio': {
          const data = c.data as any
          out.push({
            type: 'audio',
            data: { url: typeof data?.url === 'string' ? data.url : undefined, file: typeof data?.file === 'string' ? data.file : undefined },
          })
          break
        }
        case 'file': {
          const data = c.data as any
          out.push({
            type: 'file',
            data: {
              url: typeof data?.url === 'string' ? data.url : undefined,
              file: typeof data?.file === 'string' ? data.file : undefined,
              name: data?.filename ? String(data.filename) : undefined,
            },
          })
          break
        }
        case 'forward': {
          const msgs = Array.isArray((c.data as any)?.messages) ? (c.data as any).messages : []
          out.push({
            type: 'forward',
            data: {
              messages: msgs.map((m: UnifiedMessage) => ({
                userId: String(m?.sender?.id ?? ''),
                userName: String(m?.sender?.name ?? ''),
                segments: this.toPluginSegments(m?.content || [], platform),
              })),
            },
          })
          break
        }
        default:
          out.push({ type: 'raw', data: { platform, content: c } })
          break
      }
    }
    return out
  }

  private contentToText(content: string | any[]): string {
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

  private async publishTgPluginEvent(
    tgMsg: Message,
    pair: ForwardPairRecord,
    unified: UnifiedMessage | undefined,
    threadId?: number,
  ) {
    try {
      const eventPublisher = getEventPublisher()
      const message = unified ?? messageConverter.fromTelegram(tgMsg as any)
      const segments = this.toPluginSegments(message.content as any, 'tg')
      const text = this.contentToText(segments)
      const timestamp = tgMsg.date ? (typeof tgMsg.date === 'number' ? tgMsg.date : tgMsg.date.getTime()) : Date.now()

      eventPublisher.publishMessage({
        eventId: `tg:${tgMsg.id}`,
        instanceId: pair.instanceId,
        platform: 'tg',
        channelId: String(tgMsg.chat.id),
        channelType: 'group',
        threadId: threadId ? Number(threadId) : undefined,
        sender: {
          userId: `tg:u:${tgMsg.sender?.id || 0}`,
          userName: tgMsg.sender?.displayName || tgMsg.sender?.username || 'Unknown',
        },
        message: {
          id: String(tgMsg.id),
          text,
          segments,
          timestamp,
        },
        raw: tgMsg,
        reply: async (content) => {
          const chat = await this.tgBot.getChat(telegramSend.normalizeTelegramChatId(tgMsg.chat.id) as any)
          const replyText = this.contentToText(content)
          const params: any = {}
          const replyTo = telegramSend.normalizeTelegramMessageId(tgMsg.id)
          if (replyTo)
            params.replyTo = replyTo
          const sent = await chat.sendMessage(replyText, params)
          return { messageId: `tg:${String(tgMsg.chat.id)}:${String((sent as any)?.id ?? '')}`, timestamp: Date.now() }
        },
        send: async (content) => {
          const chat = await this.tgBot.getChat(telegramSend.normalizeTelegramChatId(tgMsg.chat.id) as any)
          const sendText = this.contentToText(content)
          const params: any = {}
          const replyTo = telegramSend.normalizeTelegramMessageId(threadId)
          if (replyTo)
            params.replyTo = replyTo
          const sent = await chat.sendMessage(sendText, params)
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
    catch (e) {
      logger.debug(e, '[Plugin] publishMessage (TG) failed')
    }
  }

  private handleQQMessage = async (msg: UnifiedMessage) => {
    if (!hasConfiguredWorkMode(this.instance))
      return

    if (hasQ2tgSkipMarker(msg)) {
      logger.debug(`[Forward] Ignored q2tgSkip QQ loopback message: ${msg.id}`)
      return
    }

    const startTime = Date.now() // 📊 开始计时
    const text = (msg.content || [])
      .filter(c => c.type === 'text')
      .map(c => (c.data as any).text || '')
      .join('')
      .trim()

    if (this.isSelfQQMessage(msg)) {
      logger.debug(`[Forward] Ignored self QQ message: ${msg.id}`)
      return
    }

    // Deduplication check
    const processedMsgKey = this.getProcessedQQMessageKey(msg)
    if (this.processedMsgIds.has(processedMsgKey)) {
      logger.info(`[Forward] Duplicate QQ message ignored: ${msg.id}`)
      return
    }
    this.processedMsgIds.add(processedMsgKey)
    // Clear cache after 30 seconds
    setTimeout(() => {
      this.processedMsgIds.delete(processedMsgKey)
    }, 30 * 1000)

    const isCommand = text.startsWith('/')

    try {
      // Publish plugin event (doesn't affect forwarding)
      try {
        const eventPublisher = getEventPublisher()

        const channelType
          = msg.chat.type === 'private'
            ? 'private'
            : msg.chat.type === 'group'
              ? 'group'
              : 'group'

        const segments = this.toPluginSegments(msg.content as any, 'qq')

        eventPublisher.publishMessage({
          eventId: `qq:${msg.id}`,
          instanceId: this.instance.id,
          platform: 'qq',
          channelId: String(msg.chat.id),
          channelType,
          sender: {
            userId: `qq:u:${msg.sender?.id || ''}`,
            userName: msg.sender?.name || 'Unknown',
          },
          message: {
            id: String(msg.id),
            text,
            segments,
            timestamp: msg.timestamp || Date.now(),
          },
          raw: msg,
          reply: async (content) => {
            const text = this.contentToText(content)
            const receipt = await this.qqClient.sendMessage(String(msg.chat.id), {
              id: `plugin-reply-${Date.now()}`,
              platform: 'qq',
              sender: { id: String(this.qqClient.uin), name: this.qqClient.nickname, isBot: true },
              chat: { id: String(msg.chat.id), type: msg.chat.type },
              content: [
                { type: 'reply', data: { messageId: String(msg.id), senderId: '', senderName: '' } },
                { type: 'text', data: { text } },
              ],
              timestamp: Date.now(),
            } as any)
            return { messageId: `qq:${String(receipt.messageId)}`, timestamp: Date.now() }
          },
          send: async (content) => {
            const text = this.contentToText(content)
            const receipt = await this.qqClient.sendMessage(String(msg.chat.id), {
              id: `plugin-send-${Date.now()}`,
              platform: 'qq',
              sender: { id: String(this.qqClient.uin), name: this.qqClient.nickname, isBot: true },
              chat: { id: String(msg.chat.id), type: msg.chat.type },
              content: [{ type: 'text', data: { text } }],
              timestamp: Date.now(),
            } as any)
            return { messageId: `qq:${String(receipt.messageId)}`, timestamp: Date.now() }
          },
          recall: async () => {
            await this.qqClient.recallMessage(String(msg.id))
          },
        })
      }
      catch (e) {
        logger.debug(e, '[Plugin] publishMessage (QQ) failed')
      }

      if (isCommand) {
        logger.debug({ text }, '[Forward] Skipping command message')
        return
      }

      const qqChatType = msg.chat.type === 'private' ? 'private' : 'group'
      let pair = await findPairByQQWithChatType(this.forwardMap, this.instance.id, msg.chat.id, qqChatType)
      if (!pair && this.isPersonalMode())
        pair = await this.personalPairProvisioner.ensurePairForQQMessage(msg, qqChatType)
      if (!pair) {
        logger.debug(`No TG mapping for QQ chat ${msg.chat.id}`)
        return
      }

      // Publish gateway event (doesn't affect forwarding)
      try {
        await getEventPublisher().publishMessageCreated(this.instance.id, msg as any, pair)
      }
      catch (e) {
        logger.debug(e, '[Gateway] publishMessageCreated (QQ) failed')
      }

      // Check forward mode (QQ -> TG is index 0)
      const forwardMode = this.getForwardMode(pair)
      if (forwardMode[0] === '0') {
        logger.debug(`Forward QQ->TG disabled for chat ${msg.chat.id} (mode: ${forwardMode})`)
        return
      }

      logger.info('[Forward][QQ->TG] incoming', {
        qqMsgId: msg.id,
        qqRoomId: msg.chat.id,
        tgChatId: pair.tgChatId,
      })

      // Sender Blocklist Filter
      if (pair.ignoreSenders) {
        const senders = pair.ignoreSenders.split(',').map((s: string) => s.trim())
        // Check if current sender is in the blocklist
        // Provide fallback for msg.sender.id (though it should exist)
        const senderId = String(msg.sender?.id || '')
        if (senders.includes(senderId)) {
          logger.info(`Ignored QQ message ${msg.id} from sender ${senderId} (in blocklist)`)
          return
        }
      }

      // Regex Deduplication Filter
      if (pair.ignoreRegex) {
        try {
          const regex = new RegExp(pair.ignoreRegex)
          // Extract text content for matching
          const textContent = msg.content
            .filter(c => c.type === 'text')
            .map(c => (c.data as any).text || '')
            .join('')

          if (regex.test(textContent)) {
            logger.info(`Ignored QQ message ${msg.id} matched regex: ${pair.ignoreRegex}`)
            return
          }
        }
        catch (e) {
          logger.warn(`Invalid ignoreRegex for pair ${pair.id}: ${pair.ignoreRegex}`, e)
        }
      }

      // 填充 @ 提及的展示名称：优先群名片，其次昵称，最后 QQ 号
      await MessageUtils.populateAtDisplayNames(msg, this.qqClient)

      const tgChatId = Number(pair.tgChatId)
      const chat = await this.instance.tgBot.getChat(tgChatId)

      // 处理回复 - 使用 ReplyResolver
      const replyToMsgId = await this.replyResolver.resolveQQReply(
        msg,
        pair.instanceId,
        pair.qqRoomId,
        pair.qqChatType === 'private' ? 'private' : 'group',
      )

      const sentMsg = await this.enqueueTelegramSend(() =>
        this.telegramSender.sendToTelegram(
          chat,
          msg,
          pair,
          replyToMsgId ? Number(replyToMsgId) : undefined,
          this.getNicknameMode(pair),
        ),
      )

      if (sentMsg) {
        await this.mapper.saveMessage(msg, sentMsg, pair.instanceId, pair.qqRoomId, BigInt(tgChatId))

        // 📊 记录成功 - 计算处理延迟
        const latency = Date.now() - startTime
        performanceMonitor.recordMessage(latency)

        logger.info(`[Forward][QQ->TG] message ${msg.id} -> TG ${tgChatId} (id: ${sentMsg.id}) in ${latency}ms`)
      }
    }
    catch (error) {
      // 📊 记录错误
      performanceMonitor.recordError()
      logger.error('Failed to forward QQ message:', error)
    }
  }

  private handleModeCommand = async (msg: UnifiedMessage, args: string[]) => {
    const chatId = msg.chat.id
    // Extract threadId from raw message
    const raw = (msg.metadata as any)?.raw
    const threadId = new ThreadIdExtractor().extractFromRaw(raw)

    if (!MessageUtils.isAdmin(msg.sender.id, this.instance)) {
      await MessageUtils.replyTG(this.tgBot, chatId, '您没有权限执行此命令', threadId)
      return
    }

    const type = args[0]
    const value = args[1]

    if (!type || !value || !/^[01]{2}$/.test(value)) {
      await MessageUtils.replyTG(this.tgBot, chatId, '用法：/mode <nickname|forward> <00|01|10|11>\n示例：/mode nickname 10 (QQ→TG显示昵称，TG→QQ不显示)', threadId)
      return
    }

    // 查找当前聊天对应的 pair
    const pair = this.forwardMap.findByTG(BigInt(chatId), threadId, !threadId)
    if (!pair) {
      await MessageUtils.replyTG(this.tgBot, chatId, '错误：未找到对应的转发配置', threadId)
      return
    }

    try {
      // 更新数据库
      const updateData: any = {}
      if (type === 'nickname') {
        updateData.nicknameMode = value
      }
      else if (type === 'forward') {
        updateData.forwardMode = value
      }
      else {
        await MessageUtils.replyTG(this.tgBot, chatId, '未知模式类型，请使用 nickname 或 forward', threadId)
        return
      }

      await db.update(schema.forwardPair)
        .set(updateData)
        .where(eq(schema.forwardPair.id, pair.id))

      // 同步更新内存中的 pair 对象（立即生效）
      if (type === 'nickname') {
        pair.nicknameMode = value
      }
      else {
        pair.forwardMode = value
      }

      const modeName = type === 'nickname' ? '昵称显示模式' : '转发模式'
      await MessageUtils.replyTG(this.tgBot, chatId, `${modeName}已更新为: ${value}`, threadId)
      logger.info(`Updated ${type} mode to ${value} for pair ${pair.id} (QQ: ${pair.qqRoomId}, TG: ${pair.tgChatId})`)
    }
    catch (error) {
      logger.error('Failed to update mode:', error)
      await MessageUtils.replyTG(this.tgBot, chatId, '更新失败，请查看日志', threadId)
    }
  }

  private renderContent(content: MessageContent): string {
    switch (content.type) {
      case 'text':
        // NapCat 上报的文本有时会把换行编码为字面 "\n"，这里还原为真实换行
        return (content.data.text || '').replace(/\\n/g, '\n')
      case 'image':
        return '[图片]'
      case 'video':
        return '[视频]'
      case 'audio':
        return '[语音]'
      case 'file':
        return `[文件:${content.data.filename || '文件'}]`
      case 'at':
        return `@${content.data.userName || content.data.userId}`
      case 'face':
        return content.data.text || '[表情]'
      case 'reply':
        return `(回复 ${content.data.messageId}${content.data.text ? `:${content.data.text}` : ''})`
      case 'forward':
        return `[转发消息x${content.data.messages?.length ?? 0}]`
      case 'location':
        return `[位置:${content.data.title ?? ''} ${content.data.latitude},${content.data.longitude}]`

      default:
        return `[${content.type}]`
    }
  }

  private isSelfQQMessage(msg: UnifiedMessage): boolean {
    const senderId = String(msg.sender?.id || '')
    const selfId = String(this.qqClient?.uin || '')
    return !!senderId && !!selfId && senderId === selfId
  }

  private handlePokeEvent = async (groupId: string, operatorId: string, targetId: string) => {
    try {
      if (!hasConfiguredWorkMode(this.instance))
        return

      // Find mapping for this group
      const pair = await findPairByQQWithChatType(this.forwardMap, this.instance.id, groupId, 'group')
      if (!pair)
        return

      // Check if forwarding is enabled (QQ->TG)
      const forwardMode = this.getForwardMode(pair)
      if (forwardMode[0] === '0')
        return

      const tgChatId = BigInt(pair.tgChatId)

      let msgText = ''
      if (operatorId === targetId) {
        msgText = `User ${operatorId} poked themselves`
      }
      else {
        msgText = `👉 User ${operatorId} poked ${targetId}`

        // Try to get names/cards for better display
        try {
          const opInfo = await this.qqClient.getGroupMemberInfo(groupId, operatorId)
          const targetInfo = await this.qqClient.getGroupMemberInfo(groupId, targetId)
          const opName = opInfo?.card || opInfo?.nickname || operatorId
          const targetName = targetInfo?.card || targetInfo?.nickname || targetId
          msgText = `👉 ${opName} 戳了戳 ${targetName}`
        }
        catch {
          // ignore errors fetching names
        }
      }

      await MessageUtils.replyTG(this.tgBot, tgChatId, msgText, pair.tgThreadId ?? undefined)
    }
    catch (error) {
      logger.error('Failed to handle poke event:', error)
    }
  }

  private handleFriendIncrease = async (friend: { id: string, name?: string }) => {
    try {
      if (!hasConfiguredWorkMode(this.instance))
        return

      if (!this.isPersonalMode())
        return

      const ownerId = this.instance.owner
      if (!ownerId)
        return

      const friendName = friend.name || await this.qqClient.getFriendInfo(friend.id).then(f => f?.name).catch(() => '') || '未知好友'
      const text = `👤 【个人模式】发现新 QQ 好友：\nQQ: ${friend.id}\n昵称: ${friendName}\n\n点击一键建群并绑定：\n/addfriend ${friend.id}`
      await MessageUtils.replyTG(this.tgBot, ownerId, text)
      logger.info({ friendId: friend.id, friendName }, 'Notified owner of new QQ friend')
    }
    catch (error) {
      logger.error('Failed to notify friend increase:', error)
    }
  }

  private handleGroupIncrease = async (groupId: string, member?: any) => {
    try {
      if (!hasConfiguredWorkMode(this.instance))
        return

      if (!this.isPersonalMode())
        return

      // member?.id === uin 说明是机器人自己加入了新群
      const selfUin = String(this.qqClient.uin)
      if (member?.id && String(member.id) !== selfUin) {
        return // 只是普通群成员增加，不提示建群
      }

      const ownerId = this.instance.owner
      if (!ownerId)
        return

      const groupInfo = await this.qqClient.getGroupInfo(groupId).catch(() => null)
      const groupName = groupInfo?.name || '未知群聊'
      const text = `👥 【个人模式】发现新 QQ 群：\n群号: ${groupId}\n群名: ${groupName}\n\n点击一键建群并绑定：\n/addgroup ${groupId}`
      await MessageUtils.replyTG(this.tgBot, ownerId, text)
      logger.info({ groupId, groupName }, 'Notified owner of robot joining new QQ group')
    }
    catch (error) {
      logger.error('Failed to notify group increase:', error)
    }
  }

  private async removePersonalPair(pair: ForwardPairRecord, chatType: 'private' | 'group', qqRoomId: string, notice: string) {
    if (typeof (this.forwardMap as any).remove === 'function') {
      await (this.forwardMap as any).remove({ type: chatType, id: qqRoomId })
    }
    else {
      await db.delete(schema.forwardPair).where(eq(schema.forwardPair.id, pair.id))
      await (this.forwardMap as any).reload?.()
    }

    const ownerId = this.instance.owner
    if (ownerId)
      await MessageUtils.replyTG(this.tgBot, ownerId, notice).catch(error => logger.warn(error, 'Failed to notify owner after personal pair removal'))

    await MessageUtils.replyTG(this.tgBot, BigInt(pair.tgChatId), notice, pair.tgThreadId ?? undefined)
      .catch(error => logger.warn(error, 'Failed to notify pair chat after personal pair removal'))
  }

  private handleFriendDecrease = async (uin: string) => {
    try {
      if (!hasConfiguredWorkMode(this.instance) || !this.isPersonalMode())
        return

      const pair = await findPairByQQWithChatType(this.forwardMap, this.instance.id, uin, 'private')
      if (!pair)
        return

      await this.removePersonalPair(pair, 'private', uin, `👤 【个人模式】QQ 好友 ${uin} 已删除，相关绑定已清理。`)
      logger.info({ uin, pairId: pair.id }, 'Removed personal private pair after friend decrease')
    }
    catch (error) {
      logger.error('Failed to handle friend decrease:', error)
    }
  }

  private handleGroupDecrease = async (groupId: string, uin: string) => {
    try {
      if (!hasConfiguredWorkMode(this.instance) || !this.isPersonalMode())
        return

      const selfUin = String(this.qqClient.uin)
      if (!uin || String(uin) !== selfUin)
        return

      const pair = await findPairByQQWithChatType(this.forwardMap, this.instance.id, groupId, 'group')
      if (!pair)
        return

      await this.removePersonalPair(pair, 'group', groupId, `👥 【个人模式】QQ 群 ${groupId} 已退出或机器人被移除，相关绑定已清理。`)
      logger.info({ groupId, pairId: pair.id }, 'Removed personal group pair after bot group decrease')
    }
    catch (error) {
      logger.error('Failed to handle group decrease:', error)
    }
  }

  private handleInputStatus = async (event: { chatId: string, chatType?: 'private' | 'group', typing: boolean }) => {
    try {
      if (!hasConfiguredWorkMode(this.instance))
        return

      const qqChatType = event.chatType === 'private' ? 'private' : 'group'
      const pair = await findPairByQQWithChatType(this.forwardMap, this.instance.id, event.chatId, qqChatType)
      if (!pair)
        return

      const forwardMode = this.getForwardMode(pair)
      if (forwardMode[0] === '0')
        return

      const chat = await this.tgBot.getChat(telegramSend.normalizeTelegramChatId(pair.tgChatId) as any)
      if (typeof chat.setTyping === 'function')
        await chat.setTyping(event.typing ? 'typing' : 'cancel')
    }
    catch (error) {
      logger.debug(error, '[Forward] Failed to forward QQ input status to TG')
    }
  }

  destroy() {
    this.personalSyncService?.stop()
    this.mediaGroupHandler.destroy()
    this.qqClient.removeListener('message', this.handleQQMessage)
    this.qqClient.removeListener('poke', this.handlePokeEvent)
    this.qqClient.removeListener('friend.increase', this.handleFriendIncrease)
    this.qqClient.removeListener('friend.decrease', this.handleFriendDecrease)
    this.qqClient.removeListener('group.increase', this.handleGroupIncrease)
    this.qqClient.removeListener('group.decrease', this.handleGroupDecrease)
    this.qqClient.removeListener('input.status', this.handleInputStatus)
    this.tgBot.removeNewMessageEventHandler(this.handleTgMessage)
    this.tgBot.removeEditedMessageEventHandler?.(this.handleTgEditedMessage)
    logger.info('ForwardFeature destroyed')
  }
}

export default ForwardFeature
