import type { UnifiedMessage } from '@napgram/message-kit';
import type { CommandContext } from './CommandContext';
/**
 * 撤回命令处理器
 */
export declare class RecallCommandHandler {
    private readonly context;
    constructor(context: CommandContext);
    execute(msg: UnifiedMessage, args: string[]): Promise<void>;
    /**
     * 处理批量撤回
     */
    private handleBatchRecall;
    /**
     * 处理单条撤回（原有逻辑，双向同步）
     */
    private handleSingleRecall;
}
