import { logsRoutes } from '@napgram/web-interfaces';
const plugin = {
    id: 'admin-logs',
    name: 'Admin Logs API',
    version: '1.0.0',
    author: 'NapGram Team',
    description: 'Expose admin logs routes',
    install: async (ctx) => {
        ctx.logger.info('Admin logs API plugin installed');
        ctx.web.registerRoutes((app) => {
            app.register(logsRoutes);
        });
    },
};
export default plugin;
