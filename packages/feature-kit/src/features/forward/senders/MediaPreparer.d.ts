import type { AudioContent, FileContent, ImageContent, MessageContent, UnifiedMessage, VideoContent } from '@napgram/message-kit';
import type { Instance } from '../../../shared-types';
import type { MediaFeature } from '../../MediaFeature';
import { Buffer } from 'node:buffer';
export declare class ForwardMediaPreparer {
    private readonly instance;
    private readonly media?;
    private readonly contentRenderer;
    private readonly logger;
    constructor(instance: Instance, media?: MediaFeature | undefined, contentRenderer?: (content: MessageContent) => string);
    /**
     * 为 QQ 侧填充媒体 Buffer/URL，提升兼容性。
     */
    prepareMediaForQQ(msg: UnifiedMessage): Promise<void>;
    ensureBufferOrPath(content: ImageContent | VideoContent | AudioContent | FileContent, options?: {
        forceDownload?: boolean;
        prefer?: 'buffer' | 'path' | 'url';
        ext?: string;
        filename?: string;
        prefix?: string;
    }): Promise<Buffer | string | undefined>;
    ensureFilePath(file: Buffer | string | undefined, ext?: string, forceLocal?: boolean): Promise<string | undefined>;
    prepareAudioSource(audioContent: AudioContent, processedFile?: Buffer | string): Promise<string | Buffer<ArrayBufferLike> | undefined>;
    private waitFileStable;
    convertAudioToOgg(source: Buffer | string): Promise<{
        voicePath?: string;
        fallbackPath?: string;
    }>;
}
