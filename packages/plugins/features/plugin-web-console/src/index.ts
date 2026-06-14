import { definePlugin } from '@napgram/sdk';
import type { PluginContext } from '@napgram/sdk';
import { uiRoutes } from '@napgram/web-interfaces';

const plugin = definePlugin({
    id: 'web-console',
    name: 'Web Console',
    version: '1.0.0',
    author: 'NapGram Team',
    description: 'Serve the NapGram web console UI',

    install: async (ctx: PluginContext) => {
        ctx.logger.info('Web console plugin installed');
        ctx.web.registerRoutes((app: any) => {
            app.register(uiRoutes);
        });
    },
});

export default plugin;
