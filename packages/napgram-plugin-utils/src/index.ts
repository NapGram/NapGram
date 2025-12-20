/**
 * NapGram Plugin Utils
 * 
 * Utility functions for NapGram native plugins
 */

import type { MessageSegment } from '@naplink/napgram-plugin-types';

/**
 * 提取消息片段中的纯文本
 */
export function extractPlainText(segments: MessageSegment[]): string {
    return segments
        .filter(seg => seg.type === 'text')
        .map(seg => seg.data.text || '')
        .join('');
}

/**
 * 创建文本片段
 */
export function makeText(text: string): MessageSegment {
    return {
        type: 'text',
        data: { text }
    };
}

/**
 * 创建 @某人 片段
 */
export function makeAt(userId: string, userName?: string): MessageSegment {
    return {
        type: 'at',
        data: { userId, userName }
    };
}

/**
 * 创建回复片段
 */
export function makeReply(messageId: string): MessageSegment {
    return {
        type: 'reply',
        data: { messageId }
    };
}

/**
 * 创建图片片段
 */
export function makeImage(url: string, file?: string): MessageSegment {
    return {
        type: 'image',
        data: { url, file }
    };
}

/**
 * 创建视频片段
 */
export function makeVideo(url: string, file?: string): MessageSegment {
    return {
        type: 'video',
        data: { url, file }
    };
}

/**
 * 创建音频片段
 */
export function makeAudio(url: string, file?: string): MessageSegment {
    return {
        type: 'audio',
        data: { url, file }
    };
}

/**
 * 创建文件片段
 */
export function makeFile(url: string, name?: string): MessageSegment {
    return {
        type: 'file',
        data: { url, name }
    };
}

/**
 * 创建表情片段
 */
export function makeFace(id: string): MessageSegment {
    return {
        type: 'face',
        data: { id }
    };
}

/**
 * 解析用户 ID
 * 
 * @example
 * parseUserId('qq:u:123456') // { platform: 'qq', id: '123456' }
 * parseUserId('tg:u:789012') // { platform: 'tg', id: '789012' }
 */
export function parseUserId(userId: string): { platform: 'qq' | 'tg'; id: string } {
    const parts = userId.split(':');
    if (parts.length < 3) {
        throw new Error(`Invalid userId format: ${userId}`);
    }

    const platform = parts[0] as 'qq' | 'tg';
    const id = parts.slice(2).join(':');

    return { platform, id };
}

/**
 * 解析群组 ID
 * 
 * @example
 * parseGroupId('qq:g:123456') // { platform: 'qq', id: '123456' }
 */
export function parseGroupId(groupId: string): { platform: 'qq' | 'tg'; id: string } {
    const parts = groupId.split(':');
    if (parts.length < 3) {
        throw new Error(`Invalid groupId format: ${groupId}`);
    }

    const platform = parts[0] as 'qq' | 'tg';
    const id = parts.slice(2).join(':');

    return { platform, id };
}

/**
 * 延迟函数
 */
export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 随机整数
 */
export function randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * 随机选择数组元素
 */
export function randomChoice<T>(array: T[]): T {
    return array[randomInt(0, array.length - 1)];
}

// QQ 交互 Helpers
export * from './qq-helpers';
