import { statisticsRoutes } from '@napgram/web-interfaces';
const plugin = {
    id: 'statistics',
    name: 'Statistics',
    version: '1.0.0',
    author: 'NapGram Team',
    description: 'Expose admin statistics endpoints',
    install: async (ctx) => {
        ctx.logger.info('Statistics plugin installed');
        ctx.web.registerRoutes((app) => statisticsRoutes(app));
    },
};
export default plugin;
