import type { UnifiedMessage } from '@napgram/message-kit'
import type { CommandContext } from './CommandContext.js'
import { getLogger } from '../../../capabilities/logging.js'

const logger = getLogger('StatusCommandHandler')

/**
 * 状态命令处理器
 */
export class StatusCommandHandler {
  constructor(private readonly context: CommandContext) { }

  async execute(msg: UnifiedMessage, _args: string[]): Promise<void> {
    const isOnline = await this.context.qqClient.isOnline()
    const personalMode = typeof (this.context.instance as any).getPersonalModeDiagnostics === 'function'
      ? (this.context.instance as any).getPersonalModeDiagnostics()
      : undefined
    const personalModeLines = personalMode
      ? [
          `- 工作模式: ${personalMode.workMode || '未设置'}`,
          `- TG UserBot: ${personalMode.userBotStatus}${personalMode.userSessionId ? ` (session ${personalMode.userSessionId})` : ''}`,
          `- 自动建群: ${personalMode.canAutoProvisionPairs ? '可用' : '不可用'}`,
          `- 手动绑定: ${personalMode.manualPairingAvailable ? '可用' : '不可用'}`,
          ...(personalMode.reason ? [`- 诊断: ${personalMode.reason}`] : []),
          ...(personalMode.error ? [`- UserBot 错误: ${personalMode.error}`] : []),
        ].join('\n')
      : ''
    const status = `
机器人状态:
- QQ: ${isOnline ? '在线' : '离线'}
- QQ 号: ${this.context.qqClient.uin}
- 昵称: ${this.context.qqClient.nickname}
- 客户端类型: ${this.context.qqClient.clientType}
${personalModeLines}
        `.trim()

    await this.context.replyTG(msg.chat.id, status)
    logger.info('Status command executed')
  }
}
