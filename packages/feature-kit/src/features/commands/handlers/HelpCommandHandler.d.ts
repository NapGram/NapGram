import type { UnifiedMessage } from '@napgram/message-kit';
import type { CommandContext } from './CommandContext';
/**
 * 帮助命令处理器
 */
export declare class HelpCommandHandler {
    private readonly context;
    constructor(context: CommandContext);
    execute(msg: UnifiedMessage, _args: string[]): Promise<void>;
}
