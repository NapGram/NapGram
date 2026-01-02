/**
 * NapGram 消息 API 实现
 *
 * 提供插件发送、撤回和获取消息的能力
 */
import type { MessageContent } from '@napgram/message-kit';
import type { IInstance } from '@napgram/runtime-kit';
import type { GetMessageParams, MessageAPI, MessageInfo, MessageSegment, RecallMessageParams, SendMessageParams, SendMessageResult } from '../core/interfaces';
type TargetPlatform = 'qq' | 'tg';
type QqChannelType = 'group' | 'private';
export declare function parseChannelId(raw: string): {
    platform: TargetPlatform;
    channelId: string;
    qqType?: QqChannelType;
};
export declare function parseMessageId(raw: string): {
    platform: TargetPlatform;
    chatId?: string;
    messageId: string;
};
export declare function parseReplyToForPlatform(replyToRaw: string, platform: TargetPlatform): {
    chatId?: string;
    messageId: string;
};
export declare function segmentsToText(segments: MessageSegment[]): string;
export declare function pluginSegmentsToUnifiedContents(segments: MessageSegment[]): MessageContent[];
/**
 * 消息 API 实现
 *
 * 注意：这是一个适配器实现，实际的消息发送将在 Phase 4 集成到 Instance 时完成
 * 目前提供接口定义和基础实现框架
 */
export declare class MessageAPIImpl implements MessageAPI {
    /**
     * 实例访问器（Phase 4 注入）
     */
    private instanceResolver?;
    constructor(instanceResolver?: (instanceId: number) => IInstance | undefined);
    /**
     * 发送消息
     */
    send(params: SendMessageParams): Promise<SendMessageResult>;
    /**
     * 撤回消息
     */
    recall(params: RecallMessageParams): Promise<void>;
    /**
     * 获取消息
     */
    get(params: GetMessageParams): Promise<MessageInfo | null>;
    /**
     * 验证发送参数
     */
    private validateSendParams;
    /**
     * 规范化消息内容
     */
    private normalizeContent;
    /**
     * 通过实例发送消息（Phase 4 实现）
     */
    private sendViaInstance;
    /**
     * 通过实例撤回消息（Phase 4 实现）
     */
    private recallViaInstance;
    /**
     * 通过实例获取消息（Phase 4 实现）
     */
    private getViaInstance;
}
/**
 * 创建消息 API 实例
 */
export declare function createMessageAPI(instanceResolver?: (instanceId: number) => IInstance | undefined): MessageAPI;
export {};
