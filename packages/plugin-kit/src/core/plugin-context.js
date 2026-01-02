/**
 * NapGram 插件上下文实现
 *
 * 为每个插件创建独立的运行上下文
 */
import { createPluginLogger } from '../api/logger';
import { createPluginStorage } from '../api/storage';
/**
 * 插件上下文实现
 */
export class PluginContextImpl {
    eventBus;
    pluginId;
    logger;
    config;
    storage;
    // API 实例（将在 Phase 3 实现）
    message;
    instance;
    user;
    group;
    web;
    /** 命令注册表 */
    commands = new Map();
    /** 生命周期钩子 */
    reloadCallbacks = [];
    unloadCallbacks = [];
    constructor(pluginId, config, eventBus, apis) {
        this.eventBus = eventBus;
        this.pluginId = pluginId;
        this.config = config;
        this.logger = createPluginLogger(pluginId);
        this.storage = createPluginStorage(pluginId);
        // 注入 API（如果提供）
        if (apis?.message) {
            this.message = apis.message;
        }
        if (apis?.instance) {
            this.instance = apis.instance;
        }
        if (apis?.user) {
            this.user = apis.user;
        }
        if (apis?.group) {
            this.group = apis.group;
        }
        if (apis?.web) {
            const web = apis.web;
            this.web = {
                registerRoutes: (register) => web.registerRoutes(register, this.pluginId),
            };
        }
        // 如果没有提供完整 API，使用懒加载的占位符
        // 实际 API 将在 Phase 4 时注入
        if (!apis?.message) {
            this.message = this.createMockMessageAPI();
        }
        if (!apis?.instance) {
            this.instance = this.createMockInstanceAPI();
        }
        if (!apis?.user) {
            this.user = this.createMockUserAPI();
        }
        if (!apis?.group) {
            this.group = this.createMockGroupAPI();
        }
        if (!apis?.web) {
            this.web = this.createMockWebAPI();
        }
    }
    createMockMessageAPI() {
        const logger = this.logger;
        return {
            async send() {
                logger.warn('MessageAPI not yet integrated (Phase 4)');
                return { messageId: `mock-${Date.now()}` };
            },
            async recall() {
                logger.warn('MessageAPI not yet integrated (Phase 4)');
            },
            async get() {
                logger.warn('MessageAPI not yet integrated (Phase 4)');
                return null;
            },
        };
    }
    createMockInstanceAPI() {
        const logger = this.logger;
        return {
            async list() {
                logger.warn('InstanceAPI not yet integrated (Phase 4)');
                return [];
            },
            async get() {
                logger.warn('InstanceAPI not yet integrated (Phase 4)');
                return null;
            },
            async getStatus() {
                logger.warn('InstanceAPI not yet integrated (Phase 4)');
                return 'unknown';
            },
        };
    }
    createMockUserAPI() {
        const logger = this.logger;
        return {
            async getInfo() {
                logger.warn('UserAPI not yet integrated (Phase 4)');
                return null;
            },
            async isFriend() {
                logger.warn('UserAPI not yet integrated (Phase 4)');
                return false;
            },
        };
    }
    createMockGroupAPI() {
        const logger = this.logger;
        return {
            async getInfo() {
                logger.warn('GroupAPI not yet integrated (Phase 4)');
                return null;
            },
            async getMembers() {
                logger.warn('GroupAPI not yet integrated (Phase 4)');
                return [];
            },
            async setAdmin() {
                logger.warn('GroupAPI not yet integrated (Phase 4)');
            },
            async muteUser() {
                logger.warn('GroupAPI not yet integrated (Phase 4)');
            },
            async kickUser() {
                logger.warn('GroupAPI not yet integrated (Phase 4)');
            },
        };
    }
    createMockWebAPI() {
        const logger = this.logger;
        return {
            registerRoutes() {
                logger.warn('WebAPI not yet integrated (Phase 3)');
            },
        };
    }
    on(event, handler) {
        return this.eventBus.subscribe(event, handler, undefined, this.pluginId);
    }
    // === 命令注册 ===
    /**
     * 注册命令
     */
    command(config) {
        // 注册主命令名
        this.commands.set(config.name, config);
        // 注册别名
        if (config.aliases) {
            for (const alias of config.aliases) {
                this.commands.set(alias, config);
            }
        }
        this.logger.debug(`Command registered: ${config.name}${config.aliases ? ` (aliases: ${config.aliases.join(', ')})` : ''}`);
        return this;
    }
    /**
     * 获取已注册的命令
     * @internal
     */
    getCommands() {
        return this.commands;
    }
    // === 生命周期钩子 ===
    onReload(callback) {
        this.reloadCallbacks.push(callback);
    }
    onUnload(callback) {
        this.unloadCallbacks.push(callback);
    }
    // === 内部方法（由 PluginRuntime 调用） ===
    /**
     * 触发重载钩子
     * @internal
     */
    async triggerReload() {
        for (const callback of this.reloadCallbacks) {
            try {
                await callback();
            }
            catch (error) {
                this.logger.error('Error in reload callback:', error);
            }
        }
    }
    /**
     * 触发卸载钩子
     * @internal
     */
    async triggerUnload() {
        for (const callback of this.unloadCallbacks) {
            try {
                await callback();
            }
            catch (error) {
                this.logger.error('Error in unload callback:', error);
            }
        }
    }
    /**
     * 清理上下文（移除所有事件订阅和命令）
     * @internal
     */
    cleanup() {
        this.eventBus.removePluginSubscriptions(this.pluginId);
        this.commands.clear();
        this.reloadCallbacks = [];
        this.unloadCallbacks = [];
    }
}
