/**
 * NapGram 插件存储 API
 *
 * 为每个插件提供独立的数据存储空间（基于文件系统）
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { getLogger } from '@napgram/infra-kit';
const logger = getLogger('PluginStorage');
/**
 * 获取数据目录
 */
function getDataDir() {
    return process.env.DATA_DIR || '/app/data';
}
/**
 * 创建插件存储
 *
 * @param pluginId 插件 ID
 * @returns 插件存储实例
 */
export function createPluginStorage(pluginId) {
    const storageDir = path.join(getDataDir(), 'plugins-data', sanitizePluginId(pluginId));
    return new FileSystemPluginStorage(pluginId, storageDir);
}
/**
 * 清理插件 ID（用作目录名）
 */
function sanitizePluginId(pluginId) {
    return pluginId.replace(/[^\w-]/g, '-');
}
/**
 * 基于文件系统的插件存储实现
 */
class FileSystemPluginStorage {
    pluginId;
    storageDir;
    constructor(pluginId, storageDir) {
        this.pluginId = pluginId;
        this.storageDir = storageDir;
    }
    /**
     * 确保存储目录存在
     */
    async ensureDir() {
        try {
            await fs.mkdir(this.storageDir, { recursive: true });
        }
        catch (error) {
            logger.error({ error, pluginId: this.pluginId }, 'Failed to create storage directory');
            throw error;
        }
    }
    /**
     * 获取文件路径
     */
    getFilePath(key) {
        const safeKey = key.replace(/[^\w-]/g, '-');
        return path.join(this.storageDir, `${safeKey}.json`);
    }
    /**
     * 获取数据
     */
    async get(key) {
        try {
            const filePath = this.getFilePath(key);
            const data = await fs.readFile(filePath, 'utf8');
            return JSON.parse(data);
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                return null;
            }
            logger.error({ error, pluginId: this.pluginId, key }, 'Failed to get data');
            throw error;
        }
    }
    /**
     * 设置数据
     */
    async set(key, value) {
        try {
            await this.ensureDir();
            const filePath = this.getFilePath(key);
            const data = JSON.stringify(value, null, 2);
            await fs.writeFile(filePath, data, 'utf8');
        }
        catch (error) {
            logger.error({ error, pluginId: this.pluginId, key }, 'Failed to set data');
            throw error;
        }
    }
    /**
     * 删除数据
     */
    async delete(key) {
        try {
            const filePath = this.getFilePath(key);
            await fs.unlink(filePath);
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                return; // 文件不存在，视为删除成功
            }
            logger.error({ error, pluginId: this.pluginId, key }, 'Failed to delete data');
            throw error;
        }
    }
    /**
     * 列出所有键
     */
    async keys() {
        try {
            await this.ensureDir();
            const files = await fs.readdir(this.storageDir);
            return files
                .filter(file => file.endsWith('.json'))
                .map(file => file.slice(0, -5)); // 移除 .json 扩展名
        }
        catch (error) {
            logger.error({ error, pluginId: this.pluginId }, 'Failed to list keys');
            throw error;
        }
    }
    /**
     * 清空所有数据
     */
    async clear() {
        try {
            const files = await this.keys();
            await Promise.all(files.map(key => this.delete(key)));
        }
        catch (error) {
            logger.error({ error, pluginId: this.pluginId }, 'Failed to clear data');
            throw error;
        }
    }
}
