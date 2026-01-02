import type { InputText } from '@mtcute/core';
/**
 * Rich Header URL generation and formatting
 * Handles link preview formatting for message headers
 */
export declare class RichHeaderBuilder {
    /**
     * Generate Rich Header URL with hash
     */
    generateRichHeaderUrl(apiKey: string, userId: string, messageHeader: string): string;
    /**
     * Apply Rich Header formatting to text
     * Returns formatted text with link preview or plain text
     */
    applyRichHeader(text: string, richHeaderUrl?: string): {
        text: string | InputText;
        params: any;
    };
    /**
     * Build reply parameters for message
     */
    buildReplyTo(pair?: any, replyToMsgId?: number): number | undefined;
    /**
     * Escape HTML special characters
     */
    escapeHtml(text: string): string;
}
