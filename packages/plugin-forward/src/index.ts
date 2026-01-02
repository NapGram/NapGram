import type { NapGramPlugin, PluginContext, InstanceStatusEvent } from '@napgram/sdk';
import { ForwardFeature, Instance } from '@napgram/feature-kit';

const plugin: NapGramPlugin = {
    id: 'forward',
    name: 'Forward Feature',
    version: '1.0.0',
    author: 'NapGram Team',
    description: 'Message forwarding feature for NapGram',

    permissions: {
        instances: [],
    },

    install: async (ctx: PluginContext) => {
        ctx.logger.info('Forward feature plugin installed');

        const attach = (instance: any) => {
            if (!instance || !instance.qqClient || !instance.tgBot) return;
            if (instance.forwardFeature) return;
            ctx.logger.debug(`Attempting to attach ForwardFeature to instance ${instance.id}`);
            const media = instance.mediaFeature;
            const commands = instance.commandsFeature;
            instance.forwardFeature = new ForwardFeature(instance, instance.tgBot, instance.qqClient, media, commands);
            instance.featureManager?.registerFeature?.('forward', instance.forwardFeature);
            ctx.logger.info(`ForwardFeature attached to instance ${instance.id}`);
        };

        const handleStatus = async (event: InstanceStatusEvent) => {
            ctx.logger.debug(`Received instance-status event: ${event.status} for instance ${event.instanceId}`);
            if (event.status !== 'starting' && event.status !== 'running') return;
            const instance = Instance.instances.find((i: any) => i.id === event.instanceId);
            if (!instance) {
                ctx.logger.warn(`Instance ${event.instanceId} not found in registry during handleStatus`);
                return;
            }
            attach(instance);
        };

        Instance.instances.forEach(attach);
        ctx.on('instance-status', handleStatus);
    },

    uninstall: async () => {
        for (const instance of Instance.instances as any[]) {
            if (instance.forwardFeature) {
                instance.forwardFeature.destroy?.();
                instance.forwardFeature = undefined;
            }
        }
    },
};

export default plugin;
