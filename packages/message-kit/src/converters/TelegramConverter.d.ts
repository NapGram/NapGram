import type { Message } from '@mtcute/core';
import type { UnifiedMessage } from '../types';
import { BaseConverter } from './BaseConverter';
export declare class TelegramConverter extends BaseConverter {
    /**
     * 从 Telegram 消息转换为统一格式
     */
    fromTelegram(tgMsg: Message): UnifiedMessage;
    private convertTextWithMentions;
}
