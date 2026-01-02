import type { UnifiedMessage } from '@napgram/message-kit';
import type { CommandContext } from './CommandContext';
/**
 * 状态命令处理器
 */
export declare class StatusCommandHandler {
    private readonly context;
    constructor(context: CommandContext);
    execute(msg: UnifiedMessage, _args: string[]): Promise<void>;
}
