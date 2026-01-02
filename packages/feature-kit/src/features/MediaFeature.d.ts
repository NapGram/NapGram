import type { AudioContent, ImageContent, VideoContent } from '@napgram/message-kit';
import type { Instance } from '../shared-types';
import type { IQQClient } from '../shared-types';
import type { Telegram } from '../shared-types';
import { Buffer } from 'node:buffer';
/**
 * 媒体处理功能
 * Phase 3: 处理图片、视频、音频等媒体文件
 */
export declare class MediaFeature {
    private readonly instance;
    private readonly tgBot;
    private readonly qqClient;
    constructor(instance: Instance, tgBot: Telegram, qqClient: IQQClient);
    /**
     * 下载媒体文件
     */
    downloadMedia(url: string): Promise<Buffer>;
    /**
     * 通过 NapCat file_id 获取文件（兜底：naplink get_file / download_file）
     */
    fetchFileById(fileId: string): Promise<{
        buffer?: Buffer;
        url?: string;
        path?: string;
    }>;
    /**
     * 处理图片
     */
    processImage(content: ImageContent): Promise<Buffer | string>;
    /**
     * 处理视频
     */
    processVideo(content: VideoContent): Promise<Buffer | string>;
    /**
     * 处理音频
     */
    processAudio(content: AudioContent): Promise<Buffer | string>;
    /**
     * 创建临时文件
     */
    createTempFileFromBuffer(buffer: Buffer, extension?: string): Promise<{
        path: string;
        cleanup: () => Promise<void>;
    }>;
    /**
     * 获取媒体文件大小
     */
    getMediaSize(buffer: Buffer): number;
    /**
     * 检查媒体大小是否超限
     */
    isMediaTooLarge(buffer: Buffer, maxSize?: number): boolean;
    /**
     * 压缩图片（如果需要）
     */
    compressImage(buffer: Buffer, maxSize?: number): Promise<Buffer>;
    /**
     * 清理资源
     */
    destroy(): void;
}
