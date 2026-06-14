import { definePlugin } from '@napgram/sdk';
import type { PluginContext } from '@napgram/sdk';
import { marketplacesRoutes, pluginsRoutes, permissionsRoutes } from '@napgram/web-interfaces';

const plugin = definePlugin({
    id: 'admin-plugins',
    name: 'Admin Plugins API',
    version: '1.0.0',
    author: 'NapGram Team',
    description: 'Expose admin plugin and marketplace routes',

    install: async (ctx: PluginContext) => {
        ctx.logger.info('Admin plugins API plugin installed');
        ctx.web.registerRoutes((app: any) => {
            app.register(pluginsRoutes);
            app.register(marketplacesRoutes);
            app.register(permissionsRoutes);
        });
    },
});

export default plugin;