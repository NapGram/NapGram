/**
 * NapGram 插件运行时 - 公共 API
 *
 * 原生插件系统的统一入口
 */

import { getLogger } from '@napgram/logger-kit'
import { IPluginRuntime } from '@napgram/runtime-kit'
import type {
  PluginInstanceResolver,
  PluginInstancesResolver,
  PluginSpec,
  PluginWebRouteRegistrar,
} from './core/interfaces.js'
import { getGlobalRuntime as getCoreRuntime } from './core/plugin-runtime.js'
import { loadPluginSpecs } from './internal/config.js' // Ensure config.ts exists in internal

const logger = getLogger('PluginRuntimeAPI')

/**
 * 插件运行时公共 API
 */
export class PluginRuntimeAPI implements IPluginRuntime {
  private get runtime() {
    return getCoreRuntime()
  }

  setWebRoutes(register?: PluginWebRouteRegistrar) {
    this.runtime.setWebRoutes(register)
  }

  private async reloadCommandsForInstances() {
    await this.runtime.reloadCommandsForInstances()
  }

  setInstanceResolvers(
    instanceResolver: PluginInstanceResolver,
    instancesResolver: PluginInstancesResolver,
  ) {
    this.runtime.setInstanceResolvers(instanceResolver, instancesResolver)
  }

  /**
   * 启动插件系统
   */
  async start(options?: { defaultInstances?: number[], webRoutes?: PluginWebRouteRegistrar, builtins?: PluginSpec[] }) {
    logger.info('Starting plugin runtime')

    try {
      if (options?.builtins) {
        this.runtime.setBuiltins(options.builtins)
      }
      if (options?.webRoutes) {
        this.runtime.setWebRoutes(options.webRoutes)
      }
      // 加载插件规范
      const specs = await loadPluginSpecs(this.runtime.getBuiltins())

      logger.debug({ count: specs.length }, 'Plugin specs loaded')

      // 获取全局运行时
      const runtime = this.runtime

      // 启动运行时
      const report = await runtime.start(specs)

      logger.info({
        loaded: report.loaded.length,
        failed: report.failed.length,
      }, 'Plugin runtime started')

      return report
    }
    catch (error) {
      logger.error({ error }, 'Failed to start plugin runtime')
      throw error
    }
  }

  /**
   * 停止插件系统
   */
  async stop() {
    logger.info('Stopping plugin runtime')

    try {
      const runtime = this.runtime
      await runtime.stop()

      logger.info('Plugin runtime stopped')
    }
    catch (error) {
      logger.error({ error }, 'Failed to stop plugin runtime')
      throw error
    }
  }

  /**
   * 重载插件系统
   */
  async reload(_options?: { defaultInstances?: number[] }) {
    logger.info('Reloading plugin runtime')

    try {
      // 加载插件规范
      const specs = await loadPluginSpecs(this.runtime.getBuiltins())

      // 获取全局运行时
      const runtime = this.runtime

      // 重载运行时
      const report = await runtime.reload(specs || [])

      logger.info({
        loaded: report.loaded.length,
        failed: report.failed.length,
      }, 'Plugin runtime reloaded')

      await this.reloadCommandsForInstances()

      return report
    }
    catch (error) {
      logger.error({ error }, 'Failed to reload plugin runtime')
      throw error
    }
  }

  /**
   * 重载单个插件（不重启整个运行时）
   */
  async reloadPlugin(pluginId: string) {
    const id = String(pluginId || '').trim()
    if (!id)
      throw new Error('Missing pluginId')

    const specs = await loadPluginSpecs(this.runtime.getBuiltins())
    const spec = specs.find(s => s.id === id)
    if (!spec) {
      throw new Error(`Plugin spec not found: ${id}`)
    }

    const runtime = this.runtime
    const result = await runtime.reloadPlugin(id, spec.config ?? {})
    await this.reloadCommandsForInstances()
    return result
  }

  /**
   * 获取最后一次报告
   */
  getLastReport() {
    const runtime = this.runtime
    return runtime.getLastReport()
  }

  /**
   * 获取事件总线（用于事件发布）
   */
  getEventBus() {
    const runtime = this.runtime
    return runtime.getEventBus()
  }

  /**
   * Get a plugin instance by ID
   */
  getPlugin(id: string) {
    const runtime = this.runtime
    return runtime.getPlugin(id)
  }

  getInstance(instanceId: number) {
    return this.runtime.getInstance(instanceId)
  }

  getInstances() {
    return this.runtime.getInstances()
  }

  isActive() {
    return this.runtime.isActive()
  }

}

export const PluginRuntime = new PluginRuntimeAPI()

// 导出 getGlobalRuntime 供其他模块使用（如 CommandsFeature）
export { getGlobalRuntime } from './core/plugin-runtime.js'
