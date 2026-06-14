import type { UnifiedMessage } from '@napgram/message-kit'
import type { Instance, IQQClient, Telegram } from '../../../runtime-types.js'
import { telegramSend } from '../../../../../shared/utils/index.js'
import { getLogger } from '../../../capabilities/logging.js'
import { isInstanceAdmin } from '../../../admin-access.js'

const logger = getLogger('MessageUtils')

/**
 * 消息处理工具
 */
export class MessageUtils {
  /**
   * 填充 QQ @提及显示名。
   */
  static async populateAtDisplayNames(msg: UnifiedMessage, qqClient: IQQClient): Promise<void> {
    if (msg.chat.type !== 'group') {
      return
    }

    const nameCache = new Map<string, string>()
    for (const content of msg.content) {
      if (content.type !== 'at') {
        continue
      }

      const userId = String(content.data?.userId ?? '')
      if (!userId || userId === 'all') {
        continue
      }

      const cached = nameCache.get(userId)
      if (cached) {
        content.data.userName = cached
        continue
      }

      const providedName = (content.data?.userName || '').trim()
      if (providedName && providedName !== userId) {
        nameCache.set(userId, providedName)
        content.data.userName = providedName
        continue
      }

      try {
        const memberInfo = await qqClient.getGroupMemberInfo(msg.chat.id, userId)
        const card = memberInfo?.card?.trim()
        const nickname = memberInfo?.nickname?.trim()
        const resolvedName = card || nickname || userId

        content.data.userName = resolvedName
        nameCache.set(userId, resolvedName)
      }
      catch (error) {
        logger.warn(error, `Failed to resolve @ mention name for ${userId} in group ${msg.chat.id}`)
        content.data.userName = providedName || userId
        nameCache.set(userId, content.data.userName)
      }
    }
  }

  /**
   * 检查是否为管理员
   */
  static isAdmin(userId: string, instance: Instance): boolean {
    return isInstanceAdmin(userId, instance.owner)
  }

  /**
   * 发送 Telegram 回复
   */
  static async replyTG(
    tgBot: Telegram,
    chatId: string | number | bigint,
    text: string,
    replyTo?: string | number | bigint,
  ): Promise<void> {
    try {
      const chat = await tgBot.getChat(telegramSend.normalizeTelegramChatId(chatId) as any)
      await chat.sendMessage(text, telegramSend.buildTelegramTextSendParams(replyTo))
    }
    catch (error) {
      logger.warn('Failed to send TG reply:', error)
    }
  }
}
