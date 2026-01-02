import { getLogger } from '@napgram/infra-kit';
const logger = getLogger('StatusCommandHandler');
/**
 * 状态命令处理器
 */
export class StatusCommandHandler {
    context;
    constructor(context) {
        this.context = context;
    }
    async execute(msg, _args) {
        const isOnline = await this.context.qqClient.isOnline();
        const status = `
机器人状态:
- QQ: ${isOnline ? '在线' : '离线'}
- QQ 号: ${this.context.qqClient.uin}
- 昵称: ${this.context.qqClient.nickname}
- 客户端类型: ${this.context.qqClient.clientType}
        `.trim();
        await this.context.replyTG(msg.chat.id, status);
        logger.info('Status command executed');
    }
}
