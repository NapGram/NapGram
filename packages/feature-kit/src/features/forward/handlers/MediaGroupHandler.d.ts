import type { Message } from '@mtcute/core';
import type { UnifiedMessage } from '@napgram/message-kit';
import type { IQQClient } from '../../../shared-types';
/**
 * Handles Telegram Media Group batching for TG→QQ forwarding.
 *
 * Buffers incoming media group messages with a delay, then forwards them
 * as a single QQ message with all images/videos combined.
 */
export declare class MediaGroupHandler {
    private readonly qqClient;
    private readonly prepareMediaForQQ;
    private readonly getNicknameMode;
    private mediaGroupBuffer;
    constructor(qqClient: IQQClient, prepareMediaForQQ: (msg: UnifiedMessage) => Promise<void>, getNicknameMode: (pair: any) => string);
    /**
     * Handle Media Group batching for TG->QQ
     * @returns true if the message is part of a media group and is buffered
     */
    handleMediaGroup(tgMsg: Message, pair: any): Promise<boolean>;
    /**
     * Flush buffered Media Group messages to QQ
     */
    private flushMediaGroup;
    /**
     * Destroy handler and clear all pending timers
     */
    destroy(): void;
}
