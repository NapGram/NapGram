/**
 * QQ 交互 Helper 函数
 * 
 * 提供高级封装，避免插件重复实现逻辑
 */

import type { MessageEvent } from '@napgram/core';

export interface QQInteractionResult {
    success: boolean;
    message: string;
    data?: any;
}

/**
 * 从回复消息或参数中解析目标 QQ 号
 */
export function resolveTargetUser(event: MessageEvent, args: string[]): string | undefined {
    let targetUin: string | undefined;

    // 1. 尝试从回复消息中提取
    if (event.raw?.replyToMessage) {
        const repliedMsg = event.raw.replyToMessage;
        const replyText = repliedMsg.text || '';

        // A. 尝试从文本格式解析：昵称 (QQ号)
        const match = replyText.match(/\((\d+)\)/);
        if (match) {
            targetUin = match[1];
        }

        // B. 尝试从 RichHeader 链接中解析
        if (!targetUin && repliedMsg.entities) {
            for (const entity of repliedMsg.entities) {
                if (entity.type === 'text_link' && entity.url && entity.url.includes('/richHeader/')) {
                    const parts = entity.url.split('/');
                    const uin = parts.pop()?.split('?')[0]; // 去失 query params
                    if (uin && /^\d+$/.test(uin)) {
                        targetUin = uin;
                        break;
                    }
                }
            }
        }
    }

    // 2. 从参数中获取
    if (!targetUin && args.length > 0) {
        // 参数可能是 QQ 号
        const arg = args[0];
        if (/^\d+$/.test(arg)) {
            targetUin = arg;
        }
    }

    return targetUin;
}

/**
 * 查找当前聊天绑定的 QQ 群
 */
export function findBoundQQGroup(event: MessageEvent): { qqGroupId?: string; error?: string } {
    // 只在 Telegram 端处理
    if (event.platform !== 'tg') {
        return { error: '此命令仅在 Telegram 端使用' };
    }

    // 检查 API 可用性
    if (!event.instance || !event.instance.forwardPairs) {
        return { error: 'Instance API 不可用' };
    }

    // 查找绑定
    const forwardMap = event.instance.forwardPairs;
    const pair = forwardMap.findByTG?.(event.channelId, event.threadId, true);

    if (!pair) {
        return { error: '❌ 当前聊天未绑定任何 QQ 群' };
    }

    return { qqGroupId: pair.qqRoomId.toString() };
}

/**
 * 戳一戳
 */
export async function sendPoke(
    event: MessageEvent,
    args: string[]
): Promise<QQInteractionResult> {
    // 查找绑定的 QQ 群
    const { qqGroupId, error } = findBoundQQGroup(event);
    if (error) {
        return { success: false, message: error };
    }

    // 解析目标用户
    const targetUin = resolveTargetUser(event, args);
    if (!targetUin) {
        return {
            success: false,
            message: `❌ 无法识别目标用户\n\n使用方式：\n• 回复目标用户消息：/poke\n• 直接指定：/poke 123456789`
        };
    }

    // 检查 QQ API
    if (!event.qq) {
        return { success: false, message: '❌ QQ Client API 不可用' };
    }

    // 执行戳一戳
    try {
        if (event.qq.sendGroupPoke) {
            await event.qq.sendGroupPoke(qqGroupId!, targetUin);
        } else if (event.qq.callApi) {
            const groupId = Number(qqGroupId);
            const userId = Number(targetUin);

            let lastError: unknown;
            for (const method of ['send_group_poke', 'group_poke']) {
                try {
                    await event.qq.callApi(method, { group_id: groupId, user_id: userId });
                    lastError = undefined;
                    break;
                } catch (error) {
                    lastError = error;
                }
            }

            if (lastError) {
                throw lastError;
            }
        } else {
            return { success: false, message: '❌ 当前QQ客户端不支持戳一戳功能' };
        }

        return {
            success: true,
            message: `👉 已戳一戳 ${targetUin}`
        };
    } catch (error: any) {
        return {
            success: false,
            message: '❌ 发送戳一戳失败'
        };
    }
}

/**
 * 获取/设置群名片
 */
