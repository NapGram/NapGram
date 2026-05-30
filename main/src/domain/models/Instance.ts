import type { AppLogger } from '@napgram/logger-kit'
import type { CommandsFeature, ForwardFeature, MediaFeature, RecallFeature } from '../../features/runtime/index.js'
import type { IQQClient } from '../../infrastructure/clients/qq'
import type Telegram from '../../infrastructure/clients/telegram/client'
import { db, eq, ForwardMap, schema } from '@napgram/db-kit'
import { env } from '@napgram/env-kit'
import { getLogger, sentry } from '@napgram/logger-kit'
import { getEventPublisher } from '@napgram/plugin-kit'
import { FeatureManager } from '../../features/FeatureManager'
import { instanceRegistry } from '../../features/runtime/instance-registry'
import { qqClientFactory } from '../../infrastructure/clients/qq'
import { telegramClientFactory } from '../../infrastructure/clients/telegram'
import { withDbRetry } from './services/db-retry'
import { bridgeQQEvents } from './services/QQEventBridge'
import { enableQQMediaDownloadDiagnostics } from './services/QQMediaDiagnostics'

export type WorkMode = 'personal' | 'group' | 'public'
export type InstanceLifecycleStatus = 'starting' | 'running' | 'stopping' | 'stopped' | 'error'
export type PersonalUserBotStatus = 'disabled' | 'not-configured' | 'starting' | 'running' | 'stopped' | 'error'

export interface PersonalModeDiagnostics {
  workMode: WorkMode
  userBotRequired: boolean
  userSessionId: number | null
  userBotStatus: PersonalUserBotStatus
  hasTgUserBot: boolean
  canAutoProvisionPairs: boolean
  manualPairingAvailable: boolean
  reason?: string
  error?: string
}

export default class Instance {
  private _owner = 0
  private _isSetup = false
  private _workMode = ''
  private _botSessionId = 0
  private _userSessionId: number | null = null
  private _qq: any
  private _flags = 0
  private _userBotStatus: PersonalUserBotStatus = 'disabled'
  private _userBotError?: string

  private readonly log: AppLogger

  public tgBot!: Telegram
  public tgUserBot?: Telegram
  public qqClient?: IQQClient
  public forwardPairs!: ForwardMap
  public mediaFeature?: MediaFeature
  public recallFeature?: RecallFeature
  public commandsFeature?: CommandsFeature
  public forwardFeature?: ForwardFeature
  private featureManager?: FeatureManager
  public isInit = false
  public status: InstanceLifecycleStatus = 'stopped'
  private initPromise?: Promise<void>
  public eventPublisher?: { publishMessageCreated: (...args: any[]) => Promise<void> }

  private constructor(public readonly id: number) {
    this.log = getLogger(`Instance - ${this.id}`)
  }

  private dbRetry<T>(action: () => Promise<T>, context: string) {
    return withDbRetry(action, context, this.log)
  }

  private async load() {
    const dbEntry = await this.dbRetry(
      () => db.query.instance.findFirst({
        where: eq(schema.instance.id, this.id),
        with: { qqBot: true },
      }),
      'load instance',
    )

    if (!dbEntry) {
      if (this.id === 0) {
        // 创建零号实例
        await db.insert(schema.instance).values({ id: 0 })
        return
      }
      else {
        throw new Error('Instance not found')
      }
    }

    this._owner = Number(dbEntry.owner)
    this._qq = dbEntry.qqBot
    this._botSessionId = dbEntry.botSessionId ?? 0
    this._userSessionId = dbEntry.userSessionId ?? null
    this._isSetup = dbEntry.isSetup
    this._workMode = dbEntry.workMode
    this._flags = dbEntry.flags
  }

  private formatError(error: unknown) {
    return String((error as any)?.message || error)
  }

