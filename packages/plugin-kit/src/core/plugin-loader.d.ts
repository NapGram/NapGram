/**
 * NapGram 插件加载器
 *
 * 负责加载和验证插件模块，支持：
 * - ESM 和 CJS 格式
 * - TypeScript 插件（开发模式）
 * - 插件类型检测
 * - 依赖解析
 */
import type { NapGramPlugin, PluginSpec } from './interfaces';
/**
 * 插件类型
 */
export declare enum PluginType {
    /** NapGram 原生插件 */
    Native = "native",
    /** 未知类型 */
    Unknown = "unknown"
}
/**
 * 加载结果
 */
export interface LoadResult {
    /** 插件对象 */
    plugin: NapGramPlugin;
    /** 插件类型 */
    type: PluginType;
    /** 模块路径 */
    modulePath: string;
}
/**
 * 插件加载器
 */
export declare class PluginLoader {
    private buildFileImportUrl;
    /**
     * 加载插件模块
     *
     * @param spec 插件规范
     * @returns 加载结果
     */
    load(spec: PluginSpec): Promise<LoadResult>;
    /**
     * 解析模块路径
     *
     * @param modulePath 模块路径（相对或绝对）
     * @returns 绝对路径
     */
    private resolveModulePath;
    /**
     * 动态导入模块
     *
     * @param modulePath 模块路径
     * @returns 模块对象
     */
    private importModule;
    /**
     * 检测插件类型
     *
     * @param module 模块对象
     * @returns 插件类型
     */
    private detectPluginType;
    /**
     * 判断是否为 NapGram 原生插件
     *
     * @param module 模块对象
     * @returns 是否为原生插件
     */
    private isNativePlugin;
    /**
     * 提取插件对象
     *
     * @param module 模块对象
     * @param spec 插件规范
     * @param type 插件类型
     * @returns 插件对象
     */
    private extractPlugin;
    /**
     * 验证插件
     *
     * @param plugin 插件对象
     * @param expectedId 期望的插件 ID
     */
    private validatePlugin;
    /**
     * 批量加载插件
     *
     * @param specs 插件规范列表
     * @returns 加载结果列表
     */
    loadAll(specs: PluginSpec[]): Promise<LoadResult[]>;
}
/**
 * 全局插件加载器实例
 */
export declare const pluginLoader: PluginLoader;
