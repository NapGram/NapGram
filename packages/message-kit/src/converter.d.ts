import type { Message } from '@mtcute/core';
import type { IInstance as Instance } from '@napgram/runtime-kit';
import type { UnifiedMessage } from './types';
/**
 * 增强的消息转换器
 * Phase 2: 完整支持所有消息类型
 */
export declare class MessageConverter {
    private napCatConverter;
    private instance?;
    setInstance(instance: Instance): void;
    /**
     * 从 NapCat 消息转换为统一格式
     */
    fromNapCat(napCatMsg: any): UnifiedMessage;
    /**
     * 统一格式转换为 NapCat 格式
     */
    /**
     * 从 Telegram 消息转换为统一格式
     */
    fromTelegram(tgMsg: Message, repliedMsgOverride?: Message): UnifiedMessage;
    /**
     * 统一格式转换为 Telegram 格式
     */
    toTelegram(msg: UnifiedMessage): any;
    private saveBufferToTemp;
    toNapCat(message: UnifiedMessage): Promise<any[]>;
    private buildLocationJson;
}
export declare const messageConverter: MessageConverter;
