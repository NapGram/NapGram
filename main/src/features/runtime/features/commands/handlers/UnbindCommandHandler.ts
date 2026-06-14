import type { UnifiedMessage } from '@napgram/message-kit'
import type { ForwardMap } from '../../../runtime-types.js'
import type { QqChatType } from '../utils/ForwardPairChatType.js'
import type { CommandContext } from './CommandContext.js'
import { getLogger } from '../../../capabilities/logging.js'
import { findPairByQQWithChatType, findPairByTGWithChatType, formatQqChatTypeLabel, parseQqChatType, removeForwardPairById } from '../utils/ForwardPairChatType.js'

const logger = getLogger('UnbindCommandHandler')

/**
 * 解绑命令处理器
 */
export class UnbindCommandHandler {
  constructor(private readonly context: CommandContext) { }

  async execute(msg: UnifiedMessage, args: string[]): Promise<void> {
    // 只在 Telegram 端处理
    if (msg.platform !== 'telegram') {
      return
    }

    const explicitType = parseQqChatType(args[0])
    const qqTargetId = explicitType ? args[1] : args[0]
    const qqChatType: QqChatType = explicitType ?? 'group'
    const chatId = msg.chat.id
    const forwardMap = this.context.instance.forwardPairs as ForwardMap
    const threadId = this.context.extractThreadId(msg, args)

    const target = qqTargetId && /^-?\d+$/.test(qqTargetId)
      ? await findPairByQQWithChatType(forwardMap, this.context.instance.id, qqTargetId, qqChatType)
      : await findPairByTGWithChatType(forwardMap, chatId, threadId, !threadId)

    if (!target) {
      await this.context.replyTG(chatId, '未找到绑定关系', threadId)
      return
    }

    await removeForwardPairById(forwardMap, target.id)
    const threadInfo = target.tgThreadId ? ` (话题 ${target.tgThreadId})` : ''
    const qqLabel = formatQqChatTypeLabel(target.qqChatType)
    await this.context.replyTG(chatId, `已解绑：${qqLabel} ${target.qqRoomId} <-> TG ${target.tgChatId}${threadInfo}`, threadId || target.tgThreadId || undefined)
    logger.info(`Unbind command: ${qqLabel} ${target.qqRoomId} <-> TG ${target.tgChatId}${threadInfo}`)
  }
}
