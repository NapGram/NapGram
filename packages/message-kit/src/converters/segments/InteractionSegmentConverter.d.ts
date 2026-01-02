import type { MessageContent } from '../../types';
/**
 * 交互类型消息段转换器（@、表情、骰子等）
 */
export declare class InteractionSegmentConverter {
    convertAt(data: any): MessageContent;
    convertFace(data: any): MessageContent;
    convertDice(data: any): MessageContent;
    convertRps(data: any): MessageContent;
    convertLocation(data: any): MessageContent;
    convertReply(data: any): MessageContent;
}
