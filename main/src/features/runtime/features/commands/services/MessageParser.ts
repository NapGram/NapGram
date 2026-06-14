/* eslint-disable eslint-comments/no-unlimited-disable */
/* eslint-disable */
import type { Message } from '@mtcute/core'
import type { UnifiedMessage } from '@napgram/message-kit'

export class MessageParser {
  private readonly prefix: string
  private readonly myBotUsername?: string

  constructor(prefix: string, myBotUsername?: string) {
    this.prefix = prefix
    this.myBotUsername = myBotUsername?.toLowerCase()
  }

  /**
   * 提取消息中显式 @ 的 Bot 名称（只识别以 bot 结尾的用户名）
   */
  extractMentionedBotUsernames(tgMsg: Message, parts: string[]): Set<string> {
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
   * 验证消息是否是指向本机器人的命令
   */
  isCommandForMe(tgMsg: Message, parts: string[]): boolean {
    const mentionedBots = this.extractMentionedBotUsernames(tgMsg, parts)

    // 如果没有任何 @ bot，假定是发给所有机器人的
    if (mentionedBots.size === 0) {
      return true
    }

    // 如果提到了本机器人，则处理
    if (this.myBotUsername && mentionedBots.has(this.myBotUsername)) {
      return true
    }

    // 如果提到了其他机器人，但没提到我，忽略
    return false
  }

  /**
   * 解析命令基础信息
   */
  parseCommandParts(text: string): { commandName: string, args: string[] } | null {
    if (!text || !text.startsWith(this.prefix)) {
      return null
    }

    const parts = text.slice(this.prefix.length).split(/\s+/)
    if (parts.length === 0 || !parts[0]) {
      return null
    }

    // 移除潜在的 @bot 后缀
    let commandName = parts[0].toLowerCase()
    const atIndex = commandName.indexOf('@')
    if (atIndex > 0) {
      commandName = commandName.slice(0, atIndex)
    }

    const args = parts.slice(1)
    return { commandName, args }
  }
}
