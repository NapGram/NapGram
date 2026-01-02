/**
 * NapGram 插件存储 API
 *
 * 为每个插件提供独立的数据存储空间（基于文件系统）
 */
import type { PluginStorage } from '../core/interfaces';
/**
 * 创建插件存储
 *
 * @param pluginId 插件 ID
 * @returns 插件存储实例
 */
export declare function createPluginStorage(pluginId: string): PluginStorage;
