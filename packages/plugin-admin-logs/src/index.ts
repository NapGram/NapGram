import type { NapGramPlugin, PluginContext } from '@napgram/sdk';
import logs from '../../../main/src/interfaces/logs';

const plugin: NapGramPlugin = {
    id: 'admin-logs',
    name: 'Admin Logs API',
    version: '1.0.0',
    author: 'NapGram Team',
    description: 'Expose admin logs routes',

    install: async (ctx: PluginContext) => {
        ctx.logger.info('Admin logs API plugin installed');
        ctx.web.registerRoutes((app: any) => {
            app.register(logs);
        });
    },
};

export default plugin;
