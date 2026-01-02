import { env } from '@napgram/infra-kit';
import { getLogger } from '@napgram/infra-kit';
const ALLOWED_TELEGRAM_DICE = new Set(['🎲', '🎯', '🏀', '⚽️', '🎳', '🎰']);
/**
 * Media-specific sending operations for Telegram
 * Handles media groups, locations, and dice messages
 */
export class MediaSender {
    fileNormalizer;
    richHeaderBuilder;
    logger = getLogger('MediaSender');
    constructor(fileNormalizer, richHeaderBuilder) {
        this.fileNormalizer = fileNormalizer;
        this.richHeaderBuilder = richHeaderBuilder;
    }
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
    async sendMediaGroup(chat, mediaItems, caption, replyToMsgId, pair, header, richHeaderUsed, richHeaderUrl, qqMsgId, sendMediaToTG) {
        if (mediaItems.length === 0)
            return null;
        // Single media: use existing sendMediaToTG
        if (mediaItems.length === 1 && sendMediaToTG) {
            return await sendMediaToTG(chat, header || '', mediaItems[0], replyToMsgId, pair, richHeaderUsed, richHeaderUrl, qqMsgId);
        }
        // Multiple media: build Media Group
        this.logger.info(`Sending Media Group with ${mediaItems.length} items`);
        // Send separate Rich Header message before Media Group
        if (richHeaderUsed && richHeaderUrl) {
            const actionText = '发来一组图文消息：';
            const { text, params } = this.richHeaderBuilder.applyRichHeader(actionText, richHeaderUrl);
            params.replyTo = this.richHeaderBuilder.buildReplyTo(pair, replyToMsgId);
            if (pair?.tgThreadId) {
                params.messageThreadId = Number(pair.tgThreadId);
            }
            try {
                await chat.sendMessage(text, params);
                this.logger.info('[Forward] Sent Rich Header before Media Group');
                richHeaderUsed = false; // Mark as consumed
            }
            catch (e) {
                this.logger.warn(e, 'Failed to send Rich Header before Media Group:');
            }
        }
        const mediaInputs = [];
        const ttlSeconds = env.TG_MEDIA_TTL_SECONDS && env.TG_MEDIA_TTL_SECONDS > 0 ? env.TG_MEDIA_TTL_SECONDS : undefined;
        const ttlAllowedTypes = new Set(['photo', 'video', 'voice', 'animation']);
        for (const media of mediaItems) {
            try {
                // Note: resolveMediaInput would need to be called from parent
                // For now, we assume fileSrc is already prepared
                const fileName = media.data.fileName
                    || (typeof media.data.file === 'string'
                        ? media.data.file
                        : media.type === 'video' ? 'video.mp4' : 'image.jpg');
                // This is a simplified version - in practice, you'd need to pass the resolved file
                const fileSrc = media.data.file || media.data.url;
                const normalized = await this.fileNormalizer.normalizeInputFile(fileSrc, fileName);
                if (!normalized) {
                    this.logger.warn(`Skipping media in group: normalization failed`);
                    continue;
                }
                const isGif = this.fileNormalizer.isGifMedia(normalized);
                const inputType = media.type === 'video' ? 'video' : (isGif ? 'animation' : 'photo');
                const input = {
                    type: inputType,
                    file: normalized.data,
                    fileName: normalized.fileName,
                };
                if (ttlSeconds && ttlAllowedTypes.has(inputType)) {
                    input.ttlSeconds = ttlSeconds;
                }
                mediaInputs.push(input);
            }
            catch (err) {
                this.logger.warn(err, `Failed to process media item in group:`);
            }
        }
        if (mediaInputs.length === 0) {
            this.logger.warn('No valid media in group, skipping');
            return null;
        }
        // Combine header + caption for Media Group
        // Do NOT use Rich Header URL (already sent separately)
        let fullCaption = '';
        if (header && !richHeaderUsed) {
            // Only use text header if Rich Header was not sent separately
            fullCaption += header;
        }
        if (caption) {
            fullCaption += caption;
        }
        // Use plain text caption (no Rich Header link preview)
        if (fullCaption && mediaInputs[0]) {
            mediaInputs[0].caption = fullCaption;
            mediaInputs[0].parseMode = 'html';
        }
        // Build send parameters
        const sendParams = {
            replyTo: this.richHeaderBuilder.buildReplyTo(pair, replyToMsgId),
        };
        if (pair?.tgThreadId) {
            sendParams.messageThreadId = Number(pair.tgThreadId);
        }
        if (!sendParams.replyTo)
            delete sendParams.replyTo;
        try {
            let sentMessages;
            try {
                sentMessages = await chat.client.sendMediaGroup(chat.id, mediaInputs, sendParams);
            }
            catch (err) {
                if (ttlSeconds) {
                    this.logger.warn(err, 'sendMediaGroup failed with ttlSeconds, retrying without ttlSeconds');
                    for (const item of mediaInputs) {
                        if (item && typeof item === 'object')
                            delete item.ttlSeconds;
                    }
                    sentMessages = await chat.client.sendMediaGroup(chat.id, mediaInputs, sendParams);
                }
                else {
                    throw err;
                }
            }
            this.logger.debug(`[Forward] QQ message ${qqMsgId || ''} -> TG Media Group (${sentMessages.length} items)${fullCaption ? ' with caption' : ''}`);
            return sentMessages[0]; // Return first message for consistency
        }
        catch (err) {
            this.logger.error(err, 'Failed to send Media Group:');
            return null;
        }
    }
    /**
     * Send location or venue to Telegram
     */
    async sendLocationToTG(chat, content, replyTo, messageThreadId, header, _richHeaderUsed, _richHeaderUrl) {
        const loc = content.data || {};
        if (loc.latitude == null || loc.longitude == null) {
            return null;
        }
        const isVenue = Boolean((loc.title && loc.title.trim()) || (loc.address && loc.address.trim()));
        const mediaInput = isVenue
            ? {
                type: 'venue',
                latitude: loc.latitude,
                longitude: loc.longitude,
                title: loc.title || '位置',
                address: loc.address || '',
                source: { provider: 'qq', id: '', type: '' },
            }
            : {
                type: 'geo',
                latitude: loc.latitude,
                longitude: loc.longitude,
            };
        const captionText = header && header.trim() ? header : undefined;
        const sendParams = {
            replyTo,
            caption: captionText,
        };
        if (messageThreadId)
            sendParams.messageThreadId = messageThreadId;
        if (!sendParams.replyTo)
            delete sendParams.replyTo;
        if (!captionText)
            delete sendParams.caption;
        return await chat.client.sendMedia(chat.id, mediaInput, sendParams);
    }
    /**
     * Send dice/emoji to Telegram
     */
    async sendDiceToTG(chat, content, replyTo, messageThreadId, header, richHeaderUsed, richHeaderUrl, _pair) {
        const dice = content.data || {};
        const emoji = dice.emoji || '🎲';
        const value = dice.value;
        // Telegram only supports specific dice emojis
        if (!ALLOWED_TELEGRAM_DICE.has(emoji)) {
            // Fallback to text for unsupported emojis (e.g., rock-paper-scissors)
            const rpsMap = {
                1: '✋ 布',
                2: '✌️ 剪刀',
                3: '✊ 石头',
            };
            const choice = value && rpsMap[value] ? rpsMap[value] : `${emoji}`;
            const text = `发来一个石头剪刀布：${choice}`;
            const { text: msgText, params } = this.richHeaderBuilder.applyRichHeader(header ? `${header}${text}` : text, richHeaderUsed ? richHeaderUrl : undefined);
            params.replyTo = replyTo;
            if (messageThreadId)
                params.messageThreadId = messageThreadId;
            return await chat.sendMessage(msgText, params);
        }
        const params = {
            replyTo,
        };
        if (messageThreadId)
            params.messageThreadId = messageThreadId;
        if (!params.replyTo)
            delete params.replyTo;
        return await chat.client.sendMedia(chat.id, { type: 'dice', emoji }, params);
    }
}
