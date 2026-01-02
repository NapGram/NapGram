import { getLogger } from '@napgram/infra-kit';
const logger = getLogger('ReplyResolver');
/**
 * 回复消息解析服务
 * 负责解析和查找回复消息的映射关系
 */
export class ReplyResolver {
    mapper;
    constructor(mapper) {
        this.mapper = mapper;
    }
    /**
     * 从 QQ 消息中提取并解析回复的 TG 消息 ID
     */
    async resolveQQReply(msg, instanceId, qqRoomId) {
        const replyContent = msg.content.find(c => c.type === 'reply');
        if (!replyContent || replyContent.type !== 'reply') {
            return undefined;
        }
        const qqMsgId = replyContent.data.messageId;
        const tgMsgId = await this.mapper.findTgMsgId(instanceId, qqRoomId, qqMsgId);
        if (tgMsgId) {
            logger.debug(`Resolved QQ reply: QQ msg ${qqMsgId} -> TG msg ${tgMsgId}`);
        }
        return tgMsgId;
    }
    /**
     * 从 TG 消息中提取并解析回复的 QQ 消息
     */
    async resolveTGReply(tgMsg, instanceId, tgChatId) {
        // mtcute uses replyToMessage, not replyTo
        const replyToMsgId = tgMsg.replyToMessage?.id;
        if (!replyToMsgId) {
            return undefined;
        }
        const qqSource = await this.mapper.findQqSource(instanceId, tgChatId, replyToMsgId);
        if (qqSource) {
            logger.debug(`Resolved TG reply: TG msg ${replyToMsgId} -> QQ seq ${qqSource.seq}`);
            return {
                seq: qqSource.seq,
                qqRoomId: qqSource.qqRoomId,
                senderUin: qqSource.qqSenderId?.toString(),
                time: qqSource.time,
            };
        }
        return undefined;
    }
}
