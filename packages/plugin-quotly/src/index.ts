import type { NapGramPlugin, PluginContext, MessageEvent } from './types/napgram.js';

const plugin: NapGramPlugin = {
    id: 'quotly',
    name: 'Quotly Plugin',
    version: '1.0.0',
    author: 'NapGram Team',
    description: 'Generates Quotly-style quote images',

    permissions: {
        instances: [],
    },

    install: async (ctx: PluginContext, _config?: any) => {
        ctx.logger.info('Quotly plugin installed');

        ctx.command({
            name: 'q',
            description: '生成 QuotLy 引用图片',
            handler: async (event: MessageEvent, args: string[]) => {
                ctx.logger.info(`Quotly command received from ${event.sender.userName}`);

                // 只在 Telegram 端处理
                if (event.platform !== 'tg') {
                    await event.reply('❌ 此命令目前仅支持 Telegram 端');
                    return;
                }

                const raw = event.raw as any;

                // 检查是否回复了某条消息
                // 优先从 raw.rawReply 获取（我们手动补全的）
                const repliedMsg = raw?.rawReply || raw?.replyToMessage;
                const replyToId = repliedMsg?.id;

                if (!replyToId) {
                    await event.reply('👉 请回复要生成 QuotLy 图片的消息再使用 /q 命令');
                    return;
                }

                try {
                    await event.reply('🎨 正在生成 QuotLy 图片... (暂不可用)');

                    // TODO: 实现实际的 Quotly API 调用
                    // 鉴于目前是迁移阶段，我们先保持原有逻辑的输出

                    await event.reply(
                        `⚠️ QuotLy 功能正在开发中\n\n` +
                        `计划实现方式:\n` +
                        `1. 使用 QuotLy API 生成引用图片\n` +
                        `2. 自定义样式和主题\n` +
                        `3. 支持图片直接返回\n\n` +
                        `敬请期待！`
                    );

                } catch (error) {
                    ctx.logger.error('Failed to handle Quotly command:', error);
                    await event.reply('❌ 生成 QuotLy 图片失败');
                }
            },
        });

        ctx.logger.info('Quotly plugin: All commands registered');
    },

    uninstall: async () => {
    },
};

export default plugin;
