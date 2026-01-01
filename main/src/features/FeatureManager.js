import { getLogger } from '../shared/logger';
const logger = getLogger('FeatureManager');
export class FeatureManager {
    instance;
    tgBot;
    qqClient;
    features = new Map();
    initialized = false;
    forward;
    recall;
    media;
    commands;
    constructor(instance, tgBot, qqClient) {
        this.instance = instance;
        this.tgBot = tgBot;
        this.qqClient = qqClient;
        logger.info('FeatureManager 正在初始化...');
    }
    async initialize() {
        try {
            // Set instance to messageConverter for sticker download
            const { messageConverter } = await import('../domain/message');
            messageConverter.setInstance(this.instance);
            logger.debug('✓ MessageConverter instance set');
            logger.info('FeatureManager in plugin-only mode: built-in features disabled');
            this.registerFeature('media', this.instance.mediaFeature);
            this.registerFeature('commands', this.instance.commandsFeature);
            this.registerFeature('forward', this.instance.forwardFeature);
            this.registerFeature('recall', this.instance.recallFeature);
            this.initialized = true;
            logger.info(`FeatureManager 初始化完成，共 ${this.features.size} 个插件功能`);
        }
        catch (error) {
            logger.error('Failed to initialize features:', error);
            throw error;
        }
    }
    registerFeature(name, feature) {
        if (!feature)
            return false;
        if (this.features.has(name))
            return false;
        switch (name) {
            case 'media':
                this.media = feature;
                logger.info('MediaFeature ✓ 已由插件注入');
                break;
            case 'commands':
                this.commands = feature;
                logger.info('CommandsFeature ✓ 已由插件注入');
                break;
            case 'forward':
                this.forward = feature;
                logger.info('ForwardFeature ✓ 已由插件注入');
                break;
            case 'recall':
                this.recall = feature;
                logger.info('RecallFeature ✓ 已由插件注入');
                break;
        }
        this.features.set(name, feature);
        if (this.initialized) {
            logger.info(`FeatureManager 已更新，共 ${this.features.size} 个插件功能`);
        }
        return true;
    }
    enableFeature(name) {
        const feature = this.features.get(name);
        if (!feature) {
            logger.warn(`Feature not found: ${name}`);
            return false;
        }
        logger.info(`Feature enabled: ${name}`);
        return true;
    }
    disableFeature(name) {
        const feature = this.features.get(name);
        if (!feature) {
            logger.warn(`Feature not found: ${name}`);
            return false;
        }
        logger.info(`Feature disabled: ${name}`);
        return true;
    }
    getFeatureStatus() {
        const status = {};
        for (const [name] of this.features) {
            status[name] = true;
        }
        return status;
    }
    async destroy() {
        logger.info('Destroying all features...');
        for (const [name, feature] of this.features) {
            try {
                if (feature.destroy && typeof feature.destroy === 'function') {
                    feature.destroy();
                    logger.debug(`✓ ${name} destroyed`);
                }
            }
            catch (error) {
                logger.error(`Failed to destroy ${name}:`, error);
            }
        }
        this.features.clear();
        logger.info('All features destroyed');
    }
}
export default FeatureManager;
