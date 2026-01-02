import type { UnifiedMessage } from '@napgram/message-kit';
import type { ForwardMapper } from './MessageMapper';
/**
 * 回复消息解析服务
 * 负责解析和查找回复消息的映射关系
 */
export declare class ReplyResolver {
    private readonly mapper;
    constructor(mapper: ForwardMapper);
    /**
     * 从 QQ 消息中提取并解析回复的 TG 消息 ID
     */
    resolveQQReply(msg: UnifiedMessage, instanceId: number, qqRoomId: bigint): Promise<number | undefined>;
    /**
     * 从 TG 消息中提取并解析回复的 QQ 消息
     */
    resolveTGReply(tgMsg: any, instanceId: number, tgChatId: number): Promise<{
        seq?: number;
        qqRoomId?: bigint;
        senderUin?: string;
        time?: number;
    } | undefined>;
}