  private async initPersonalUserBotIfNeeded() {
    this._userBotError = undefined

    if (this.workMode !== 'personal') {
      this._userBotStatus = 'disabled'
      return
    }

    if (!this._userSessionId) {
      this._userBotStatus = 'not-configured'
      this.log.warn('Personal mode enabled but userSessionId is not configured; auto pair provisioning is disabled, manual binding remains available')
      return
    }

    this._userBotStatus = 'starting'
    this.log.debug('TG UserBot 正在登录')
    try {
      this.tgUserBot = await telegramClientFactory.connect({
        type: 'mtcute',
        sessionId: this._userSessionId,
        authMode: 'user',
        appName: 'NapGram User',
      })
      this._userBotStatus = 'running'
      this.log.info('TG UserBot ✓ 登录完成')
    }
    catch (error) {
      this._userBotStatus = 'error'
      this._userBotError = this.formatError(error)
      this.log.warn({ error, userSessionId: this._userSessionId }, 'TG UserBot 登录失败；自动建群不可用，手动绑定仍可使用')
      sentry.captureException(error, { stage: 'personal-userbot-init', instanceId: this.id })
    }
  }

  public async startUserBot() {
    if (this.tgUserBot) {
      try {
        await (this.tgUserBot as any).disconnect?.()
      }
      catch (error) {
        this.log.debug({ error }, 'Error disconnecting existing UserBot')
      }
      this.tgUserBot = undefined
    }
    await this.initPersonalUserBotIfNeeded()
  }

  public async stopUserBot() {
    if (this.tgUserBot) {
      try {
        await (this.tgUserBot as any).disconnect?.()
      }
      catch (error) {
        this.log.debug({ error }, 'Error disconnecting UserBot')
      }
      this.tgUserBot = undefined
    }
    this._userBotStatus = this.workMode === 'personal' && this._userSessionId ? 'stopped' : this.workMode === 'personal' ? 'not-configured' : 'disabled'
  }

