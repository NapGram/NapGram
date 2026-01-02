import { databaseRoutes } from '@napgram/web-interfaces';
const plugin = {
    id: 'admin-database',
    name: 'Admin Database API',
    version: '1.0.0',
    author: 'NapGram Team',
    description: 'Expose admin database routes',
    install: async (ctx) => {
        ctx.logger.info('Admin database API plugin installed');
        ctx.web.registerRoutes((app) => {
            app.register(databaseRoutes);
        });
    },
};
export default plugin;
