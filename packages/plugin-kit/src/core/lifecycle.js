/**
 * NapGram 插件生命周期管理
 *
 * 管理插件的安装、卸载、重载等生命周期
 */
import { getLogger } from '@napgram/infra-kit';
const logger = getLogger('PluginLifecycle');
/**
 * 插件状态
 */
export var PluginState;
(function (PluginState) {
    /** 未初始化 */
    PluginState["Uninitialized"] = "uninitialized";
    /** 正在安装 */
    PluginState["Installing"] = "installing";
    /** 已安装（运行中） */
    PluginState["Installed"] = "installed";
    /** 正在卸载 */
    PluginState["Uninstalling"] = "uninstalling";
    /** 已卸载 */
    PluginState["Uninstalled"] = "uninstalled";
    /** 错误状态 */
    PluginState["Error"] = "error";
})(PluginState || (PluginState = {}));
/**
 * 插件生命周期管理器
 */
export class PluginLifecycleManager {
    /**
     * 安装插件
     *
     * @param instance 插件实例
     * @returns 生命周期结果
     */
    async install(instance) {
        const startTime = Date.now();
        logger.info({ id: instance.id }, 'Installing plugin');
        try {
            // 检查状态
            if (instance.state === PluginState.Installed) {
                throw new Error(`Plugin ${instance.id} is already installed`);
            }
            // 更新状态
            instance.state = PluginState.Installing;
            // 调用插件的 install 方法
            await instance.plugin.install(instance.context, instance.config);
            // 更新状态
            instance.state = PluginState.Installed;
            instance.installedAt = new Date();
            instance.error = undefined;
            const duration = Date.now() - startTime;
            logger.info({ id: instance.id, duration }, 'Plugin installed');
            return { success: true, duration };
        }
        catch (error) {
            instance.state = PluginState.Error;
            instance.error = error;
            const duration = Date.now() - startTime;
            logger.error({ error, id: instance.id, duration }, 'Plugin installation failed');
            return { success: false, error: error, duration };
        }
    }
    /**
     * 卸载插件
     *
     * @param instance 插件实例
     * @returns 生命周期结果
     */
    async uninstall(instance) {
        const startTime = Date.now();
        logger.info({ id: instance.id }, 'Uninstalling plugin');
        try {
            // 检查状态
            if (instance.state === PluginState.Uninstalled) {
                logger.warn({ id: instance.id }, 'Plugin is already uninstalled');
                return { success: true, duration: 0 };
            }
            // 更新状态
            instance.state = PluginState.Uninstalling;
            // 触发卸载钩子
            await instance.context.triggerUnload();
            // 调用插件的 uninstall 方法（如果有）
            if (instance.plugin.uninstall) {
                await instance.plugin.uninstall();
            }
            // 清理上下文（移除所有事件订阅）
            instance.context.cleanup();
            // 更新状态
            instance.state = PluginState.Uninstalled;
            instance.uninstalledAt = new Date();
            const duration = Date.now() - startTime;
            logger.info({ id: instance.id, duration }, 'Plugin uninstalled');
            return { success: true, duration };
        }
        catch (error) {
            instance.state = PluginState.Error;
            instance.error = error;
            const duration = Date.now() - startTime;
            logger.error({ error, id: instance.id, duration }, 'Plugin uninstallation failed');
            return { success: false, error: error, duration };
        }
    }
    /**
     * 重载插件
     *
     * @param instance 插件实例
     * @param newConfig 新配置（可选）
     * @returns 生命周期结果
     */
    async reload(instance, newConfig) {
        const startTime = Date.now();
        logger.info({ id: instance.id }, 'Reloading plugin');
        try {
            // 触发重载钩子
            await instance.context.triggerReload();
            // 调用插件的 reload 方法（如果有）
            if (instance.plugin.reload) {
                await instance.plugin.reload();
            }
            else {
                // 如果插件没有 reload 方法，使用卸载-重装
                await this.uninstall(instance);
                // 更新配置
                if (newConfig !== undefined) {
                    instance.config = newConfig;
                    instance.context.config = newConfig;
                }
                // 重置状态
                instance.state = PluginState.Uninitialized;
                await this.install(instance);
            }
            // 更新配置
            if (newConfig !== undefined) {
                instance.config = newConfig;
                instance.context.config = newConfig;
            }
            const duration = Date.now() - startTime;
            logger.info({ id: instance.id, duration }, 'Plugin reloaded');
            return { success: true, duration };
        }
        catch (error) {
            instance.state = PluginState.Error;
            instance.error = error;
            const duration = Date.now() - startTime;
            logger.error({ error, id: instance.id, duration }, 'Plugin reload failed');
            return { success: false, error: error, duration };
        }
    }
    /**
     * 批量安装插件
     *
     * @param instances 插件实例列表
     * @returns 安装结果
     */
    async installAll(instances) {
        const succeeded = [];
        const failed = [];
        for (const instance of instances) {
            const result = await this.install(instance);
            if (result.success) {
                succeeded.push(instance.id);
            }
            else if (result.error) {
                failed.push({ id: instance.id, error: result.error });
            }
        }
        logger.info({ succeeded: succeeded.length, failed: failed.length }, 'Batch installation completed');
        return { succeeded, failed };
    }
    /**
     * 批量卸载插件
     *
     * @param instances 插件实例列表
     * @returns 卸载结果
     */
    async uninstallAll(instances) {
        const succeeded = [];
        const failed = [];
        // 逆序卸载（后安装的先卸载）
        const reversed = [...instances].reverse();
        for (const instance of reversed) {
            const result = await this.uninstall(instance);
            if (result.success) {
                succeeded.push(instance.id);
            }
            else if (result.error) {
                failed.push({ id: instance.id, error: result.error });
            }
        }
        logger.info({ succeeded: succeeded.length, failed: failed.length }, 'Batch uninstallation completed');
        return { succeeded, failed };
    }
    /**
     * 验证插件状态
     *
     * @param instance 插件实例
     * @returns 是否健康
     */
    isHealthy(instance) {
        return instance.state === PluginState.Installed && !instance.error;
    }
    /**
     * 获取插件统计信息
     *
     * @param instances 插件实例列表
     * @returns 统计信息
     */
    getStats(instances) {
        return {
            total: instances.length,
            installed: instances.filter(i => i.state === PluginState.Installed).length,
            error: instances.filter(i => i.state === PluginState.Error).length,
            uninstalled: instances.filter(i => i.state === PluginState.Uninstalled).length,
        };
    }
}
/**
 * 全局生命周期管理器实例
 */
export const lifecycleManager = new PluginLifecycleManager();
