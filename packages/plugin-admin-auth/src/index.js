import { authRoutes } from '@napgram/web-interfaces';
const plugin = {
    id: 'admin-auth',
    name: 'Admin Auth API',
    version: '1.0.0',
    author: 'NapGram Team',
    description: 'Expose admin authentication routes',
    install: async (ctx) => {
        ctx.logger.info('Admin auth API plugin installed');
        ctx.web.registerRoutes((app) => {
            app.register(authRoutes);
        });
    },
};
export default plugin;
