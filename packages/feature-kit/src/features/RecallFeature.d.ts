import type { Instance } from '../shared-types';
import type { IQQClient } from '../shared-types';
import type { Telegram } from '../shared-types';
/**
 * 消息撤回功能
 * Phase 3: 处理双向消息撤回
 */
export declare class RecallFeature {
    private readonly instance;
    private readonly tgBot;
    private readonly qqClient;
    constructor(instance: Instance, tgBot: Telegram, qqClient: IQQClient);
    /**
     * 设置事件监听器
     */
    private setupListeners;
    /**
     * 处理 QQ 消息撤回
     */
    private handleQQRecall;
    /**
     * 处理 Telegram 消息删除（直接删除，非 /rm 命令）
     */
    private handleTGDelete;
    /**
     * 处理 Telegram 消息撤回
     */
    handleTGRecall(tgChatId: number, tgMsgId: number): Promise<void>;
    /**
     * 清理资源
     */
    destroy(): void;
}
