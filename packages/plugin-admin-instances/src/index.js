import { instancesRoutes } from '@napgram/web-interfaces';
const plugin = {
    id: 'admin-instances',
    name: 'Admin Instances API',
    version: '1.0.0',
    author: 'NapGram Team',
    description: 'Expose admin instance routes',
    install: async (ctx) => {
        ctx.logger.info('Admin instances API plugin installed');
        ctx.web.registerRoutes((app) => {
            app.register(instancesRoutes);
        });
    },
};
export default plugin;
