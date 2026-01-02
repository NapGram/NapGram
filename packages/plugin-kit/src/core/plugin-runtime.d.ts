/**
 * NapGram 插件运行时
 *
 * 插件系统的核心引擎，管理所有插件的加载、运行和状态
 */
import type { PluginSpec } from './interfaces';
import type { PluginInstance } from './lifecycle';
import { IPluginRuntime } from '@napgram/runtime-kit';
import { EventBus } from './event-bus';
import { PluginLifecycleManager } from './lifecycle';
import { PluginLoader, PluginType } from './plugin-loader';
/**
 * 运行时配置
 */
export interface RuntimeConfig {
    /** 事件总线（可选，默认创建新实例） */
    eventBus?: EventBus;
    /** 插件加载器（可选，默认创建新实例） */
    loader?: PluginLoader;
    /** 生命周期管理器（可选，默认创建新实例） */
    lifecycleManager?: PluginLifecycleManager;
    /** API 注入（Phase 3 实现） */
    apis?: {
        message?: any;
        instance?: any;
        user?: any;
        group?: any;
        web?: any;
    };
}
/**
 * 插件运行时报告
 */
export interface RuntimeReport {
    /** 是否启用 */
    enabled: boolean;
    /** 已加载的插件 ID */
    loaded: string[];
    /** 已加载的插件实例（用于命令系统访问） */
    loadedPlugins?: Array<{
        id: string;
        context: any;
        plugin?: {
            id: string;
            name: string;
            version: string;
            description?: string;
            homepage?: string;
            defaultConfig?: any;
        };
    }>;
    /** 加载失败的插件 */
    failed: Array<{
        id: string;
        error: string;
    }>;
    /** 插件类型统计 */
    stats: {
        total: number;
        native: number;
        installed: number;
        error: number;
    };
}
export interface ReloadPluginResult {
    id: string;
    success: boolean;
    error?: string;
}
/**
 * NapGram 插件运行时
 *
 * 单例模式，全局只有一个运行时实例
 */
export declare class PluginRuntime implements IPluginRuntime {
    /** 事件总线 */
    private eventBus;
    /** 插件加载器 */
    private loader;
    /** 生命周期管理器 */
    private lifecycleManager;
    /** 插件注册表 */
    private plugins;
    /** 插件类型映射 */
    private pluginTypes;
    /** 运行时状态 */
    private isRunning;
    /** 最后一次报告 */
    private lastReport;
    /** API 注入 */
    private apis?;
    constructor(config?: RuntimeConfig);
    /**
     * 更新 API 注入（允许在首次创建后再注入）
     */
    setApis(apis?: RuntimeConfig['apis']): void;
    /**
     * 获取事件总线
     */
    getEventBus(): EventBus;
    /**
     * 启动运行时并加载插件
     *
     * @param specs 插件规范列表
     */
    start(specs: PluginSpec[]): Promise<RuntimeReport>;
    /**
     * 停止运行时并卸载所有插件
     */
    stop(): Promise<void>;
    /**
     * 重载运行时
     *
     * @param specs 插件规范列表
     */
    reload(specs: PluginSpec[]): Promise<RuntimeReport>;
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
    reloadPlugin(pluginId: string, newConfig?: any): Promise<ReloadPluginResult>;
    /**
     * 加载单个插件
     *
     * @param spec 插件规范
     * @returns 插件 ID
     */
    private loadPlugin;
    /**
     * 获取插件实例
     *
     * @param id 插件 ID
     * @returns 插件实例（如果存在）
     */
    getPlugin(id: string): PluginInstance | undefined;
    /**
     * 获取所有插件实例
     */
    getAllPlugins(): PluginInstance[];
    /**
     * 获取插件类型
     *
     * @param id 插件 ID
     * @returns 插件类型（如果存在）
     */
    getPluginType(id: string): PluginType | undefined;
    /**
     * 卸载单个插件
     *
     * @param id 插件 ID
     */
    unloadPlugin(id: string): Promise<void>;
    /**
     * 获取统计信息
     */
    getStats(): RuntimeReport['stats'];
    /**
     * 获取最后一次报告
     */
    getLastReport(): RuntimeReport;
    /**
     * 检查运行时是否正在运行
     */
    isActive(): boolean;
}
/**
 * 获取或创建全局运行时实例
 *
 * @param config 运行时配置（仅在首次创建时使用）
 * @returns 全局运行时实例
 */
export declare function getGlobalRuntime(config?: RuntimeConfig): PluginRuntime;
/**
 * 重置全局运行时（用于测试）
 */
export declare function resetGlobalRuntime(): void;
