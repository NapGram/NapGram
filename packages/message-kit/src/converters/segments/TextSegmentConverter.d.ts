import type { MessageContent } from '../../types';
/**
 * 文本类型消息段转换器
 */
export declare class TextSegmentConverter {
    convertText(data: any): MessageContent;
    convertShare(data: any, rawMessage?: string): MessageContent;
    convertPoke(data: any): MessageContent;
    convertMarkdown(data: any, segment: any): MessageContent;
}
