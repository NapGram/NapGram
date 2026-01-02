/**
 * NapGram 插件运行时 - 公共 API
 *
 * 原生插件系统的统一入口
 */
import { IPluginRuntime, IInstance } from '@napgram/runtime-kit';
import { getGlobalRuntime } from './core/plugin-runtime';
/**
 * 插件运行时公共 API
 */
export declare class PluginRuntimeAPI implements IPluginRuntime {
    private static instance;
    private webRoutes?;
    private instanceResolver?;
    private instancesResolver?;
    private builtins;
    setWebRoutes(register?: (appRegister: (app: any) => void, pluginId?: string) => void): void;
    setInstanceResolvers(instanceResolver: (id: number) => IInstance | undefined, instancesResolver: () => IInstance[]): void;
    private reloadCommandsForInstances;
    private configureApis;
    /**
     * 启动插件系统
     */
    start(options?: {
        defaultInstances?: number[];
        webRoutes?: (register: (app: any) => void, pluginId?: string) => void;
        builtins?: any[];
    }): Promise<import(".").RuntimeReport>;
    /**
     * 停止插件系统
     */
    stop(): Promise<void>;
    /**
     * 重载插件系统
     */
    reload(_options?: {
        defaultInstances?: number[];
    }): Promise<import(".").RuntimeReport>;
    /**
     * 重载单个插件（不重启整个运行时）
     */
    reloadPlugin(pluginId: string): Promise<import(".").ReloadPluginResult>;
    /**
     * 获取最后一次报告
     */
    getLastReport(): import(".").RuntimeReport;
    /**
     * 获取事件总线（用于事件发布）
     */
    getEventBus(): import(".").EventBus;
    /**
     * Get a plugin instance by ID
     */
    getPlugin(id: string): import(".").PluginInstance | undefined;
    isActive(): boolean;
    static getInstance(): PluginRuntimeAPI;
}
export declare const PluginRuntime: PluginRuntimeAPI;
export { getGlobalRuntime };
