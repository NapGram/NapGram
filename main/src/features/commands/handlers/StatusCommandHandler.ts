import type { UnifiedMessage } from '../../../domain/message';
import type { IQQClient } from '../../../infrastructure/clients/qq';
import type Telegram from '../../../infrastructure/clients/telegram/client';
import type Instance from '../../../domain/models/Instance';
import ForwardMap from '../../../domain/models/ForwardMap';
import db from '../../../domain/models/db';
import { getLogger } from '../../../shared/logger';

const logger = getLogger('StatusCommandHandler');

/**
 * 状态命令处理器
 */
export class StatusCommandHandler {
    constructor(
        private readonly qqClient: IQQClient,
        private readonly replyTG: (chatId: string | number, text: string, threadId?: number) => Promise<void>
    ) { }

    async execute(msg: UnifiedMessage, args: string[]): Promise<void> {
        const isOnline = await this.qqClient.isOnline();
        const status = `
机器人状态:
- QQ: ${isOnline ? '在线' : '离线'}
- QQ 号: ${this.qqClient.uin}
- 昵称: ${this.qqClient.nickname}
- 客户端类型: ${this.qqClient.clientType}
        `.trim();

        await this.replyTG(msg.chat.id, status);
        logger.info('Status command executed');
    }
}
