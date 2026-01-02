import { getLogger } from '@napgram/infra-kit';
const logger = getLogger('ThreadIdExtractor');
/**
 * Telegram 话题 ID 提取服务
 * 负责从消息和参数中提取话题 ID
 */
export class ThreadIdExtractor {
    /**
     * 提取话题 ID
     * 优先从参数中提取，其次从原始消息中提取
     * @param msg 统一消息对象
     * @param args 命令参数
     * @returns 话题 ID（如果存在）
     */
    extract(msg, args) {
        // 从第二个参数开始，向后查找第一个纯数字且较小的参数作为话题 ID
        // 避免把 qq_group_id 或 chatId 当作话题
        const arg = args
            .slice(1)
            .reverse()
            .find(a => /^\d+$/.test(a) && Number(a) > 0 && Number(a) < 1_000_000_000);
        if (arg)
            return Number(arg);
        const raw = msg.metadata?.raw;
        const thread = this.extractFromRaw(raw);
        logger.info({
            fromArgs: arg,
            threadFromRaw: thread,
            rawReplyTo: raw?.replyTo,
            rawTopicId: raw?.topicId,
            rawForumTopicId: raw?.forumTopicId,
            rawThreadId: raw?.threadId,
            rawReplyToThreadId: raw?.replyToThreadId,
            rawReplyToTopMsgId: raw?.replyToTopMsgId,
            rawMessageId: raw?.messageId,
            rawMsgId: raw?.msgId,
            rawId: raw?.id,
            rawKeys: raw ? Object.keys(raw) : [],
        }, 'extractThreadId result');
        if (thread)
            return thread;
        return undefined;
    }
    /**
     * 从原始 TG 消息中提取话题 ID
     * 适配 mtcute 的字段命名
     */
    extractFromRaw(raw) {
        if (!raw)
            return undefined;
        const replyTo = raw?.replyTo;
        // For forum topics, replyToTopId is the correct field
        // This is the topic/thread ID according to mtcute's Message structure
        const candidates = [
            replyTo?.replyToTopId,
            raw.replyToTopId,
            replyTo?.forumTopicId,
            replyTo?.topicId,
            replyTo?.replyToTopicId,
            replyTo?.replyToMsgId,
            raw.replyToMsgId,
            raw.topicId,
            raw.forumTopicId,
            raw.threadId,
            raw.replyToThreadId,
            raw.replyToTopMsgId,
            raw.messageThreadId,
        ];
        // Also check the TL layer raw object if it exists
        if (raw.raw) {
            const tlReplyTo = raw.raw.replyTo;
            candidates.push(tlReplyTo?.replyToTopId, tlReplyTo?.replyToMsgId, tlReplyTo?.forumTopicId, tlReplyTo?.topicId, raw.raw.replyToTopId, raw.raw.topicId, raw.raw.messageThreadId);
        }
        for (const c of candidates) {
            if (typeof c === 'number' && c > 0)
                return c;
        }
        return undefined;
    }
}
