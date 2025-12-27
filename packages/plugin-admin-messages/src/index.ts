import type { NapGramPlugin, PluginContext } from '@napgram/sdk';
import messages from '../../../main/src/interfaces/messages';

const plugin: NapGramPlugin = {
    id: 'admin-messages',
    name: 'Admin Messages API',
    version: '1.0.0',
    author: 'NapGram Team',
    description: 'Expose admin message routes',

    install: async (ctx: PluginContext) => {
        ctx.logger.info('Admin messages API plugin installed');
        ctx.web.registerRoutes((app: any) => {
            app.register(messages);
        });
    },
};

export default plugin;
