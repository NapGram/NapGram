import { definePlugin } from '@napgram/sdk';
import type { PluginContext } from '@napgram/sdk';
import type { IQQClient, QQClientCreateParams } from '@napgram/qq-client';
import { QQOfficialAdapter, qqClientFactory } from '@napgram/qq-client';

const plugin = definePlugin({
    id: 'adapter-qq-official',
    name: 'QQ Adapter (Official Bot)',
    version: '1.0.0',
    author: 'NapGram Team',
    description: 'Provide QQ official bot adapter for guild channel messaging',

    install: async (ctx: PluginContext) => {
        qqClientFactory.register('qqofficial', async (params: QQClientCreateParams) => {
            return new QQOfficialAdapter(params as any) as unknown as IQQClient;
        });
        ctx.logger.info('QQ official bot adapter registered');
    },
});

export default plugin;
