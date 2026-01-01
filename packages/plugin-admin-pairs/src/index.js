import { pairsRoutes } from '@napgram/web-interfaces';
const plugin = {
    id: 'admin-pairs',
    name: 'Admin Pairs API',
    version: '1.0.0',
    author: 'NapGram Team',
    description: 'Expose admin pair routes',
    install: async (ctx) => {
        ctx.logger.info('Admin pairs API plugin installed');
        ctx.web.registerRoutes((app) => {
            app.register(pairsRoutes);
        });
    },
};
export default plugin;
