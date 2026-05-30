/**
 * 模式过滤器类型定义
 */

import type { MessageEvent } from '@napgram/core';

/**
 * 过滤模式
 * - whitelist: 仅允许列表中的群组
 * - blacklist: 拒绝列表中的群组
 */
export type FilterMode = 'whitelist' | 'blacklist';

/**
 * 模式过滤器配置
 */
export interface ModeFilterConfig {
    /**
     * 过滤模式
     */
    mode: FilterMode;
    
    /**
     * QQ 群组列表
     */
    qqGroups?: string[];
    
    /**
     * Telegram 群组列表
     */
    tgGroups?: string[];
    
    /**
     * 是否允许私聊
     * @default true
     */
    allowPrivateChat?: boolean;
}

/**
 * 扩展的模式过滤器配置（包含用户级过滤）
 */
export interface ExtendedModeFilterConfig extends ModeFilterConfig {
    /**
     * QQ 用户列表
     */
    qqUsers?: string[];
    
    /**
     * Telegram 用户列表
     */
    tgUsers?: string[];
}

/**
 * 模式过滤器函数类型
 */
export type ModeFilterFunction = (event: MessageEvent) => boolean;