export async function handleNick(
    event: MessageEvent,
    args: string[]
): Promise<QQInteractionResult> {
    // 查找绑定的 QQ 群
    const { qqGroupId, error } = findBoundQQGroup(event);
    if (error) {
        return { success: false, message: error };
    }

    // 检查 QQ API
    if (!event.qq) {
        return { success: false, message: '❌ QQ Client API 不可用' };
    }

    const botUin = event.qq.uin.toString();

    try {
        if (args.length === 0) {
            // 获取当前昵称
            const memberInfo = await event.qq.getGroupMemberInfo?.(qqGroupId!, botUin);
            const card = memberInfo?.card || memberInfo?.nickname || '未设置';
            return {
                success: true,
                message: `📝 当前群名片: \`${card}\`\n\n使用 \`/nick 新名片\` 修改`
            };
        } else {
            // 设置新昵称
            const newCard = args.join(' ');

            if (!event.qq.setGroupCard) {
                return { success: false, message: '❌ 当前QQ客户端不支持修改群名片' };
            }

            await event.qq.setGroupCard(qqGroupId!, botUin, newCard);

            return {
                success: true,
                message: `✅ 已修改群名片为: \`${newCard}\``
            };
        }
    } catch (error: any) {
        return {
            success: false,
            message: '❌ 获取/设置群名片失败'
        };
    }
}

/**
 * 点赞
 */
export async function sendLike(
    event: MessageEvent,
    args: string[]
): Promise<QQInteractionResult> {
    // 只在 Telegram 端处理
    if (event.platform !== 'tg') {
        return { success: false, message: '此命令仅在 Telegram 端使用' };
    }

    // 检查 QQ API
    if (!event.qq) {
        return { success: false, message: '❌ QQ Client API 不可用' };
    }

    // 解析参数：支持 /like QQ号 次数 或 /like 次数 QQ号
    let targetUin: string | undefined;
    let times = 1;

    // 从回复消息中提取
    if (event.raw?.replyToMessage) {
        targetUin = resolveTargetUser(event, []);
        // 第一个参数是次数
        if (args.length > 0 && /^\d+$/.test(args[0])) {
            times = Math.min(Math.max(parseInt(args[0]), 1), 10);
        }
    } else {
        // 从参数中解析
        for (const arg of args) {
            if (/^\d{5,}$/.test(arg)) {
                // 长数字是 QQ 号
                targetUin = arg;
            } else if (/^\d{1,2}$/.test(arg)) {
                // 短数字是次数
                times = Math.min(Math.max(parseInt(arg), 1), 10);
            }
        }
    }

    if (!targetUin) {
        return {
            success: false,
            message: `❌ 无法识别目标用户\n\n使用方式：\n• 回复目标用户的消息：/like [次数]\n• 直接指定：/like 123456789 [次数]\n• 参数顺序可互换：/like 10 123456789`
        };
    }

    // 执行点赞
    try {
        if (!event.qq.sendLike) {
            return { success: false, message: '❌ 当前QQ客户端不支持点赞功能' };
        }

        await event.qq.sendLike(targetUin, times);

        return {
            success: true,
            message: `✅ 已给 ${targetUin} 点赞 x${times}`
        };
    } catch (error: any) {
        return {
            success: false,
            message: `❌ 点赞失败：${error.message || error}`
        };
    }
}

/**
 * 群荣誉
 */
export async function getGroupHonor(
    event: MessageEvent,
    args: string[]
): Promise<QQInteractionResult> {
    // 查找绑定的 QQ 群
    const { qqGroupId, error } = findBoundQQGroup(event);
    if (error) {
        return { success: false, message: error };
    }

    // 检查 QQ API
    if (!event.qq) {
        return { success: false, message: '❌ QQ Client API 不可用' };
    }

    const type = args[0] || 'all';
    const validTypes = ['talkative', 'performer', 'legend', 'strong_newbie', 'emotion', 'all'];

    if (!validTypes.includes(type)) {
        return {
            success: false,
            message: `❌ 无效的类型：${type}\n\n可用类型：${validTypes.join(', ')}`
        };
    }

    try {
        if (!event.qq.getGroupHonorInfo) {
            return { success: false, message: '❌ 当前QQ客户端不支持查询群荣誉' };
        }

        const honorInfo = await event.qq.getGroupHonorInfo(qqGroupId!, type);

        // 格式化输出（简化版）
        let message = `🏆 群荣誉榜单\n\n`;

        if (honorInfo && typeof honorInfo === 'object') {
            message += JSON.stringify(honorInfo, null, 2);
        } else {
            message += '暂无数据';
        }

        return {
            success: true,
            message,
            data: honorInfo
        };
    } catch (error: any) {
        return {
            success: false,
            message: `❌ 查询群荣誉失败：${error.message || error}`
        };
    }
}
