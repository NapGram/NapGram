/**
 * NapGram 插件运行时
 *
 * 插件系统的核心引擎，管理所有插件的加载、运行和状态
 */
import { getLogger } from '@napgram/infra-kit';
import { EventBus } from './event-bus';
import { PluginLifecycleManager, PluginState } from './lifecycle';
import { PluginContextImpl } from './plugin-context';
import { PluginLoader, PluginType } from './plugin-loader';
const logger = getLogger('PluginRuntime');
/**
 * NapGram 插件运行时
 *
 * 单例模式，全局只有一个运行时实例
 */
export class PluginRuntime {
    /** 事件总线 */
    eventBus;
    /** 插件加载器 */
    loader;
    /** 生命周期管理器 */
    lifecycleManager;
    /** 插件注册表 */
    plugins = new Map();
    /** 插件类型映射 */
    pluginTypes = new Map();
    /** 运行时状态 */
    isRunning = false;
    /** 最后一次报告 */
    lastReport = {
        enabled: false,
        loaded: [],
        failed: [],
        stats: { total: 0, native: 0, installed: 0, error: 0 },
    };
    /** API 注入 */
    apis;
    constructor(config) {
        this.eventBus = config?.eventBus || new EventBus();
        this.loader = config?.loader || new PluginLoader();
        this.lifecycleManager = config?.lifecycleManager || new PluginLifecycleManager();
        this.apis = config?.apis;
        logger.info('PluginRuntime initialized');
    }
    /**
     * 更新 API 注入（允许在首次创建后再注入）
     */
    setApis(apis) {
        this.apis = apis;
    }
    /**
     * 获取事件总线
     */
    getEventBus() {
        return this.eventBus;
    }
    /**
     * 启动运行时并加载插件
     *
     * @param specs 插件规范列表
     */
    async start(specs) {
        if (this.isRunning) {
            logger.warn('PluginRuntime is already running');
            return this.lastReport;
        }
        logger.info({ pluginCount: specs.length }, 'Starting PluginRuntime');
        const report = {
            enabled: true,
            loaded: [],
            failed: [],
            stats: { total: 0, native: 0, installed: 0, error: 0 },
        };
        try {
            // 加载所有插件
            for (const spec of specs) {
                if (!spec.enabled) {
                    const pluginId = spec.id || spec.module;
                    logger.debug({ id: pluginId }, 'Plugin disabled, skipping');
                    continue;
                }
                try {
                    const pluginId = await this.loadPlugin(spec);
                    report.loaded.push(pluginId);
                }
                catch (error) {
                    const pluginId = spec.id || spec.module;
                    const errorMessage = error.message || String(error);
                    report.failed.push({ id: pluginId, error: errorMessage });
                    logger.error({ error, id: pluginId }, 'Failed to load plugin');
                }
            }
            // 安装所有已加载的插件
            const instances = Array.from(this.plugins.values());
            const installResult = await this.lifecycleManager.installAll(instances);
            // 更新报告
            report.stats = this.getStats();
            report.loadedPlugins = instances.map(inst => ({
                id: inst.id,
                context: inst.context,
                plugin: {
                    id: inst.plugin.id,
                    name: inst.plugin.name,
                    version: inst.plugin.version,
                    description: inst.plugin.description,
                    homepage: inst.plugin.homepage,
                    defaultConfig: inst.plugin?.defaultConfig,
                },
            }));
            this.isRunning = true;
            this.lastReport = report;
            logger.info({
                loaded: report.loaded.length,
                failed: report.failed.length,
                installed: installResult.succeeded.length,
            }, 'PluginRuntime started');
            return report;
        }
        catch (error) {
            logger.error({ error }, 'Failed to start PluginRuntime');
            throw error;
        }
    }
    /**
     * 停止运行时并卸载所有插件
     */
    async stop() {
        if (!this.isRunning) {
            logger.warn('PluginRuntime is not running');
            return;
        }
        logger.info('Stopping PluginRuntime');
        try {
            // 卸载所有插件
            const instances = Array.from(this.plugins.values());
            await this.lifecycleManager.uninstallAll(instances);
            // 清理
            this.plugins.clear();
            this.pluginTypes.clear();
            this.eventBus.clear();
            this.isRunning = false;
            logger.info('PluginRuntime stopped');
        }
        catch (error) {
            logger.error({ error }, 'Failed to stop PluginRuntime');
            throw error;
        }
    }
    /**
     * 重载运行时
     *
     * @param specs 插件规范列表
     */
    async reload(specs) {
        logger.info('Reloading PluginRuntime');
        await this.stop();
        return await this.start(specs);
    }
    /**
     * 重载单个插件（不重启整个运行时）
     *
     * 适用场景：
     * - 仅更新插件配置
     * - 插件自带 reload() 逻辑或可卸载-重装
     *
     * 不适用：
     * - 模块文件变更且依赖 ESM import cache 刷新（此类场景建议全量 reload）
     */
    async reloadPlugin(pluginId, newConfig) {
        if (!this.isRunning) {
            return { id: pluginId, success: false, error: 'PluginRuntime is not running' };
        }
        const instance = this.plugins.get(pluginId);
        if (!instance) {
            return { id: pluginId, success: false, error: `Plugin not loaded: ${pluginId}` };
        }
        const result = await this.lifecycleManager.reload(instance, newConfig);
        if (!result.success) {
            return { id: pluginId, success: false, error: result.error?.message || 'Unknown error' };
        }
        this.eventBus.publishSync('plugin-reload', { pluginId, timestamp: Date.now() });
        return { id: pluginId, success: true };
    }
    /**
     * 加载单个插件
     *
     * @param spec 插件规范
     * @returns 插件 ID
     */
    async loadPlugin(spec) {
        // 加载插件模块
        const loadResult = await this.loader.load(spec);
        // 使用 spec.id 作为运行时插件 ID（便于配置/管理一致性）
        const pluginId = spec.id || loadResult.plugin.id;
        if (!pluginId) {
            throw new Error(`Plugin id is required (module: ${spec.module})`);
        }
        // 保障 plugin.id 与运行时 ID 一致（插件内部若依赖 ctx.pluginId / storage 目录）
        if (loadResult.plugin.id !== pluginId) {
            logger.warn({ expected: pluginId, actual: loadResult.plugin.id }, 'Plugin ID mismatch; overriding plugin.id with spec.id');
            loadResult.plugin.id = pluginId;
        }
        // 检查是否已加载
        if (this.plugins.has(pluginId)) {
            throw new Error(`Plugin ${pluginId} is already loaded`);
        }
        // 创建插件上下文
        const context = new PluginContextImpl(pluginId, spec.config || {}, this.eventBus, this.apis);
        // 创建插件实例
        const instance = {
            id: pluginId,
            plugin: loadResult.plugin,
            context,
            config: spec.config || {},
            state: PluginState.Uninitialized,
        };
        // 注册插件
        this.plugins.set(pluginId, instance);
        this.pluginTypes.set(pluginId, loadResult.type);
        logger.debug({ id: pluginId, type: loadResult.type }, 'Plugin loaded');
        return pluginId;
    }
    /**
     * 获取插件实例
     *
     * @param id 插件 ID
     * @returns 插件实例（如果存在）
     */
    getPlugin(id) {
        return this.plugins.get(id);
    }
    /**
     * 获取所有插件实例
     */
    getAllPlugins() {
        return Array.from(this.plugins.values());
    }
    /**
     * 获取插件类型
     *
     * @param id 插件 ID
     * @returns 插件类型（如果存在）
     */
    getPluginType(id) {
        return this.pluginTypes.get(id);
    }
    /**
     * 卸载单个插件
     *
     * @param id 插件 ID
     */
    async unloadPlugin(id) {
        const instance = this.plugins.get(id);
        if (!instance) {
            throw new Error(`Plugin ${id} not found`);
        }
        await this.lifecycleManager.uninstall(instance);
        this.plugins.delete(id);
        this.pluginTypes.delete(id);
        logger.info({ id }, 'Plugin unloaded');
    }
    /**
     * 获取统计信息
     */
    getStats() {
        const instances = Array.from(this.plugins.values());
        return {
            total: instances.length,
            native: Array.from(this.pluginTypes.values()).filter(t => t === PluginType.Native).length,
            installed: instances.filter(i => i.state === PluginState.Installed).length,
            error: instances.filter(i => i.state === PluginState.Error).length,
        };
    }
    /**
     * 获取最后一次报告
     */
    getLastReport() {
        return this.lastReport;
    }
    /**
     * 检查运行时是否正在运行
     */
    isActive() {
        return this.isRunning;
    }
}
/**
 * 全局插件运行时实例
 */
let globalRuntime = null;
/**
 * 获取或创建全局运行时实例
 *
 * @param config 运行时配置（仅在首次创建时使用）
 * @returns 全局运行时实例
 */
export function getGlobalRuntime(config) {
    if (!globalRuntime) {
        globalRuntime = new PluginRuntime(config);
    }
    if (config?.apis) {
        globalRuntime.setApis(config.apis);
    }
    return globalRuntime;
}
/**
 * 重置全局运行时（用于测试）
 */
export function resetGlobalRuntime() {
    globalRuntime = null;
}
