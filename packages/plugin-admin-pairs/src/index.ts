import type { NapGramPlugin, PluginContext } from '@napgram/sdk';
import pairs from '../../../main/src/interfaces/pairs';

const plugin: NapGramPlugin = {
    id: 'admin-pairs',
    name: 'Admin Pairs API',
    version: '1.0.0',
    author: 'NapGram Team',
    description: 'Expose admin pair routes',

    install: async (ctx: PluginContext) => {
        ctx.logger.info('Admin pairs API plugin installed');
        ctx.web.registerRoutes((app: any) => {
            app.register(pairs);
        });
    },
};

export default plugin;
