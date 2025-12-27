import type { NapGramPlugin, PluginContext } from '@napgram/sdk';
import qqAvatar from '../../../main/src/interfaces/qqAvatar';
import telegramAvatar from '../../../main/src/interfaces/telegramAvatar';
import richHeader from '../../../main/src/interfaces/richHeader';
import tempFile from '../../../main/src/interfaces/tempFile';

const plugin: NapGramPlugin = {
    id: 'web-assets',
    name: 'Web Assets',
    version: '1.0.0',
    author: 'NapGram Team',
    description: 'Expose public assets and avatar routes',

    install: async (ctx: PluginContext) => {
        ctx.logger.info('Web assets plugin installed');
        ctx.web.registerRoutes((app: any) => {
            app.register(telegramAvatar);
            app.register(qqAvatar);
            app.register(richHeader);
            app.register(tempFile);
        });
    },
};

export default plugin;