  private async init(botToken?: string) {
    if (this.initPromise)
      return this.initPromise

    this.initPromise = (async () => {
      this.status = 'starting'
      this.log.debug('TG Bot 正在登录')
      const token = botToken ?? env.TG_BOT_TOKEN
      if (this.botSessionId) {
        this.tgBot = await telegramClientFactory.connect({
          type: 'mtcute',
          sessionId: this._botSessionId,
          authMode: 'bot',
          botToken: token,
          appName: 'NapGram',
        })
      }
      else {
        if (!token) {
          throw new Error('botToken 未指定')
        }
        this.tgBot = await telegramClientFactory.create({
          type: 'mtcute',
          authMode: 'bot',
          botToken: token,
          appName: 'NapGram',
        })
        this.botSessionId = this.tgBot.sessionId ?? 0
      }
      this.log.info('TG Bot ✓ 登录完成')

      await this.initPersonalUserBotIfNeeded()

      const wsUrl = this._qq?.wsUrl || env.NAPCAT_WS_URL
      if (!wsUrl) {
        throw new Error('NapCat WebSocket 地址未配置 (qqBot.wsUrl 或 NAPCAT_WS_URL)')
      }
      const wsToken = this._qq?.wsToken || (env as any).NAPCAT_WS_TOKEN

      this.log.debug('NapCat 客户端 正在初始化')
      this.qqClient = await qqClientFactory.create({
        type: 'napcat',
        wsUrl,
        ...(wsToken ? { token: wsToken } : {}),
        reconnect: true,
      })

      // 重试连接 NapCat，等待其就绪（如扫码登录）
      const maxRetries = 3
      const retryDelay = 5000
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          await this.qqClient.login()
          break
        }
        catch (err) {
          if (attempt >= maxRetries) {
            throw err
          }
          this.log.warn(`NapCat 连接失败 (${attempt}/${maxRetries})，${retryDelay / 1000}s 后重试...`)
          await new Promise(resolve => setTimeout(resolve, retryDelay))
        }
      }

      enableQQMediaDownloadDiagnostics(this.qqClient, this.log)
      this.log.info('NapCat 客户端 ✓ 初始化完成')

      // 仅 NapCat 链路，使用轻量转发表
      this.forwardPairs = await ForwardMap.load(this.id)

      // 插件系统：桥接 QQ 侧事件到插件 EventBus
      try {
        const eventPublisher = getEventPublisher()
        eventPublisher.publishInstanceStatus({ instanceId: this.id, status: 'starting' })
        bridgeQQEvents(this.id, this.qqClient, eventPublisher, this.log)
      }
      catch (error) {
        this.log.warn('Plugin event bridge init failed:', error)
      }

      // 初始化新架构的功能管理器
      // if (this.qqClient) { // Redundant check, login() succeeded above
      this.log.debug('FeatureManager 正在初始化')
      this.featureManager = new FeatureManager(this, this.tgBot, this.qqClient)
      await this.featureManager.initialize()
      this.log.info('FeatureManager ✓ 初始化完成')
      this.status = 'running'
      try {
        getEventPublisher().publishInstanceStatus({ instanceId: this.id, status: 'running' })
      }
      catch (error) {
        this.log.warn('Failed to publish instance running status:', error)
      }

      // 监听掉线/恢复事件，交给插件侧处理通知
      this.qqClient.on('offline', async () => {
        this.log.warn('NapCat connection offline (disconnect)')
        this.isSetup = false
        try {
          getEventPublisher().publishNotice({
            instanceId: this.id,
            platform: 'qq',
            noticeType: 'connection-lost',
            timestamp: Date.now(),
          })
        }
        catch (error) {
          this.log.warn('Failed to publish connection-lost notice:', error)
        }
      })

      this.qqClient.on('online', async () => {
        this.log.info('NapCat connection online (connect)')
        this.isSetup = true
        try {
          getEventPublisher().publishNotice({
            instanceId: this.id,
            platform: 'qq',
            noticeType: 'connection-restored',
            timestamp: Date.now(),
          })
        }
        catch (error) {
          this.log.warn('Failed to publish connection-restored notice:', error)
        }
      })

      // SDK 级别的永久连接丢失/恢复事件
      this.qqClient.on('connection:lost', async (event: any) => {
        this.log.warn('NapCat connection lost:', event)
        this.isSetup = false
        try {
          getEventPublisher().publishNotice({
            instanceId: this.id,
            platform: 'qq',
            noticeType: 'connection-lost',
            timestamp: typeof event?.timestamp === 'number' ? event.timestamp : Date.now(),
            raw: event,
          })
        }
        catch (error) {
          this.log.warn('Failed to publish connection-lost notice:', error)
        }
      })

      this.qqClient.on('connection:restored', async (event: any) => {
        this.log.info('NapCat connection restored:', event)
        this.isSetup = true
        try {
          getEventPublisher().publishNotice({
            instanceId: this.id,
            platform: 'qq',
            noticeType: 'connection-restored',
            timestamp: typeof event?.timestamp === 'number' ? event.timestamp : Date.now(),
            raw: event,
          })
        }
        catch (error) {
          this.log.warn('Failed to publish connection-restored notice:', error)
        }
      })
      // }

      this.isSetup = true
      this.isInit = true
    })()

    this.initPromise
      .then(() => this.log.info('Instance ✓ 初始化完成'))
      .catch((err) => {
        this.status = 'error'
        this.log.error('初始化失败', err)
        try {
          getEventPublisher().publishInstanceStatus({ instanceId: this.id, status: 'error', error: err as Error })
        }
        catch (publishError) {
          this.log.warn('Failed to publish instance error status:', publishError)
        }
        sentry.captureException(err, { stage: 'instance-init', instanceId: this.id })
      })

    return this.initPromise
  }

  private async disposeRuntimeResources() {
    try {
      await this.featureManager?.destroy()
    }
    catch (error) {
      this.log.warn('Failed to destroy feature manager during cleanup:', error)
    }
    finally {
      this.featureManager = undefined
      this.mediaFeature = undefined
      this.commandsFeature = undefined
      this.forwardFeature = undefined
      this.recallFeature = undefined
    }

    try {
      await (this.qqClient as any)?.logout?.()
    }
    catch (error) {
      this.log.warn('Failed to disconnect QQ client during cleanup:', error)
    }
    finally {
      this.qqClient = undefined
    }

    try {
      await (this.tgUserBot as any)?.disconnect?.()
    }
    catch (error) {
      this.log.warn('Failed to disconnect Telegram user bot during cleanup:', error)
    }
    finally {
      this.tgUserBot = undefined
      this._userBotStatus = this.workMode === 'personal' && this._userSessionId ? 'stopped' : this.workMode === 'personal' ? 'not-configured' : 'disabled'
    }

    try {
      await (this.tgBot as any)?.disconnect?.()
    }
    catch (error) {
      this.log.warn('Failed to disconnect Telegram client during cleanup:', error)
    }

    this.isSetup = false
    this.isInit = false
    this.initPromise = undefined
  }

  public async login(botToken?: string) {
    await this.load()
    await this.init(botToken)
  }

  public static async start(instanceId: number, botToken?: string) {
    const instance = new this(instanceId)
    instanceRegistry.add(instance as any)
    try {
      await instance.login(botToken)
      return instance
    }
    catch (error) {
      await instance.disposeRuntimeResources()
      instanceRegistry.remove(instanceId)
      throw error
    }
  }

  public async stop() {
    this.status = 'stopping'
    try {
      getEventPublisher().publishInstanceStatus({ instanceId: this.id, status: 'stopping' })
    }
    catch (error) {
      this.log.warn('Failed to publish instance stopping status:', error)
    }

    await this.disposeRuntimeResources()
    this.status = 'stopped'
    instanceRegistry.remove(this.id)

    try {
      getEventPublisher().publishInstanceStatus({ instanceId: this.id, status: 'stopped' })
    }
    catch (error) {
      this.log.warn('Failed to publish instance stopped status:', error)
    }
  }

  public static async createNew(botToken: string) {
    const entries = await db.insert(schema.instance).values({}).returning({ id: schema.instance.id })
    const dbEntry = entries[0]
    if (!dbEntry) {
      throw new Error('Failed to create instance')
    }
    return await this.start(dbEntry.id, botToken)
  }

  get owner() {
    return this._owner
  }

  get qq() {
    return this._qq
  }

  get qqUin() {
    return this.qqClient?.uin
  }

  get isSetup() {
    return this._isSetup
  }

  get workMode() {
    return this._workMode as WorkMode
  }

  get botMe(): any {
    return this.tgBot.me
  }

  get ownerChat() {
    return undefined
  }

  get botSessionId() {
    return this._botSessionId
  }

  get userSessionId() {
    return this._userSessionId
  }

  get userBotStatus() {
    return this._userBotStatus
  }

  get userBotError() {
    return this._userBotError
  }

  getPersonalModeDiagnostics(): PersonalModeDiagnostics {
    const workMode = this.workMode
    const userBotRequired = workMode === 'personal'
    const hasTgUserBot = Boolean(this.tgUserBot?.isOnline)
    const userBotStatus = userBotRequired ? this._userBotStatus : 'disabled'
    const manualPairingAvailable = Boolean(this.tgBot && this.qqClient)

    return {
      workMode,
      userBotRequired,
      userSessionId: this._userSessionId,
      userBotStatus,
      hasTgUserBot,
      canAutoProvisionPairs: userBotStatus === 'running',
      manualPairingAvailable,
      ...(userBotRequired && !this._userSessionId
        ? { reason: 'personal 模式未配置 TG User session，自动建群不可用；手动绑定仍可使用' }
        : {}),
      ...(this._userBotError ? { error: this._userBotError } : {}),
    }
  }

  get flags() {
    return this._flags
  }

  private updateDb(fields: Record<string, unknown>) {
    void this.dbRetry(
      () => db.update(schema.instance)
        .set(fields)
        .where(eq(schema.instance.id, this.id))
        .then(() => this.log.trace(fields)),
      'update instance',
    ).catch(err => this.log.error({ err, fields }, 'Failed to update instance in DB'))
  }

  set owner(owner: number) {
    this._owner = owner
    this.updateDb({ owner: BigInt(owner) })
  }

  set isSetup(isSetup: boolean) {
    this._isSetup = isSetup
    this.updateDb({ isSetup })
  }

  set workMode(workMode: WorkMode) {
    this._workMode = workMode
    this.updateDb({ workMode })
  }

  set botSessionId(sessionId: number) {
    this._botSessionId = sessionId
    this.updateDb({ botSessionId: sessionId })
  }

  set userSessionId(sessionId: number | null) {
    this._userSessionId = sessionId
    this._userBotStatus = this.workMode === 'personal' && sessionId ? 'stopped' : this.workMode === 'personal' ? 'not-configured' : 'disabled'
    this.updateDb({ userSessionId: sessionId })
  }

  set qqBotId(id: number) {
    if (this._qq)
      this._qq.id = id
    this.updateDb({ qqBotId: id })
  }

  get qqBotId() {
    return this._qq?.id
  }

  set flags(value) {
    this._flags = value
    this.updateDb({ flags: value })
  }
}
