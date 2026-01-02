import type { UnifiedMessage } from '../types';
import { BaseConverter } from './BaseConverter';
export declare class UnifiedConverter extends BaseConverter {
    /**
     * 统一格式转换为 NapCat 格式
     */
    toNapCat(message: UnifiedMessage): Promise<any[]>;
    /**
     * 统一格式转换为 Telegram 格式
     */
    toTelegram(msg: UnifiedMessage): any;
    private saveBufferToTemp;
}
