import { NapCatAdapter, qqClientFactory } from '@napgram/qq-client';
const plugin = {
    id: 'adapter-qq-napcat',
    name: 'QQ Adapter (NapCat)',
    version: '1.0.0',
    author: 'NapGram Team',
    description: 'Provide NapCat-based QQ adapter',
    install: async (ctx) => {
        qqClientFactory.register('napcat', async (params) => {
            return new NapCatAdapter(params);
        });
        ctx.logger.info('NapCat QQ adapter registered');
    },
};
export default plugin;
