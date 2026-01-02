import { Instance, RecallFeature } from '@napgram/feature-kit';
const plugin = {
    id: 'recall',
    name: 'Recall Feature',
    version: '1.0.0',
    author: 'NapGram Team',
    description: 'Message recall synchronization feature',
    permissions: {
        instances: [],
    },
    install: async (ctx) => {
        ctx.logger.info('Recall feature plugin installed');
        const attach = (instance) => {
            if (!instance || !instance.qqClient || !instance.tgBot)
                return;
            if (instance.recallFeature)
                return;
            instance.recallFeature = new RecallFeature(instance, instance.tgBot, instance.qqClient);
        };
        const handleStatus = async (event) => {
            if (event.status !== 'starting' && event.status !== 'running')
                return;
            const instance = Instance.instances.find(i => i.id === event.instanceId);
            if (!instance)
                return;
            attach(instance);
        };
        Instance.instances.forEach(attach);
        ctx.on('instance-status', handleStatus);
    },
};
export default plugin;
