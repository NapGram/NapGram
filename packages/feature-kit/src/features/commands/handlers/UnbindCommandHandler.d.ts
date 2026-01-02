import type { UnifiedMessage } from '@napgram/message-kit';
import type { CommandContext } from './CommandContext';
/**
 * 解绑命令处理器
 */
export declare class UnbindCommandHandler {
    private readonly context;
    constructor(context: CommandContext);
    execute(msg: UnifiedMessage, args: string[]): Promise<void>;
}
