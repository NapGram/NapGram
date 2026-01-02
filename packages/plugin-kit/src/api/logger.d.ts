/**
 * NapGram 插件日志系统
 *
 * 为每个插件提供独立的日志记录器，自动添加插件标识
 */
import type { PluginLogger } from '../core/interfaces';
/**
 * 创建插件日志记录器
 *
 * @param pluginId 插件 ID
 * @returns 插件日志记录器
 */
export declare function createPluginLogger(pluginId: string): PluginLogger;
