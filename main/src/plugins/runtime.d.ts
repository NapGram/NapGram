/**
 * NapGram 插件运行时 - 公共 API
 *
 * 原生插件系统的统一入口
 */
import { getGlobalRuntime } from './core/plugin-runtime';
/**
 * 插件运行时公共 API
 */
export declare class PluginRuntime {
    private static webRoutes?;
    static setWebRoutes(register?: (appRegister: (app: any) => void, pluginId?: string) => void): void;
    private static reloadCommandsForInstances;
    private static configureApis;
    /**
     * 启动插件系统
     */
    static start(options?: {
        defaultInstances?: number[];
        webRoutes?: (register: (app: any) => void, pluginId?: string) => void;
    }): Promise<import("./core/plugin-runtime").RuntimeReport>;
    /**
     * 停止插件系统
     */
    static stop(): Promise<void>;
    /**
     * 重载插件系统
     */
    static reload(_options?: {
        defaultInstances?: number[];
    }): Promise<import("./core/plugin-runtime").RuntimeReport>;
    /**
     * 重载单个插件（不重启整个运行时）
     */
    static reloadPlugin(pluginId: string): Promise<import("./core/plugin-runtime").ReloadPluginResult>;
    /**
     * 获取最后一次报告
     */
    static getLastReport(): import("./core/plugin-runtime").RuntimeReport;
    /**
     * 获取事件总线（用于事件发布）
     */
    static getEventBus(): import("./core/event-bus").EventBus;
}
export { getGlobalRuntime };
