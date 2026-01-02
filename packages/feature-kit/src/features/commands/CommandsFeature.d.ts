import type { UnifiedMessage } from '@napgram/message-kit';
import type { Instance } from '../../shared-types';
import type { IQQClient } from '../../shared-types';
import type { Telegram } from '../../shared-types';
import type { Command } from './services/CommandRegistry';
/**
 * 命令类型
 */
export type CommandHandler = (msg: UnifiedMessage, args: string[]) => Promise<void>;
export type { Command } from './services/CommandRegistry';
/**
 * 命令处理功能
 * Phase 3: 统一的命令处理系统
 */
export declare class CommandsFeature {
    private readonly instance;
    private readonly tgBot;
    private readonly qqClient;
    private readonly registry;
    private readonly permissionChecker;
    private readonly stateManager;
    private readonly commandContext;
    private readonly helpHandler;
    private readonly statusHandler;
    private readonly bindHandler;
    private readonly unbindHandler;
    private readonly recallHandler;
    private readonly forwardControlHandler;
    private readonly infoHandler;
    constructor(instance: Instance, tgBot: Telegram, qqClient: IQQClient);
    /**
     * 重新加载命令（用于插件重载后刷新命令处理器）
     */
    reloadCommands(): Promise<void>;
    /**
     * 注册默认命令
     */
    private registerDefaultCommands;
    /**
     * 注册命令
     */
    registerCommand(command: Command): void;
    /**
     * 从插件系统加载命令
     * @returns 已加载的命令名集合
     */
    private loadPluginCommands;
    /**
     * 将 UnifiedMessage 转换为 MessageEvent（用于插件命令处理）
     */
    private convertToMessageEvent;
    /**
     * 设置事件监听器
     */
    private setupListeners;
    /**
     * 对外暴露的处理函数，便于其他模块手动调用
     * 返回 true 表示命令已处理，外部可中断后续逻辑
     */
    processTgMessage: (tgMsg: any) => Promise<boolean>;
    private handleTgMessage;
    private handleQqMessage;
    private extractThreadId;
    private replyTG;
    /**
     * 提取消息中显式 @ 的 Bot 名称（只识别以 bot 结尾的用户名）
     */
    private extractMentionedBotUsernames;
    /**
     * 清理资源
     */
    destroy(): void;
}
