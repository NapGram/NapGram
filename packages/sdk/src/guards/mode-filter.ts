/**
 * 模式过滤器 - 黑白名单功能
 * 
 * 提供群组/用户级别的黑白名单过滤功能，支持 QQ 和 Telegram 双平台
 */

import type { MessageEvent, CommandConfig } from '@napgram/core';
import type { ModeFilterConfig, ModeFilterFunction, ExtendedModeFilterConfig } from './types.js';

/**
 * 标准化列表为 Set，提高查询性能
 */
const normalizeList = (list?: string[]): Set<string> => {
    if (!list || !Array.isArray(list)) return new Set();
    return new Set(list.map(item => String(item)));
};

/**
 * 创建模式过滤器函数
 * 
 * @param config 过滤器配置
 * @returns 过滤器函数，返回 true 表示允许，false 表示拒绝
 * 
 * @example
 * ```typescript
 * const filter = createModeFilter({
 *   mode: 'whitelist',
 *   qqGroups: ['123456'],
 *   tgGroups: ['-1001234567890']
 * });
 * 
 * if (filter(event)) {
 *   // 处理消息
 * }
 * ```
 */
export function createModeFilter(config: ModeFilterConfig | ExtendedModeFilterConfig): ModeFilterFunction {
    const allowPrivate = config.allowPrivateChat ?? true;

    // 预处理列表
    const qqGroups = normalizeList(config.qqGroups);
    const tgGroups = normalizeList(config.tgGroups);

    // 扩展配置
    const extConfig = config as ExtendedModeFilterConfig;
    const qqUsers = normalizeList(extConfig.qqUsers);
    const tgUsers = normalizeList(extConfig.tgUsers);

    return (event: MessageEvent): boolean => {
        // 私聊处理
        if (event.channelType === 'private') {
            return allowPrivate;
        }

        // 获取当前平台和 ID
        const isQQ = event.platform === 'qq';
        const isTG = event.platform === 'tg';
        const channelId = String(event.channelId);
        const userId = String(event.sender.userId);

        // 检查群组列表
        const groupList = isQQ ? qqGroups : isTG ? tgGroups : new Set<string>();
        const inGroupList = groupList.has(channelId);

        // 检查用户列表（如果配置了）
        const userList = isQQ ? qqUsers : isTG ? tgUsers : new Set<string>();
        const inUserList = userList.size > 0 && userList.has(userId);

        // 白名单模式：群组或用户在列表中才允许
        if (config.mode === 'whitelist') {
            return inGroupList || inUserList;
        }

        // 黑名单模式：群组和用户都不在列表中才允许
        if (config.mode === 'blacklist') {
            return !inGroupList && !inUserList;
        }

        // 默认允许
        return true;
    };
}

/**
 * 检查事件是否通过模式过滤
 * 
 * @param event 消息事件
 * @param config 过滤器配置，如果未提供则默认允许
 * @returns true 表示允许，false 表示拒绝
 * 
 * @example
 * ```typescript
 * if (isModeEnabled(event, config.modeFilter)) {
 *   // 处理消息
 * }
 * ```
 */
export function isModeEnabled(event: MessageEvent, config?: ModeFilterConfig | ExtendedModeFilterConfig): boolean {
    if (!config) return true;
    const filter = createModeFilter(config);
    return filter(event);
}

/**
 * 为命令处理器添加模式过滤中间件
 * 
 * @param config 过滤器配置
 * @param handler 命令处理器
 * @param silent 是否静默拒绝（不发送提示消息）
 * @returns 包装后的命令处理器
 * 
 * @example
 * ```typescript
 * const handler = withModeFilter(config.modeFilter, async (event, args) => {
 *   await event.reply('Hello!');
 * });
 * ```
 */
export function withModeFilter(
    config: ModeFilterConfig | ExtendedModeFilterConfig | undefined,
    handler: CommandConfig['handler'],
    silent = true
): CommandConfig['handler'] {
    if (!config) return handler;

    const filter = createModeFilter(config);

    return async (event: MessageEvent, args: string[]) => {
        if (!filter(event)) {
            if (!silent) {
                await event.reply('此功能在当前群组不可用');
            }
            return;
        }

        await handler(event, args);
    };
}

/**
 * 为事件处理器添加模式过滤中间件
 * 
 * @param config 过滤器配置
 * @param handler 事件处理器
 * @returns 包装后的事件处理器
 * 
 * @example
 * ```typescript
 * ctx.on('message', withModeFilterMiddleware(config.modeFilter, async (event) => {
 *   // 处理消息
 * }));
 * ```
 */
export function withModeFilterMiddleware(
    config: ModeFilterConfig | ExtendedModeFilterConfig | undefined,
    handler: (event: MessageEvent) => void | Promise<void>
): (event: MessageEvent) => void | Promise<void> {
    if (!config) return handler;

    const filter = createModeFilter(config);

    return async (event: MessageEvent) => {
        if (!filter(event)) return;
        await handler(event);
    };
}
