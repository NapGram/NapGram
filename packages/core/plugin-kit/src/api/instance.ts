/**
 * NapGram 实例 API 实现
 *
 * 提供插件访问实例信息的能力
 */

import type {
  InstanceAPI,
  InstanceInfo,
  InstanceStatus,
  PluginInstancesResolver,
  PluginRuntimeInstance,
} from '../core/interfaces.js'
import { getLogger } from '@napgram/logger-kit'

const logger = getLogger('InstanceAPI')

/**
 * 实例 API 实现
 */
export class InstanceAPIImpl implements InstanceAPI {
  /**
   * 实例列表访问器（Phase 4 注入）
   */
  private instancesResolver?: PluginInstancesResolver

  constructor(instancesResolver?: PluginInstancesResolver) {
    this.instancesResolver = instancesResolver
  }

  /**
   * 获取所有实例
   */
  async list(): Promise<InstanceInfo[]> {
    logger.debug('Listing instances')

    try {
      if (!this.instancesResolver) {
        throw new Error('Instances resolver not configured (Phase 4)')
      }

      const instances = this.instancesResolver()

      // 转换为 InstanceInfo 格式
      const result = instances.map(instance => this.toInstanceInfo(instance))

      logger.debug({ count: result.length }, 'Instances listed')

      return result
    }
    catch (error) {
      logger.error({ error }, 'Failed to list instances')
      throw error
    }
  }

  /**
   * 获取单个实例
   */
  async get(instanceId: number): Promise<InstanceInfo | null> {
    logger.debug({ instanceId }, 'Getting instance')

    try {
      if (!this.instancesResolver) {
        throw new Error('Instances resolver not configured (Phase 4)')
      }

      const instances = this.instancesResolver()
      const instance = instances.find(i => Number(i.id ?? 0) === instanceId)

      if (!instance) {
        logger.debug({ instanceId }, 'Instance not found')
        return null
      }

      return this.toInstanceInfo(instance)
    }
    catch (error) {
      logger.error({ error, instanceId }, 'Failed to get instance')
      throw error
    }
  }

  /**
   * 获取实例状态
   */
  async getStatus(instanceId: number): Promise<InstanceStatus> {
    logger.debug({ instanceId }, 'Getting instance status')

    try {
      if (!this.instancesResolver) {
        throw new Error('Instances resolver not configured (Phase 4)')
      }

      const instances = this.instancesResolver()
      const instance = instances.find(i => Number(i.id ?? 0) === instanceId)

      if (!instance) {
        throw new Error(`Instance ${instanceId} not found`)
      }

      // 提取状态
      const status = this.extractStatus(instance)

      logger.debug({ instanceId, status }, 'Instance status retrieved')

      return status
    }
    catch (error) {
      logger.error({ error, instanceId }, 'Failed to get instance status')
      throw error
    }
  }

  // === 私有方法 ===

  /**
   * 转换为 InstanceInfo 格式
   */
  private toInstanceInfo(instance: PluginRuntimeInstance): InstanceInfo {
    const personalMode = this.extractPersonalModeDiagnostics(instance)
    return {
      id: Number(instance.id ?? 0),
      name: instance.name,
      ownerTgId: this.extractOwnerTgId(instance),
      workMode: instance.workMode,
      status: this.extractStatus(instance),
      hasQqClient: Boolean(instance.qqClient),
      hasTgBot: Boolean(instance.tgBot),
      hasTgUserBot: Boolean(instance.tgUserBot?.isOnline),
      userSessionId: instance.userSessionId ?? personalMode?.userSessionId ?? null,
      userBotStatus: instance.userBotStatus ?? personalMode?.userBotStatus,
      personalMode,
      qqAccount: instance.qqClient?.uin?.toString(),
      tgAccount: instance.tgBot?.username,
      createdAt: instance.createdAt || new Date(),
    }
  }

  private extractOwnerTgId(instance: PluginRuntimeInstance): string | undefined {
    const rawOwner = instance.ownerTgId ?? instance.owner
    if (rawOwner === undefined || rawOwner === null || rawOwner === '') {
      return undefined
    }

    return String(rawOwner)
  }

  private extractPersonalModeDiagnostics(instance: PluginRuntimeInstance): InstanceInfo['personalMode'] {
    if (typeof instance.getPersonalModeDiagnostics === 'function') {
      return instance.getPersonalModeDiagnostics()
    }

    const workMode = instance.workMode
    const userBotRequired = workMode === 'personal'
    const userSessionId = instance.userSessionId ?? null
    const userBotStatus = userBotRequired
      ? (userSessionId ? (instance.userBotStatus ?? 'stopped') : 'not-configured')
      : 'disabled'

    return {
      workMode,
      userBotRequired,
      userSessionId,
      userBotStatus,
      hasTgUserBot: Boolean(instance.tgUserBot?.isOnline),
      canAutoProvisionPairs: userBotStatus === 'running',
      manualPairingAvailable: Boolean(instance.tgBot && instance.qqClient),
      ...(userBotRequired && !userSessionId
        ? { reason: 'personal 模式未配置 TG User session，自动建群不可用；手动绑定仍可使用' }
        : {}),
    }
  }

  /**
   * 提取实例状态
   */
  private extractStatus(instance: PluginRuntimeInstance): InstanceStatus {
    if (typeof instance.status === 'string') {
      switch (instance.status) {
        case 'starting':
        case 'running':
        case 'stopping':
        case 'stopped':
        case 'error':
          return instance.status
      }
    }

    if (instance.starting) {
      return 'starting'
    }

    if (instance.stopping) {
      return 'stopping'
    }

    if (instance.qqClient?.isConnected && instance.tgBot?.isRunning) {
      return 'running'
    }

    if (instance.stopped) {
      return 'stopped'
    }

    return 'error'
  }
}

/**
 * 创建实例 API
 */
export function createInstanceAPI(instancesResolver?: PluginInstancesResolver): InstanceAPI {
  return new InstanceAPIImpl(instancesResolver)
}
