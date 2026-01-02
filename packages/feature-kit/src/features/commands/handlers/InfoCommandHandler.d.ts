import type { UnifiedMessage } from '@napgram/message-kit';
import type { CommandContext } from './CommandContext';
/**
 * Info 命令处理器
 * 显示当前聊天的绑定信息和消息详情
 */
export declare class InfoCommandHandler {
    private readonly context;
    constructor(context: CommandContext);
    execute(msg: UnifiedMessage, args: string[]): Promise<void>;
}
