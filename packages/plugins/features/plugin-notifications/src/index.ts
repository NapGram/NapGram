import { definePlugin } from '@napgram/sdk';
import type { NoticeEvent, PluginContext } from '@napgram/sdk';
import type { AdminIdentityValue } from '@napgram/env-kit';

const DEFAULT_COOLDOWN_MS = 1000 * 60 * 60;

type NotificationsConfig = {
    enabled?: boolean;
    systemOwners?: {
        qq?: AdminIdentityValue;
        tg?: AdminIdentityValue;
    };
    adminQQ?: AdminIdentityValue;
    adminTG?: AdminIdentityValue;
    cooldownMs?: number;
};

function normalizeCooldownMs(value?: number): number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0
        ? value
        : DEFAULT_COOLDOWN_MS;
}

function buildBackoffIntervals(cooldownMs: number): number[] {
    return [
        0,
        Math.round(cooldownMs / 60),
        Math.round(cooldownMs / 30),
        Math.round(cooldownMs / 12),
        Math.round(cooldownMs / 6),
        Math.round(cooldownMs / 2),
        cooldownMs,
    ];
}

const plugin = definePlugin({
    id: 'notifications',
    name: 'Notifications',
    version: '1.0.0',
    author: 'NapGram Team',
    description: 'Send admin notifications for connection events',

    install: async (ctx: PluginContext, config?: NotificationsConfig) => {
        const enabled = config?.enabled !== false;
        if (!enabled) {
            ctx.logger.info('Notifications plugin disabled');
            return;
        }

        const systemOwners = config?.systemOwners ?? {
            qq: config?.adminQQ,
            tg: config?.adminTG,
        };
        const adminQQ = normalizeId(systemOwners.qq);
        const adminTG = normalizeId(systemOwners.tg);
        const cooldownMs = normalizeCooldownMs(config?.cooldownMs);

        const BACKOFF_INTERVALS = buildBackoffIntervals(cooldownMs);
        const RESET_THRESHOLD = cooldownMs * 2;

        let backoffLevel = 0;
        let lastNotifyTime = 0;
        let isNotifiedDown = false;

        if (!adminQQ && !adminTG) {
            ctx.logger.warn('Notifications disabled: no admin targets configured');
            return;
        }

        ctx.on('notice', async (event: NoticeEvent) => {
            if (event.noticeType !== 'connection-lost' && event.noticeType !== 'connection-restored') {
                return;
            }

            const now = Date.now();

            if (event.noticeType === 'connection-lost') {
                if (now - lastNotifyTime > RESET_THRESHOLD) {
                    backoffLevel = 0;
                }

                const requiredWait = BACKOFF_INTERVALS[Math.min(backoffLevel, BACKOFF_INTERVALS.length - 1)];

                if (now - lastNotifyTime < requiredWait) {
                    ctx.logger.debug(`Notification suppressed (Backoff: Level ${backoffLevel}, Wait ${requiredWait}ms)`);
                    isNotifiedDown = false;
                    return;
                }

                backoffLevel++;
                lastNotifyTime = now;
                isNotifiedDown = true;
            }

            if (event.noticeType === 'connection-restored') {
                if (!isNotifiedDown) {
                    ctx.logger.debug('Restored notification suppressed because loss was silent');
                    return;
                }
                isNotifiedDown = false;
            }

            const time = new Date(event.timestamp || now).toLocaleString('zh-CN', {
                timeZone: 'Asia/Shanghai',
                hour12: false,
            });

            const message = event.noticeType === 'connection-lost'
                ? `⚠️ NapCat 连接已断开\n时间: ${time}\n\n系统将自动尝试重连...`
                : `✅ NapCat 连接已恢复\n时间: ${time}`;

            await sendAdminNotifications(ctx, event.instanceId, adminQQ, adminTG, message);
        });

        ctx.logger.info('Notifications plugin installed');
    },
});

function normalizeId(input?: AdminIdentityValue): string | undefined {
    if (input === undefined || input === null) {
        return undefined;
    }
    const value = String(input).trim();
    return value ? value : undefined;
}

async function sendAdminNotifications(
    ctx: PluginContext,
    instanceId: number,
    adminQQ: string | undefined,
    adminTG: string | undefined,
    message: string,
) {
    if (adminQQ) {
        try {
            await ctx.message.send({
                instanceId,
                channelId: `qq:private:${adminQQ}`,
                content: message,
            });
            ctx.logger.info(`Notification sent to QQ admin: ${adminQQ}`);
        }
        catch (error) {
            ctx.logger.warn(`Failed to send QQ notification to ${adminQQ}`, error);
        }
    }

    if (adminTG) {
        try {
            await ctx.message.send({
                instanceId,
                channelId: `tg:${adminTG}`,
                content: message,
            });
            ctx.logger.info(`Notification sent to TG admin: ${adminTG}`);
        }
        catch (error) {
            ctx.logger.warn(`Failed to send TG notification to ${adminTG}`, error);
        }
    }
}

export default plugin;
