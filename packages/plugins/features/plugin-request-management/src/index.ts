import { definePlugin } from '@napgram/sdk';
import type { PluginContext, MessageEvent } from '@napgram/sdk';
import { db, schema, eq, and, desc, gte, sql } from '@napgram/request-kit';

const plugin = definePlugin({
    id: 'request-management',
    name: 'Request Management',
    version: '1.0.0',
    author: 'NapGram Team',
    description: 'Manage QQ friend/group requests from Telegram',

    permissions: {
        instances: [],
    },

    install: async (ctx: PluginContext, _config?: any) => {
        ctx.logger.info('Request management plugin installed');

        const ensureTelegram = (event: MessageEvent): boolean => {
            return event.platform === 'tg';
        };

        const getInstanceId = (event: MessageEvent): number => {
            const instanceId = (event as any).instance?.id ?? event.instanceId;
            return Number(instanceId || 0);
        };

        const parseSenderId = (event: MessageEvent): bigint => {
            const raw = String(event.sender?.userId || '').trim();
            const parts = raw.split(':');
            const candidate = parts[parts.length - 1] || '';
            const num = Number(candidate);
            return Number.isFinite(num) ? BigInt(num) : BigInt(0);
        };

        const getFilterLabel = (filter?: string): string => {
            if (filter === 'friend') return '好友';
            if (filter === 'group') return '加群';
            return '';
        };

        const replyError = async (event: MessageEvent, message: string) => {
            try {
                await event.reply(message);
            } catch (error) {
                ctx.logger.warn('Failed to reply error message', error);
            }
        };

        const handlePending = async (event: MessageEvent, args: string[]) => {
            try {
                const filter = args[0];
                const instanceId = getInstanceId(event);

                const conditions = [
                    eq(schema.qqRequest.instanceId, instanceId),
                    eq(schema.qqRequest.status, 'pending'),
                ];
                if (filter === 'friend' || filter === 'group') {
                    conditions.push(eq(schema.qqRequest.type, filter));
                }

                const requests = await db.query.qqRequest.findMany({
                    where: and(...conditions),
                    orderBy: [desc(schema.qqRequest.createdAt)],
                    limit: 10,
                });

                if (requests.length === 0) {
                    const label = getFilterLabel(filter);
                    await event.reply(`📭 当前没有待处理的${label}申请`);
                    return;
                }

                const label = getFilterLabel(filter);
                let message = `📬 待处理的${label}申请 (${requests.length})\n\n`;

                for (const req of requests) {
                    const time = new Date(req.createdAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
                    const groupId = req.groupId ? req.groupId.toString() : '';
                    const typeText = req.type === 'friend' ? '好友' : `群(${groupId || '-'})`;
                    const subType = req.subType ? `/${req.subType}` : '';

                    message += `━━━━━━━━━━━━━━━━\n`;
                    message += `📝 ${typeText}${subType} | 用户: ${req.userId}\n`;
                    if (req.comment) message += `💬 ${req.comment}\n`;
                    message += `⏰ ${time}\n`;
                    message += `🔑 /approve ${req.flag}\n`;
                    message += `❌ /reject ${req.flag}\n\n`;
                }

                await event.reply(message.trim());
                ctx.logger.info(`Listed ${requests.length} pending requests`);
            } catch (error: any) {
                ctx.logger.error('Failed to list pending requests:', error);
                await replyError(event, `❌ 查询失败：${error?.message ?? error}`);
            }
        };

        const handleApprove = async (event: MessageEvent, args: string[]) => {
            try {
                const flag = args[0];
                if (!flag) {
                    await event.reply('❌ 请指定请求flag\n\n使用方式：/approve <flag>');
                    return;
                }

                const request = await db.query.qqRequest.findFirst({
                    where: eq(schema.qqRequest.flag, flag),
                });
                if (!request || request.instanceId !== getInstanceId(event)) {
                    await event.reply(`❌ 未找到请求：${flag}`);
                    return;
                }

                if (request.status !== 'pending') {
                    await event.reply(`❌ 该请求已处理（状态：${request.status}）`);
                    return;
                }

                const qqClient = event.qq as any;
                if (!qqClient) throw new Error('QQ客户端不可用');

                if (request.type === 'friend') {
                    if (!qqClient.handleFriendRequest) throw new Error('QQ客户端不支持处理好友申请');
                    await qqClient.handleFriendRequest(flag, true);
                } else if (request.type === 'group') {
                    if (!qqClient.handleGroupRequest) throw new Error('QQ客户端不支持处理加群申请');
                    if (!request.subType) throw new Error('请求缺少 subType，无法处理加群申请');
                    await qqClient.handleGroupRequest(flag, request.subType as 'add' | 'invite', true);
                }

                await db.update(schema.qqRequest)
                    .set({
                        status: 'approved',
                        handledBy: parseSenderId(event),
                        handledAt: new Date(),
                    })
                    .where(eq(schema.qqRequest.id, request.id));

                const typeText = request.type === 'friend' ? '好友' : '加群';
                await event.reply(`✅ 已同意${typeText}申请\n用户：${request.userId}`);
                ctx.logger.info(`Approved ${request.type} request: ${flag}`);
            } catch (error: any) {
                ctx.logger.error('Failed to approve request:', error);
                await replyError(event, `❌ 批准失败：${error?.message ?? error}`);
            }
        };

        const handleReject = async (event: MessageEvent, args: string[]) => {
            try {
                const flag = args[0];
                const reason = args.slice(1).join(' ') || undefined;

                if (!flag) {
                    await event.reply('❌ 请指定请求flag\n\n使用方式：/reject <flag> [理由]');
                    return;
                }

                const request = await db.query.qqRequest.findFirst({
                    where: eq(schema.qqRequest.flag, flag),
                });
                if (!request || request.instanceId !== getInstanceId(event)) {
                    await event.reply(`❌ 未找到请求：${flag}`);
                    return;
                }

                if (request.status !== 'pending') {
                    await event.reply(`❌ 该请求已处理（状态：${request.status}）`);
                    return;
                }

                const qqClient = event.qq as any;
                if (!qqClient) throw new Error('QQ客户端不可用');

                if (request.type === 'friend') {
                    if (!qqClient.handleFriendRequest) throw new Error('QQ客户端不支持处理好友申请');
                    await qqClient.handleFriendRequest(flag, false, reason);
                } else if (request.type === 'group') {
                    if (!qqClient.handleGroupRequest) throw new Error('QQ客户端不支持处理加群申请');
                    if (!request.subType) throw new Error('请求缺少 subType，无法处理加群申请');
                    await qqClient.handleGroupRequest(flag, request.subType as 'add' | 'invite', false, reason);
                }

                await db.update(schema.qqRequest)
                    .set({
                        status: 'rejected',
                        handledBy: parseSenderId(event),
                        handledAt: new Date(),
                        rejectReason: reason,
                    })
                    .where(eq(schema.qqRequest.id, request.id));

                const typeText = request.type === 'friend' ? '好友' : '加群';
                await event.reply(
                    `✅ 已拒绝${typeText}申请\n用户：${request.userId}${reason ? `\n理由：${reason}` : ''}`,
                );
                ctx.logger.info(`Rejected ${request.type} request: ${flag}`);
            } catch (error: any) {
                ctx.logger.error('Failed to reject request:', error);
                await replyError(event, `❌ 拒绝失败：${error?.message ?? error}`);
            }
        };

        const handleRequestStats = async (event: MessageEvent, args: string[]) => {
            try {
                const period = args[0] || 'all';
                const instanceId = getInstanceId(event);

                let startDate: Date | undefined;
                const now = new Date();

                switch (period) {
                    case 'today':
                        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                        break;
                    case 'week':
                        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                        break;
                    case 'month':
                        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                        break;
                    default:
                        startDate = undefined;
                }

                const statsConditions = [eq(schema.qqRequest.instanceId, instanceId)];
                if (startDate) {
                    statsConditions.push(gte(schema.qqRequest.createdAt, startDate));
                }

                const stats = await db.select({
                    type: schema.qqRequest.type,
                    status: schema.qqRequest.status,
                    count: sql<number>`count(${schema.qqRequest.id})`,
                })
                    .from(schema.qqRequest)
                    .where(statsConditions.length > 1 ? and(...statsConditions) : statsConditions[0])
                    .groupBy(schema.qqRequest.type, schema.qqRequest.status);

                const summary = {
                    friend: { total: 0, pending: 0, approved: 0, rejected: 0 },
                    group: { total: 0, pending: 0, approved: 0, rejected: 0 },
                };

                for (const stat of stats) {
                    const count = stat.count;
                    const type = stat.type as 'friend' | 'group';
                    summary[type].total += count;
                    if (stat.status === 'pending') summary[type].pending = count;
                    if (stat.status === 'approved') summary[type].approved = count;
                    if (stat.status === 'rejected') summary[type].rejected = count;
                }

                const periodText = { today: '今天', week: '最近7天', month: '最近30天', all: '全部' }[period] || '全部';
                let message = `📊 请求统计数据（${periodText}）\n\n`;

                const pct = (count: number, total: number) => (total > 0 ? ((count / total) * 100).toFixed(1) : '0.0');

                if (summary.friend.total > 0) {
                    message += `👥 好友申请：\n━━━━━━━━━━━━━━━━\n`;
                    message += `✅ 已批准：${summary.friend.approved} (${pct(summary.friend.approved, summary.friend.total)}%)\n`;
                    message += `❌ 已拒绝：${summary.friend.rejected} (${pct(summary.friend.rejected, summary.friend.total)}%)\n`;
                    message += `⏳ 待处理：${summary.friend.pending} (${pct(summary.friend.pending, summary.friend.total)}%)\n`;
                    message += `📈 总计：${summary.friend.total}\n\n`;
                }

                if (summary.group.total > 0) {
                    message += `🏠 加群申请：\n━━━━━━━━━━━━━━━━\n`;
                    message += `✅ 已批准：${summary.group.approved} (${pct(summary.group.approved, summary.group.total)}%)\n`;
                    message += `❌ 已拒绝：${summary.group.rejected} (${pct(summary.group.rejected, summary.group.total)}%)\n`;
                    message += `⏳ 待处理：${summary.group.pending} (${pct(summary.group.pending, summary.group.total)}%)\n`;
                    message += `📈 总计：${summary.group.total}\n\n`;
                }

                if (summary.friend.total === 0 && summary.group.total === 0) {
                    message += '📭 暂无请求数据';
                }

                if (startDate) {
                    message += `\n📅 时间范围：${startDate.toLocaleDateString('zh-CN')} ~ ${now.toLocaleDateString('zh-CN')}`;
                }

                await event.reply(message.trim());
            } catch (error: any) {
                ctx.logger.error('Failed to get request statistics:', error);
                await replyError(event, `❌ 获取统计数据失败：${error?.message ?? error}`);
            }
        };

        const handleApproveAll = async (event: MessageEvent, args: string[]) => {
            try {
                const filter = args[0];
                const instanceId = getInstanceId(event);

                const conditions = [
                    eq(schema.qqRequest.instanceId, instanceId),
                    eq(schema.qqRequest.status, 'pending'),
                ];
                if (filter === 'friend' || filter === 'group') {
                    conditions.push(eq(schema.qqRequest.type, filter));
                }

                const requests = await db.query.qqRequest.findMany({
                    where: and(...conditions),
                    limit: 50,
                });
                if (requests.length === 0) {
                    await event.reply('📭 没有待处理的请求');
                    return;
                }

                let successCount = 0;
                let failureCount = 0;

                const qqClient = event.qq as any;
                if (!qqClient) throw new Error('QQ客户端不可用');

                for (const request of requests) {
                    try {
                        if (request.type === 'friend') {
                            if (!qqClient.handleFriendRequest) throw new Error('QQ客户端不支持处理好友申请');
                            await qqClient.handleFriendRequest(request.flag, true);
                        } else if (request.type === 'group') {
                            if (!qqClient.handleGroupRequest) throw new Error('QQ客户端不支持处理加群申请');
                            if (!request.subType) throw new Error('请求缺少 subType，无法处理加群申请');
                            await qqClient.handleGroupRequest(request.flag, request.subType as 'add' | 'invite', true);
                        }

                        await db.update(schema.qqRequest)
                            .set({
                                status: 'approved',
                                handledBy: parseSenderId(event),
                                handledAt: new Date(),
                            })
                            .where(eq(schema.qqRequest.id, request.id));
                        successCount++;
                    } catch (error) {
                        ctx.logger.error(`Failed to approve request ${request.flag}:`, error);
                        failureCount++;
                    }
                }

                const typeText = getFilterLabel(filter);
                await event.reply(
                    `✅ 批量批准完成\n\n✅ 成功：${successCount}\n❌ 失败：${failureCount}\n📈 总计：${requests.length}${typeText ? `\n📝 类型：${typeText}申请` : ''}`,
                );
            } catch (error: any) {
                ctx.logger.error('Failed to batch approve:', error);
                await replyError(event, `❌ 批量批准失败：${error?.message ?? error}`);
            }
        };

        const handleRejectAll = async (event: MessageEvent, args: string[]) => {
            try {
                const filter = args[0];
                const reason = args.slice(1).join(' ') || '批量拒绝';
                const instanceId = getInstanceId(event);

                const conditions = [
                    eq(schema.qqRequest.instanceId, instanceId),
                    eq(schema.qqRequest.status, 'pending'),
                ];
                if (filter === 'friend' || filter === 'group') {
                    conditions.push(eq(schema.qqRequest.type, filter));
                }

                const requests = await db.query.qqRequest.findMany({
                    where: and(...conditions),
                    limit: 50,
                });
                if (requests.length === 0) {
                    await event.reply('📭 没有待处理的请求');
                    return;
                }

                let successCount = 0;
                let failureCount = 0;

                const qqClient = event.qq as any;
                if (!qqClient) throw new Error('QQ客户端不可用');

                for (const request of requests) {
                    try {
                        if (request.type === 'friend') {
                            if (!qqClient.handleFriendRequest) throw new Error('QQ客户端不支持处理好友申请');
                            await qqClient.handleFriendRequest(request.flag, false, reason);
                        } else if (request.type === 'group') {
                            if (!qqClient.handleGroupRequest) throw new Error('QQ客户端不支持处理加群申请');
                            if (!request.subType) throw new Error('请求缺少 subType，无法处理加群申请');
                            await qqClient.handleGroupRequest(request.flag, request.subType as 'add' | 'invite', false, reason);
                        }

                        await db.update(schema.qqRequest)
                            .set({
                                status: 'rejected',
                                handledBy: parseSenderId(event),
                                handledAt: new Date(),
                                rejectReason: reason,
                            })
                            .where(eq(schema.qqRequest.id, request.id));
                        successCount++;
                    } catch (error) {
                        ctx.logger.error(`Failed to reject request ${request.flag}:`, error);
                        failureCount++;
                    }
                }

                const typeText = getFilterLabel(filter);
                await event.reply(
                    `✅ 批量拒绝完成\n\n✅ 成功：${successCount}\n❌ 失败：${failureCount}\n📈 总计：${requests.length}${typeText ? `\n📝 类型：${typeText}申请` : ''}\n💬 理由：${reason}`,
                );
            } catch (error: any) {
                ctx.logger.error('Failed to batch reject:', error);
                await replyError(event, `❌ 批量拒绝失败：${error?.message ?? error}`);
            }
        };

        ctx.command({
            name: 'pending',
            aliases: ['待处理'],
            description: '查看待处理的好友/加群申请',
            usage: '/pending [friend|group]',
            adminOnly: true,
            handler: async (event: MessageEvent, args: string[]) => {
                if (!ensureTelegram(event)) return;
                await handlePending(event, args);
            },
        });

        ctx.command({
            name: 'approve',
            aliases: ['同意', '通过'],
            description: '批准好友/加群申请',
            usage: '/approve <flag>',
            adminOnly: true,
            handler: async (event: MessageEvent, args: string[]) => {
                if (!ensureTelegram(event)) return;
                await handleApprove(event, args);
            },
        });

        ctx.command({
            name: 'reject',
            aliases: ['拒绝'],
            description: '拒绝好友/加群申请',
            usage: '/reject <flag> [理由]',
            adminOnly: true,
            handler: async (event: MessageEvent, args: string[]) => {
                if (!ensureTelegram(event)) return;
                await handleReject(event, args);
            },
        });

        ctx.command({
            name: 'reqstats',
            aliases: ['请求统计', '统计'],
            description: '查看请求统计数据',
            usage: '/reqstats [today|week|month|all]',
            adminOnly: true,
            handler: async (event: MessageEvent, args: string[]) => {
                if (!ensureTelegram(event)) return;
                await handleRequestStats(event, args);
            },
        });

        ctx.command({
            name: 'approveall',
            aliases: ['批量批准'],
            description: '批量批准待处理请求',
            usage: '/approveall [friend|group]',
            adminOnly: true,
            handler: async (event: MessageEvent, args: string[]) => {
                if (!ensureTelegram(event)) return;
                await handleApproveAll(event, args);
            },
        });

        ctx.command({
            name: 'rejectall',
            aliases: ['批量拒绝'],
            description: '批量拒绝待处理请求',
            usage: '/rejectall [friend|group] [reason]',
            adminOnly: true,
            handler: async (event: MessageEvent, args: string[]) => {
                if (!ensureTelegram(event)) return;
                await handleRejectAll(event, args);
            },
        });
    },

    uninstall: async () => {},
});

export default plugin;