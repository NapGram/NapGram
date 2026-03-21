import { CommandsFeature, ForwardFeature, MediaFeature, RecallFeature } from './runtime/index.js'
import { getLogger } from '@napgram/infra-kit'
import type Instance from '../domain/models/Instance'
import type { IQQClient } from '../infrastructure/clients/qq'
import type Telegram from '../infrastructure/clients/telegram/client'

const logger = getLogger('FeatureManager')

type FeatureName = 'media' | 'commands' | 'forward' | 'recall'
type ManagedFeature = MediaFeature | CommandsFeature | ForwardFeature | RecallFeature

export class FeatureManager {
  private features: Map<FeatureName, ManagedFeature> = new Map()
  private initialized = false

  public forward?: ForwardFeature
  public recall?: RecallFeature
  public media?: MediaFeature
  public commands?: CommandsFeature

  constructor(
    private readonly instance: Instance,
    private readonly tgBot: Telegram,
    private readonly qqClient: IQQClient,
  ) {
    logger.info('FeatureManager 正在初始化...')
  }

  async initialize() {
    try {
      const { messageConverter } = await import('../domain/message')
      messageConverter.setInstance(this.instance)
      logger.debug('✓ MessageConverter instance set')

      this.attachFeature('media', () => new MediaFeature(this.instance as any, this.tgBot as any, this.qqClient))
      this.attachFeature('commands', () => new CommandsFeature(this.instance as any, this.tgBot as any, this.qqClient))
      this.attachFeature('forward', () => new ForwardFeature(
        this.instance as any,
        this.tgBot as any,
        this.qqClient,
        this.media,
        this.commands,
      ))
      this.attachFeature('recall', () => new RecallFeature(this.instance as any, this.tgBot as any, this.qqClient))

      this.initialized = true
      logger.info(`FeatureManager 初始化完成，共 ${this.features.size} 个宿主功能`)
    }
    catch (error) {
      logger.error('Failed to initialize features:', error)
      throw error
    }
  }

  registerFeature(
    name: FeatureName,
    feature?: ManagedFeature,
  ) {
    if (!feature) {
      return false
    }
    if (this.features.has(name)) {
      return false
    }

    this.setFeatureReference(name, feature)
    this.features.set(name, feature)

    if (this.initialized) {
      logger.info(`FeatureManager 已更新，共 ${this.features.size} 个宿主功能`)
    }
    return true
  }

  enableFeature(name: string) {
    const feature = this.features.get(name as FeatureName)
    if (!feature) {
      logger.warn(`Feature not found: ${name}`)
      return false
    }
    logger.info(`Feature enabled: ${name}`)
    return true
  }

  disableFeature(name: string) {
    const feature = this.features.get(name as FeatureName)
    if (!feature) {
      logger.warn(`Feature not found: ${name}`)
      return false
    }
    logger.info(`Feature disabled: ${name}`)
    return true
  }

  getFeatureStatus(): Record<string, boolean> {
    const status: Record<string, boolean> = {}
    for (const [name] of this.features) {
      status[name] = true
    }
    return status
  }

  async destroy() {
    logger.info('Destroying all features...')

    const names = [...this.features.keys()].reverse()
    for (const name of names) {
      const feature = this.features.get(name)
      if (!feature) {
        continue
      }

      try {
        if (typeof (feature as any).destroy === 'function') {
          await (feature as any).destroy()
          logger.debug(`✓ ${name} destroyed`)
        }
      }
      catch (error) {
        logger.error(`Failed to destroy ${name}:`, error)
      }
      finally {
        this.clearFeatureReference(name)
        this.features.delete(name)
      }
    }

    this.initialized = false
    logger.info('All features destroyed')
  }

  private attachFeature(name: FeatureName, createFeature: () => ManagedFeature) {
    const existing = this.getExistingFeature(name)
    const feature = existing ?? createFeature()
    const registered = this.registerFeature(name, feature)

    if (!registered) {
      return
    }

    logger.info(`${this.getFeatureLabel(name)} ✓ ${existing ? '复用现有实例' : '已由宿主装配'}`)
  }

  private getExistingFeature(name: FeatureName): ManagedFeature | undefined {
    switch (name) {
      case 'media':
        return this.instance.mediaFeature
      case 'commands':
        return this.instance.commandsFeature
      case 'forward':
        return this.instance.forwardFeature
      case 'recall':
        return this.instance.recallFeature
    }
  }

  private setFeatureReference(name: FeatureName, feature: ManagedFeature) {
    switch (name) {
      case 'media':
        this.media = feature as MediaFeature
        this.instance.mediaFeature = feature as MediaFeature
        break
      case 'commands':
        this.commands = feature as CommandsFeature
        this.instance.commandsFeature = feature as CommandsFeature
        break
      case 'forward':
        this.forward = feature as ForwardFeature
        this.instance.forwardFeature = feature as ForwardFeature
        break
      case 'recall':
        this.recall = feature as RecallFeature
        this.instance.recallFeature = feature as RecallFeature
        break
    }
  }

  private clearFeatureReference(name: FeatureName) {
    switch (name) {
      case 'media':
        this.media = undefined
        this.instance.mediaFeature = undefined
        break
      case 'commands':
        this.commands = undefined
        this.instance.commandsFeature = undefined
        break
      case 'forward':
        this.forward = undefined
        this.instance.forwardFeature = undefined
        break
      case 'recall':
        this.recall = undefined
        this.instance.recallFeature = undefined
        break
    }
  }

  private getFeatureLabel(name: FeatureName) {
    switch (name) {
      case 'media':
        return 'MediaFeature'
      case 'commands':
        return 'CommandsFeature'
      case 'forward':
        return 'ForwardFeature'
      case 'recall':
        return 'RecallFeature'
    }
  }
}

export default FeatureManager
