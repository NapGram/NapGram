/**
 * NapGram 插件生命周期管理
 *
 * 管理插件的安装、卸载、重载等生命周期
 */
import type { NapGramPlugin } from './interfaces';
import type { PluginContextImpl } from './plugin-context';
/**
 * 插件状态
 */
export declare enum PluginState {
    /** 未初始化 */
    Uninitialized = "uninitialized",
    /** 正在安装 */
    Installing = "installing",
    /** 已安装（运行中） */
    Installed = "installed",
    /** 正在卸载 */
    Uninstalling = "uninstalling",
    /** 已卸载 */
    Uninstalled = "uninstalled",
    /** 错误状态 */
    Error = "error"
}
/**
 * 插件实例
 */
export interface PluginInstance {
    /** 插件 ID */
    id: string;
    /** 插件对象 */
    plugin: NapGramPlugin;
    /** 插件上下文 */
    context: PluginContextImpl;
    /** 插件配置 */
    config: any;
    /** 插件状态 */
    state: PluginState;
    /** 错误信息（如果有） */
    error?: Error;
    /** 安装时间 */
    installedAt?: Date;
    /** 卸载时间 */
    uninstalledAt?: Date;
}
/**
 * 生命周期结果
 */
export interface LifecycleResult {
    /** 是否成功 */
    success: boolean;
    /** 错误信息（如果失败） */
    error?: Error;
    /** 执行时间（毫秒） */
    duration: number;
}
/**
 * 插件生命周期管理器
 */
export declare class PluginLifecycleManager {
    /**
     * 安装插件
     *
     * @param instance 插件实例
     * @returns 生命周期结果
     */
    install(instance: PluginInstance): Promise<LifecycleResult>;
    /**
     * 卸载插件
     *
     * @param instance 插件实例
     * @returns 生命周期结果
     */
    uninstall(instance: PluginInstance): Promise<LifecycleResult>;
    /**
     * 重载插件
     *
     * @param instance 插件实例
     * @param newConfig 新配置（可选）
     * @returns 生命周期结果
     */
    reload(instance: PluginInstance, newConfig?: any): Promise<LifecycleResult>;
    /**
     * 批量安装插件
     *
     * @param instances 插件实例列表
     * @returns 安装结果
     */
    installAll(instances: PluginInstance[]): Promise<{
        succeeded: string[];
        failed: Array<{
            id: string;
            error: Error;
        }>;
    }>;
    /**
     * 批量卸载插件
     *
     * @param instances 插件实例列表
     * @returns 卸载结果
     */
    uninstallAll(instances: PluginInstance[]): Promise<{
        succeeded: string[];
        failed: Array<{
            id: string;
            error: Error;
        }>;
    }>;
    /**
     * 验证插件状态
     *
     * @param instance 插件实例
     * @returns 是否健康
     */
    isHealthy(instance: PluginInstance): boolean;
    /**
     * 获取插件统计信息
     *
     * @param instances 插件实例列表
     * @returns 统计信息
     */
    getStats(instances: PluginInstance[]): {
        total: number;
        installed: number;
        error: number;
        uninstalled: number;
    };
}
/**
 * 全局生命周期管理器实例
 */
export declare const lifecycleManager: PluginLifecycleManager;
