import { definePlugin } from '@napgram/sdk';
import type { PluginContext } from '@napgram/sdk';
import Telegram, { telegramClientFactory } from '@napgram/telegram-client';

const plugin = definePlugin({
    id: 'adapter-telegram-mtcute',
    name: 'Telegram Adapter (mtcute)',
    version: '1.0.0',
    author: 'NapGram Team',
    description: 'Provide mtcute-based Telegram adapter',

    install: async (ctx: PluginContext) => {
        telegramClientFactory.register('mtcute', {
            create: async (params) => {
                return Telegram.create({
                    authMode: params.authMode,
                    botToken: params.botToken,
                    botAuthToken: params.botToken,
                }, params.appName || 'NapGram');
            },
            connect: async (params) => {
                return Telegram.connect(params.sessionId, params.appName || 'NapGram', {
                    authMode: params.authMode,
                    botToken: params.botToken,
                    phone: params.phone,
                    code: params.code,
                    password: params.password,
                });
            },
        });
        ctx.logger.info('Telegram mtcute adapter registered');
    },
});

export default plugin;