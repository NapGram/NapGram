import { qqAvatarRoutes, richHeaderRoutes, telegramAvatarRoutes, tempFileRoutes, } from '@napgram/web-interfaces';
const plugin = {
    id: 'web-assets',
    name: 'Web Assets',
    version: '1.0.0',
    author: 'NapGram Team',
    description: 'Expose public assets and avatar routes',
    install: async (ctx) => {
        ctx.logger.info('Web assets plugin installed');
        ctx.web.registerRoutes((app) => {
            app.register(telegramAvatarRoutes);
            app.register(qqAvatarRoutes);
            app.register(richHeaderRoutes);
            app.register(tempFileRoutes);
        });
    },
};
export default plugin;
