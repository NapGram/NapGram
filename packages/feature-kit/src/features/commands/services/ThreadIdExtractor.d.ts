import type { UnifiedMessage } from '@napgram/message-kit';
/**
 * Telegram 话题 ID 提取服务
 * 负责从消息和参数中提取话题 ID
 */
export declare class ThreadIdExtractor {
    /**
     * 提取话题 ID
     * 优先从参数中提取，其次从原始消息中提取
     * @param msg 统一消息对象
     * @param args 命令参数
     * @returns 话题 ID（如果存在）
     */
    extract(msg: UnifiedMessage, args: string[]): number | undefined;
    /**
     * 从原始 TG 消息中提取话题 ID
     * 适配 mtcute 的字段命名
     */
    extractFromRaw(raw: any): number | undefined;
}
