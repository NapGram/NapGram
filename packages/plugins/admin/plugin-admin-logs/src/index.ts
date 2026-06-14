import { definePlugin } from '@napgram/sdk';
import type { PluginContext } from '@napgram/sdk';
import { logsRoutes } from '@napgram/web-interfaces';

const plugin = definePlugin({
    id: 'admin-logs',
    name: 'Admin Logs API',
    version: '1.0.0',
    author: 'NapGram Team',
    description: 'Expose admin logs routes',

    install: async (ctx: PluginContext) => {
        ctx.logger.info('Admin logs API plugin installed');
        ctx.web.registerRoutes((app: any) => {
            app.register(logsRoutes);
        });
    },
});

export default plugin;