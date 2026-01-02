import type { UnifiedMessage } from '@napgram/message-kit';
import type { CommandContext } from './CommandContext';
/**
 * 转发控制命令处理器
 * 处理: forwardoff, forwardon, disable_qq_forward, enable_qq_forward, disable_tg_forward, enable_tg_forward
 */
export declare class ForwardControlCommandHandler {
    private readonly context;
    constructor(context: CommandContext);
    /**
     * 执行转发控制命令
     */
    execute(msg: UnifiedMessage, args: string[], commandName: string): Promise<void>;
}
