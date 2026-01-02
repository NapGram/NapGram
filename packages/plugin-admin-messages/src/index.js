import { messagesRoutes } from '@napgram/web-interfaces';
const plugin = {
    id: 'admin-messages',
    name: 'Admin Messages API',
    version: '1.0.0',
    author: 'NapGram Team',
    description: 'Expose admin message routes',
    install: async (ctx) => {
        ctx.logger.info('Admin messages API plugin installed');
        ctx.web.registerRoutes((app) => {
            app.register(messagesRoutes);
        });
    },
};
export default plugin;
