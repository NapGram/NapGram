/**
 * QQ 交互 Helper 函数
 *
 * 提供高级封装，避免插件重复实现逻辑
 */
import type { MessageEvent } from '@napgram/sdk';
export interface QQInteractionResult {
    success: boolean;
    message: string;
    data?: any;
}
/**
 * 解析目标用户
 * 优先从回复消息中提取（支持文本匹配和 RichHeader 链接解析），其次从命令参数解析
 */
export declare function resolveTargetUser(event: MessageEvent, args: string[]): string | undefined;
/**
 * 查找当前聊天绑定的 QQ 群
 */
export declare function findBoundQQGroup(event: MessageEvent): {
    qqGroupId?: string;
    apiKey?: string;
    error?: string;
};
/**
 * 戳一戳
 */
export declare function sendPoke(event: MessageEvent, args: string[]): Promise<QQInteractionResult>;
/**
 * 获取/设置群名片
 */
export declare function handleNick(event: MessageEvent, args: string[]): Promise<QQInteractionResult>;
/**
 * 点赞
 */
export declare function sendLike(event: MessageEvent, args: string[]): Promise<QQInteractionResult>;
/**
 * 群荣誉
 */
export declare function getGroupHonor(event: MessageEvent, args: string[]): Promise<QQInteractionResult>;
