import type { MessageContent } from '@napgram/message-kit';
import type { MediaFeature } from '../../MediaFeature';
import { Buffer } from 'node:buffer';
import { Readable } from 'node:stream';
export interface NormalizedFile {
    fileName: string;
    data: Buffer;
    fileMime?: string;
}
/**
 * File normalization and handling utilities
 * Converts various file sources (Buffer, Stream, URL, path) to normalized format
 */
export declare class FileNormalizer {
    private readonly media?;
    private readonly logger;
    constructor(media?: MediaFeature | undefined);
    /**
     * Normalize input file from various sources to Buffer with metadata
     */
    normalizeInputFile(src: any, fallbackName: string): Promise<NormalizedFile | undefined>;
    /**
     * Handle local files and mtcute Media objects
     * Converts to Buffer if needed
     */
    handleLocalOrMtcuteMedia(fileSrc: any, defaultExt: string, tgBotDownloader?: (media: any) => Promise<Buffer>): Promise<any>;
    /**
     * Resolve media input from MessageContent using MediaFeature
     */
    resolveMediaInput(content: MessageContent, tgBotDownloader?: (media: any) => Promise<Buffer>): Promise<any>;
    /**
     * Check if media is GIF format
     */
    isGifMedia(file: NormalizedFile): boolean;
    /**
     * Convert stream to buffer
     */
    streamToBuffer(stream: Readable): Promise<Buffer>;
    /**
     * 尝试读取本地文件，如果不存在则根据常见 NapCat 临时文件命名（去除 .数字 / (数字) 后缀）和同目录模糊匹配读取
     */
    private tryReadLocalWithFallback;
}
