import { definePlugin } from '@napgram/sdk';
import type { PluginContext } from '@napgram/sdk';
import { messagesRoutes } from '@napgram/web-interfaces';

const plugin = definePlugin({
    id: 'admin-messages',
    name: 'Admin Messages API',
    version: '1.0.0',
    author: 'NapGram Team',
    description: 'Expose admin message routes',

    install: async (ctx: PluginContext) => {
        ctx.logger.info('Admin messages API plugin installed');
        ctx.web.registerRoutes((app: any) => {
            app.register(messagesRoutes);
        });
    },
});

export default plugin;