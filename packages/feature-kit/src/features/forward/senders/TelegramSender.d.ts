import type { MessageContent, UnifiedMessage } from '@napgram/message-kit';
import type { Instance } from '../../../shared-types';
import type { MediaFeature } from '../../MediaFeature';
export declare class TelegramSender {
    private readonly instance;
    private readonly media?;
    private readonly contentRenderer;
    private readonly logger;
    private readonly audioConverter;
    private readonly fileNormalizer;
    private readonly richHeaderBuilder;
    private readonly mediaSender;
    constructor(instance: Instance, media?: MediaFeature | undefined, contentRenderer?: (content: MessageContent) => string);
    sendToTelegram(chat: any, msg: UnifiedMessage, pair: any, replyToMsgId: number | undefined, nicknameMode: string): Promise<any>;
    private sendMediaToTG;
    private sendForwardToTG;
}
