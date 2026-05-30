/**
 * NapGram Plugin Utils
 * 
 * Utility functions for NapGram native plugins
 */

import type { MessageSegment, ForwardMessage } from '@napgram/core';
import { Buffer } from 'node:buffer';
import fs from 'node:fs/promises';
import path from 'node:path';

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
 * 创建合并转发片段
 */
export function makeForward(messages: ForwardMessage[]): MessageSegment {
    return {
        type: 'forward',
        data: { messages }
    };
}

export type ForwardMediaPrepareOptions = {
    tempDir?: string;
    timeoutMs?: number;
    fetchFn?: typeof fetch;
};

type MediaSegment = Extract<MessageSegment, { type: 'image' | 'video' | 'audio' | 'file' }>;

const DEFAULT_TIMEOUT_MS = 30000;
const MEDIA_EXT_BY_TYPE: Record<string, string> = {
    image: '.jpg',
    video: '.mp4',
    audio: '.ogg',
    file: '',
};

function resolveTempDir(tempDir?: string): string {
    const baseDir = tempDir || process.env.DATA_DIR || '/app/data';
    return path.join(baseDir, 'temp');
}

function normalizeExt(value?: string): string {
    if (!value) return '';
    return value.startsWith('.') ? value : `.${value}`;
}

function inferExtFromContentType(contentType?: string): string {
    if (!contentType) return '';
    const normalized = contentType.split(';')[0].trim().toLowerCase();
    switch (normalized) {
        case 'image/jpeg':
        case 'image/jpg':
            return '.jpg';
        case 'image/png':
            return '.png';
        case 'image/webp':
            return '.webp';
        case 'image/gif':
            return '.gif';
        case 'video/mp4':
            return '.mp4';
        case 'audio/ogg':
            return '.ogg';
        case 'audio/mpeg':
            return '.mp3';
        default:
            return '';
    }
}

function inferExtFromUrl(url: string): string {
    try {
        const parsed = new URL(url);
        return normalizeExt(path.extname(parsed.pathname));
    } catch {
        return '';
    }
}

function isHttpUrl(value?: string): boolean {
    return typeof value === 'string' && /^https?:\/\//i.test(value);
}

function buildTempName(prefix: string, ext: string): string {
    const suffix = Math.random().toString(16).slice(2);
    return `${prefix}-${Date.now()}-${suffix}${ext}`;
}

async function downloadToBuffer(url: string, options: ForwardMediaPrepareOptions): Promise<{ buffer: Buffer; contentType?: string }> {
    const fetchFn = options.fetchFn || fetch;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    try {
        const response = await fetchFn(url, { signal: controller.signal });
        if (!response.ok) {
            throw new Error(`Download failed: ${response.status} ${response.statusText}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        return { buffer: Buffer.from(arrayBuffer), contentType: response.headers.get('content-type') || undefined };
    } finally {
        clearTimeout(timeout);
    }
}

async function writeBufferToTemp(buffer: Buffer, options: ForwardMediaPrepareOptions, ext: string, prefix: string): Promise<string> {
    const tempDir = resolveTempDir(options.tempDir);
    await fs.mkdir(tempDir, { recursive: true });
    const name = buildTempName(prefix, ext);
    const filePath = path.join(tempDir, name);
    await fs.writeFile(filePath, buffer);
    return filePath;
}

async function materializeMediaFile(
    type: string,
    data: Record<string, any>,
    options: ForwardMediaPrepareOptions,
): Promise<string | Buffer | undefined> {
    const existingFile = data.file;
    if (typeof existingFile === 'string' && existingFile.startsWith('/')) {
        return existingFile;
    }
    if (Buffer.isBuffer(existingFile)) {
        return existingFile;
    }

    const url = isHttpUrl(existingFile) ? existingFile : isHttpUrl(data.url) ? data.url : undefined;
    if (!url) {
        return undefined;
    }

    const { buffer } = await downloadToBuffer(url, options);
    return buffer;
}

async function prepareForwardSegment(
    segment: MessageSegment,
    options: ForwardMediaPrepareOptions,
): Promise<MessageSegment> {
    if (!segment || typeof segment !== 'object') return segment;
    if (segment.type === 'forward') {
        const nested = Array.isArray(segment.data?.messages) ? segment.data.messages : [];
        const prepared = await prepareForwardMessagesForQQ(nested, options);
        return { ...segment, data: { ...segment.data, messages: prepared } };
    }
    if (!['image', 'video', 'audio', 'file'].includes(segment.type)) {
        return segment;
    }
    const mediaSegment = segment as MediaSegment;
    const data = { ...(mediaSegment.data || {}) } as Record<string, any>;
    const file = await materializeMediaFile(mediaSegment.type, data, options);
    if (file) {
        data.file = file;
        if (data.url) {
            delete data.url;
        }
    }
    return { ...mediaSegment, data } as MessageSegment;
}

/**
 * 将转发消息中的远程媒体下载为本地文件，提升 QQ 合并转发兼容性。
 */
export async function prepareForwardMessagesForQQ(
    messages: ForwardMessage[],
    options: ForwardMediaPrepareOptions = {},
): Promise<ForwardMessage[]> {
    const prepared = await Promise.all((messages || []).map(async (message) => {
        const segments = await Promise.all((message?.segments || []).map(seg => prepareForwardSegment(seg, options)));
        return { ...message, segments };
    }));
    return prepared;
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
export * from './qq-helpers.js';
