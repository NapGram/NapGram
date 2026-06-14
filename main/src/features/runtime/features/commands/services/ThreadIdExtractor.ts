import type { UnifiedMessage } from '@napgram/message-kit'
import { telegramMessage } from '../../../../../shared/utils/index.js'
import { getLogger } from '../../../capabilities/logging.js'

const logger = getLogger('ThreadIdExtractor')

/**
 * Telegram 话题 ID 提取服务
 * 负责从消息和参数中提取话题 ID
 */
export class ThreadIdExtractor {
  /**
   * 提取话题 ID
   * 优先从参数中提取，其次从原始消息中提取
   * @param msg 统一消息对象
   * @param args 命令参数
   * @returns 话题 ID（如果存在）
   */
  extract(msg: UnifiedMessage, args: string[]): bigint | undefined {
    // 从第二个参数开始，向后查找第一个纯数字且较小的参数作为话题 ID
    // 避免把 qq_group_id 或 chatId 当作话题
    const arg = args
      .slice(1)
      .reverse()
      .find(a => /^\d+$/.test(a) && Number(a) > 0 && Number(a) < 1_000_000_000)
    if (arg)
      return BigInt(arg)

    const raw = (msg.metadata as any)?.raw as any
    const thread = this.extractFromRaw(raw)

    logger.info({
      fromArgs: arg,
      threadFromRaw: thread,
      rawReplyTo: raw?.replyTo,
      rawTopicId: (raw as any)?.topicId,
      rawForumTopicId: (raw as any)?.forumTopicId,
      rawThreadId: (raw as any)?.threadId,
      rawReplyToThreadId: (raw as any)?.replyToThreadId,
      rawReplyToTopMsgId: (raw as any)?.replyToTopMsgId,
      rawMessageId: (raw as any)?.messageId,
      rawMsgId: (raw as any)?.msgId,
      rawId: (raw as any)?.id,
      rawKeys: raw ? Object.keys(raw) : [],
    }, 'extractThreadId result')

    if (thread)
      return thread
    return undefined
  }

  /**
   * 从原始 TG 消息中提取话题 ID
   * 适配 mtcute 的字段命名
   */
  extractFromRaw(raw: any): bigint | undefined {
    return telegramMessage.getTelegramThreadId(raw)
  }
}
