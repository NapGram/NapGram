import type { RecallEvent } from '@napgram/message-kit'
import type { Instance, IQQClient, Telegram } from '../shared-types.js'
import { and, db, env, eq, getLogger, schema } from '../shared-types.js'
import { hasConfiguredWorkMode } from '../work-mode-gate.js'

const logger = getLogger('RecallFeature')

function recallEventChatType(event: RecallEvent): 'private' | 'group' {
  return (event as any).chatType === 'private' ? 'private' : 'group'
}

function toBigIntValue(value: unknown): bigint | undefined {
  if (value === null || value === undefined)
    return undefined

  try {
    if (typeof value === 'bigint')
      return value
    if (typeof value === 'number' && Number.isFinite(value))
      return BigInt(value)
    if (typeof value === 'string' && value.trim())
      return BigInt(value)

    const text = (value as any)?.toString?.()
    if (typeof text === 'string' && /^-?\d+$/.test(text.trim()))
      return BigInt(text.trim())
  }
  catch {
    return undefined
  }

  return undefined
}

function normalizeTelegramDeleteUpdate(update: any): { chatId: bigint, messageIds: bigint[] } | undefined {
  const chatId = toBigIntValue(
    update?.channelId
    ?? update?.chatId
    ?? update?.peer?.channelId
    ?? update?.peer?.chatId
    ?? update?.peerId,
  )

  const rawMessageIds = update?.messageIds ?? update?.messages ?? update?.deletedIds
  if (!chatId || !Array.isArray(rawMessageIds))
    return undefined

  const messageIds = rawMessageIds
    .map(toBigIntValue)
    .filter((id): id is bigint => id !== undefined)

  if (!messageIds.length)
    return undefined

  return { chatId, messageIds }
}

/**
 * 消息撤回功能
 * Phase 3: 处理双向消息撤回
 */
export class RecallFeature {
  constructor(
    private readonly instance: Instance,
    private readonly tgBot: Telegram,
    private readonly qqClient: IQQClient,
  ) {
    this.setupListeners()
    logger.info('RecallFeature ✓ 初始化完成')
  }

  /**
   * 设置事件监听器
   */
  private setupListeners() {
    // 监听 QQ 消息撤回
    this.qqClient.on('recall', this.handleQQRecall)

    // 监听 Telegram 消息删除
    this.tgBot.addDeletedMessageEventHandler(this.handleTGDelete)
  }

  /**
   * 处理 QQ 消息撤回
   */
  private handleQQRecall = async (event: RecallEvent) => {
    try {
      if (!hasConfiguredWorkMode(this.instance))
        return

      logger.info(`QQ message recalled: ${event.messageId}`)

      // 检查是否启用自动撤回
      if (!env.ENABLE_AUTO_RECALL) {
        logger.debug('Auto recall is disabled, skipping TG message deletion')
        return
      }

      // 查找对应的 Telegram 消息
      const qqChatType = recallEventChatType(event)
      const dbEntry = await db.query.message.findFirst({
        where: and(
          eq(schema.message.instanceId, this.instance.id),
          eq(schema.message.qqRoomId, BigInt(event.chatId)),
          eq(schema.message.qqChatType, qqChatType),
          eq(schema.message.seq, Number(event.messageId)),
        ),
      })

      if (!dbEntry) {
        logger.debug(`No corresponding TG message found for QQ message: ${event.messageId}`)
        return
      }

      // 删除 Telegram 消息
      try {
        const chat = await this.tgBot.getChat(Number(dbEntry.tgChatId))
        await chat.deleteMessages([Number(dbEntry.tgMsgId)])
        logger.info(`TG message ${dbEntry.tgMsgId} deleted successfully`)
      }
      catch (error) {
        logger.error(error, 'Failed to delete TG message:')
      }

      // 更新数据库
      await db.update(schema.message)
        .set({ ignoreDelete: true })
        .where(eq(schema.message.id, dbEntry.id))
    }
    catch (error) {
      logger.error(error, 'Failed to handle QQ recall:')
    }
  }

  /**
   * 处理 Telegram 消息删除（直接删除，非 /rm 命令）
   */
  private handleTGDelete = async (update: any) => {
    try {
      if (!hasConfiguredWorkMode(this.instance))
        return

      const normalized = normalizeTelegramDeleteUpdate(update)
      if (!normalized) {
        logger.debug('Invalid delete update: chatId/messageIds are missing or invalid')
        return
      }
      const { chatId, messageIds } = normalized

      logger.info(`TG messages deleted in ${chatId}: ${messageIds.join(', ')}`)

      // 检查是否启用自动撤回
      if (!env.ENABLE_AUTO_RECALL) {
        logger.debug('Auto recall disabled, skipping QQ message recall')
        return
      }

      // 遍历所有被删除的消息
      for (const tgMsgId of messageIds) {
        try {
          // 查找对应的 QQ 消息
          const dbEntry = await db.query.message.findFirst({
            where: and(
              eq(schema.message.instanceId, this.instance.id),
              eq(schema.message.tgChatId, chatId),
              eq(schema.message.tgMsgId, tgMsgId),
            ),
          })

          if (!dbEntry) {
            logger.debug(`No corresponding QQ message found for TG message: ${tgMsgId}`)
            continue
          }

          if (!dbEntry.seq) {
            logger.debug(`No seq found for TG message: ${tgMsgId}`)
            continue
          }

          // 撤回 QQ 消息
          try {
            await this.qqClient.recallMessage(String(dbEntry.seq))
            logger.info(`QQ message ${dbEntry.seq} recalled after TG message ${tgMsgId} deleted`)
          }
          catch (error) {
            logger.warn(error, `Failed to recall QQ message ${dbEntry.seq}:`)
          }
        }
        catch (error) {
          logger.error(error, `Failed to process deleted TG message ${tgMsgId}:`)
        }
      }
    }
    catch (error) {
      logger.error(error, 'Failed to handle TG delete:')
    }
  }

  /**
   * 处理 Telegram 消息撤回
   */
  async handleTGRecall(tgChatId: bigint | number, tgMsgId: bigint | number) {
    try {
      if (!hasConfiguredWorkMode(this.instance))
        return

      logger.info(`TG message recall requested: ${tgMsgId}`)

      // 查找对应的 QQ 消息
      const dbEntry = await db.query.message.findFirst({
        where: and(
          eq(schema.message.instanceId, this.instance.id),
          eq(schema.message.tgChatId, BigInt(tgChatId)),
          eq(schema.message.tgMsgId, BigInt(tgMsgId)),
        ),
      })

      if (!dbEntry || !dbEntry.seq) {
        logger.debug(`No corresponding QQ message found for TG message: ${tgMsgId}`)
        return
      }

      // 撤回 QQ 消息
      try {
        await this.qqClient.recallMessage(String(dbEntry.seq))
        logger.info(`QQ message ${dbEntry.seq} recalled`)
      }
      catch (error) {
        logger.error('Failed to recall QQ message:', error)
      }

      // 更新数据库
      await db.update(schema.message)
        .set({ ignoreDelete: true })
        .where(eq(schema.message.id, dbEntry.id))
    }
    catch (error) {
      logger.error('Failed to handle TG recall:', error)
    }
  }

  /**
   * 清理资源
   */
  destroy() {
    this.qqClient.off('recall', this.handleQQRecall)
    this.tgBot.removeDeletedMessageEventHandler(this.handleTGDelete)
    logger.info('RecallFeature destroyed')
  }
}
