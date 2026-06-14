import type { UnifiedMessage } from '@napgram/message-kit'
import type { ForwardMap } from '../../../runtime-types.js'
import type { QqChatType } from '../utils/ForwardPairChatType.js'
import type { CommandContext } from './CommandContext.js'
import { getLogger } from '../../../capabilities/logging.js'
import { addForwardPairWithChatType, findPairByTGWithChatType, formatQqChatTypeLabel } from '../utils/ForwardPairChatType.js'

const logger = getLogger('BindCommandHandler')

/**
 * 绑定命令处理器
 */
export class BindCommandHandler {
  constructor(private readonly context: CommandContext) { }

  async execute(msg: UnifiedMessage, args: string[], qqChatType: QqChatType = 'group'): Promise<void> {
    // 只在 Telegram 端处理
    if (msg.platform !== 'telegram') {
      return
    }

    const threadId = this.context.extractThreadId(msg, args)
    const qqLabel = formatQqChatTypeLabel(qqChatType)
    const commandName = qqChatType === 'private' ? 'bindfriend' : 'bindgroup'
    const targetArgName = qqChatType === 'private' ? 'qq_user_id' : 'qq_group_id'

    if (args.length < 1) {
      // 进入交互式绑定流程
      this.context.stateManager.setBindingState(msg.chat.id, msg.sender.id, threadId, qqChatType)

      const tip = `请输入要绑定的 ${qqLabel} 号...
(回复非数字取消)

提示：也可以直接发送完整命令，如：
/ ${commandName} 123456 [topic_id]
(topic_id 可以省略，默认绑定当前话题)`
        .replace('/ ', '/')

      await this.context.replyTG(msg.chat.id, tip, threadId)
      return
    }

    const qqTargetId = args[0]
    if (!/^-?\d+$/.test(qqTargetId)) {
      await this.context.replyTG(msg.chat.id, `${targetArgName} 必须是数字`, threadId)
      return
    }

    const forwardMap = this.context.instance.forwardPairs as ForwardMap

    // 如果 TG 话题已被其他 QQ 占用，拒绝绑定
    const tgOccupied = await findPairByTGWithChatType(forwardMap, msg.chat.id, threadId, false)
    if (tgOccupied && (tgOccupied.qqRoomId.toString() !== qqTargetId || tgOccupied.qqChatType !== qqChatType)) {
      await this.context.replyTG(msg.chat.id, `该 TG 话题已绑定到其他 ${formatQqChatTypeLabel(tgOccupied.qqChatType)}`, threadId)
      return
    }

    // add 会在已存在该 QQ 时更新 tgThreadId
    const rec = await addForwardPairWithChatType(forwardMap, this.context.instance.id, qqTargetId, msg.chat.id, threadId, qqChatType)
    if (!rec) {
      await this.context.replyTG(msg.chat.id, '绑定失败：操作未生效，请重试', threadId)
      return
    }
    if (rec.qqRoomId.toString() !== qqTargetId || rec.qqChatType !== qqChatType) {
      await this.context.replyTG(msg.chat.id, '绑定失败：检测到冲突，请检查现有绑定', threadId)
      return
    }

    const threadInfo = threadId ? ` (话题 ${threadId})` : ''
    await this.context.replyTG(msg.chat.id, `绑定成功：${qqLabel} ${qqTargetId} <-> TG ${msg.chat.id}${threadInfo}`, threadId)
    logger.info(`Bind command: ${qqLabel} ${qqTargetId} <-> TG ${msg.chat.id}${threadInfo}`)
  }
}
