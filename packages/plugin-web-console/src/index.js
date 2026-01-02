import { uiRoutes } from '@napgram/web-interfaces';
const plugin = {
    id: 'web-console',
    name: 'Web Console',
    version: '1.0.0',
    author: 'NapGram Team',
    description: 'Serve the NapGram web console UI',
    install: async (ctx) => {
        ctx.logger.info('Web console plugin installed');
        ctx.web.registerRoutes((app) => {
            app.register(uiRoutes);
        });
    },
};
export default plugin;
