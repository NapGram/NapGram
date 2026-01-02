import type { Buffer } from 'node:buffer';
export interface NormalizedFile {
    fileName: string;
    data: Buffer;
    fileMime?: string;
}
/**
 * Audio conversion utilities for Telegram voice messages
 * Handles OGG/Opus encoding and SILK decoding
 */
export declare class AudioConverter {
    private readonly logger;
    /**
     * Prepare voice media for Telegram (convert to OGG/Opus)
     */
    prepareVoiceMedia(file: NormalizedFile): Promise<{
        fileMime?: string | undefined;
        type: string;
        file: Buffer<ArrayBufferLike>;
        fileName: string;
    }>;
    /**
     * Convert audio file to OGG/Opus format for Telegram
     */
    convertAudioToOgg(file: NormalizedFile): Promise<NormalizedFile | undefined>;
    /**
     * Ensure filename has .ogg extension
     */
    ensureOggFileName(name: string): string;
    /**
     * Transcode audio to OGG/Opus using SILK or FFmpeg
     */
    transcodeToOgg(data: Buffer, sourceName: string, preferSilk?: boolean): Promise<Buffer | undefined>;
}
