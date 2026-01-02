import type { MessageContent } from '@napgram/message-kit';
import type { FileNormalizer } from './FileNormalizer';
import type { RichHeaderBuilder } from './RichHeaderBuilder';
/**
 * Media-specific sending operations for Telegram
 * Handles media groups, locations, and dice messages
 */
export declare class MediaSender {
    private readonly fileNormalizer;
    private readonly richHeaderBuilder;
    private readonly logger;
    constructor(fileNormalizer: FileNormalizer, richHeaderBuilder: RichHeaderBuilder);
    /**
     * Send multiple images/videos as a Telegram Media Group
     * @param chat - Telegram chat object
     * @param mediaItems - Array of image/video MessageContent
     * @param caption - Caption text for the first media
     * @param replyToMsgId - Message ID to reply to
     * @param pair - Pair object
     * @param header - Header text (usually nickname)
     * @param richHeaderUsed - Whether rich header is used
     * @param richHeaderUrl - Rich header URL
     * @param qqMsgId - QQ message ID for logging
     * @param sendMediaToTG - Function to send single media (fallback for single item)
     */
    sendMediaGroup(chat: any, mediaItems: MessageContent[], caption: string, replyToMsgId?: number, pair?: any, header?: string, richHeaderUsed?: boolean, richHeaderUrl?: string, qqMsgId?: string, sendMediaToTG?: (chat: any, header: string, content: MessageContent, replyToMsgId?: number, pair?: any, richHeaderUsed?: boolean, richHeaderUrl?: string, qqMsgId?: string) => Promise<any>): Promise<any>;
    /**
     * Send location or venue to Telegram
     */
    sendLocationToTG(chat: any, content: MessageContent, replyTo?: number, messageThreadId?: number, header?: string, _richHeaderUsed?: boolean, _richHeaderUrl?: string): Promise<any>;
    /**
     * Send dice/emoji to Telegram
     */
    sendDiceToTG(chat: any, content: MessageContent, replyTo?: number, messageThreadId?: number, header?: string, richHeaderUsed?: boolean, richHeaderUrl?: string, _pair?: any): Promise<any>;
}
