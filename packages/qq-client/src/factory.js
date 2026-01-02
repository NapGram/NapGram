import { getQQClientDependencies, resolveLoggerFactory } from './deps';
function getFactoryLogger() {
    const { loggerFactory } = getQQClientDependencies();
    return resolveLoggerFactory(loggerFactory)('QQClientFactory');
}
export class QQClientFactory {
    creators = new Map();
    async create(params) {
        const logger = getFactoryLogger();
        logger.info(`Creating QQ client of type: ${params.type}`);
        const creator = this.creators.get(params.type);
        if (!creator) {
            throw new Error(`Unknown client type: ${params.type}`);
        }
        return creator(params);
    }
    register(type, creator) {
        const logger = getFactoryLogger();
        if (this.creators.has(type)) {
            logger.warn({ type }, 'QQ client creator already registered, overriding');
        }
        this.creators.set(type, creator);
    }
}
export const qqClientFactory = new QQClientFactory();
