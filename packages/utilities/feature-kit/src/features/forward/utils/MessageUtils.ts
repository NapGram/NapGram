import type { UnifiedMessage } from '@napgram/message-kit'
import type { Instance } from '../../../shared-types.js'
import type { IQQClient } from '../../../shared-types.js'
import type { Telegram } from '../../../shared-types.js'
import { env, getLogger } from '../../../shared-types.js'

const logger = getLogger('MessageUtils')

/**
 * Utility functions for message processing
 */
export class MessageUtils {
  /**
   * Populate @mention display names in QQ messages.
   * Priority: group card > nickname > QQ ID
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
   * Check if a user is an admin
   */
  static isAdmin(userId: string, instance: Instance): boolean {
    const envAdminQQ = env.ADMIN_QQ ? String(env.ADMIN_QQ) : null
    const envAdminTG = env.ADMIN_TG ? String(env.ADMIN_TG) : null
    return userId === String(instance.owner)
      || !!(envAdminQQ && userId === envAdminQQ)
      || !!(envAdminTG && userId === envAdminTG)
  }

  /**
   * Send a reply message to Telegram
   */
  static async replyTG(
    tgBot: Telegram,
    chatId: string | number | bigint,
    text: string,
    replyTo?: string | number | bigint,
  ): Promise<void> {
    try {
      // Ensure numeric chat IDs are passed correctly
      let resolvedChatId: string | number | bigint = chatId
      if (typeof chatId === 'string' && /^-?\d+$/.test(chatId)) {
        resolvedChatId = Number(chatId)
      }
      else if (typeof chatId === 'bigint') {
        resolvedChatId = Number(chatId)
      }

      const chat = await tgBot.getChat(resolvedChatId as any)
      const params: any = { linkPreview: { disable: true } }
      if (replyTo !== undefined && replyTo !== null) {
        const normalizedReplyTo = Number(replyTo)
        if (Number.isFinite(normalizedReplyTo) && normalizedReplyTo > 0) {
          params.replyTo = normalizedReplyTo
        }
      }
      await chat.sendMessage(text, params)
    }
    catch (error) {
      logger.warn('Failed to send TG reply:', error)
    }
  }
}
