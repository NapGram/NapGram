import type { NapGramPlugin, PluginContext } from '@napgram/sdk';
import auth from '../../../main/src/interfaces/auth';

const plugin: NapGramPlugin = {
    id: 'admin-auth',
    name: 'Admin Auth API',
    version: '1.0.0',
    author: 'NapGram Team',
    description: 'Expose admin authentication routes',

    install: async (ctx: PluginContext) => {
        ctx.logger.info('Admin auth API plugin installed');
        ctx.web.registerRoutes((app: any) => {
            app.register(auth);
        });
    },
};

export default plugin;
