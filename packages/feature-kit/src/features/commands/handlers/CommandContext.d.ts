import type { UnifiedMessage } from '@napgram/message-kit';
import type { Instance } from '../../../shared-types';
import type { IQQClient } from '../../../shared-types';
import type { Telegram } from '../../../shared-types';
import type { CommandRegistry } from '../services/CommandRegistry';
import type { InteractiveStateManager } from '../services/InteractiveStateManager';
import type { PermissionChecker } from '../services/PermissionChecker';
/**
 * 命令处理器上下文 - 包含所有命令处理器需要的依赖
 */
export declare class CommandContext {
    readonly instance: Instance;
    readonly tgBot: Telegram;
    readonly qqClient: IQQClient;
    readonly registry: CommandRegistry;
    readonly permissionChecker: PermissionChecker;
    readonly stateManager: InteractiveStateManager;
    readonly replyTG: (chatId: string | number, text: any, threadId?: number) => Promise<void>;
    readonly extractThreadId: (msg: UnifiedMessage, args: string[]) => number | undefined;
    constructor(instance: Instance, tgBot: Telegram, qqClient: IQQClient, registry: CommandRegistry, permissionChecker: PermissionChecker, stateManager: InteractiveStateManager, replyTG: (chatId: string | number, text: any, threadId?: number) => Promise<void>, extractThreadId: (msg: UnifiedMessage, args: string[]) => number | undefined);
    /**
     * 回复到QQ
     */
    replyQQ(roomId: string, text: string): Promise<void>;
    /**
     * 获取指定 pair 的命令回复模式配置
     * 优先使用 pair 的配置，若为 null 则使用环境变量默认值
     */
    private getCommandReplyMode;
    /**
     * 判断是否应该双向回复
     */
    private shouldReplyBothSides;
    /**
     * 双向回复 - 同时回复到TG和QQ
     * 如果找不到配对群，则只回复到发起平台
     * @param msg 消息对象
     * @param text 回复文本
     * @param commandName 命令名称（用于过滤），如 "help", "status"
     */
    replyBoth(msg: UnifiedMessage, text: string, commandName?: string): Promise<void>;
    /**
     * 检查命令是否允许双向回复
     * @param pair 配对信息
     * @param commandName 命令名称（不含前缀，如 "help" 而不是 "/help"）
     */
    private isCommandAllowed;
}
