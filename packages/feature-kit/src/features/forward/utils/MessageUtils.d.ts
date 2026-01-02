import type { UnifiedMessage } from '@napgram/message-kit';
import type { Instance } from '../../../shared-types';
import type { IQQClient } from '../../../shared-types';
import type { Telegram } from '../../../shared-types';
/**
 * Utility functions for message processing
 */
export declare class MessageUtils {
    /**
     * Populate @mention display names in QQ messages.
     * Priority: group card > nickname > QQ ID
     */
    static populateAtDisplayNames(msg: UnifiedMessage, qqClient: IQQClient): Promise<void>;
    /**
     * Check if a user is an admin
     */
    static isAdmin(userId: string, instance: Instance): boolean;
    /**
     * Send a reply message to Telegram
     */
    static replyTG(tgBot: Telegram, chatId: string | number, text: string, replyTo?: any): Promise<void>;
}
