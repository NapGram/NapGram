import type { MessageContent } from '../../types';
/**
 * 媒体类型消息段转换器（图片、视频、音频）
 */
export declare class MediaSegmentConverter {
    convertImage(data: any): MessageContent;
    convertVideo(data: any, rawMessage?: string): MessageContent;
    convertAudio(data: any): MessageContent;
    convertFlash(data: any): MessageContent;
    convertFile(data: any, rawMessage?: string): MessageContent;
    convertSticker(data: any): MessageContent;
}
