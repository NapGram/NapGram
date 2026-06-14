import type { AppLogger } from '@napgram/logger-kit'
import type Telegram from '@napgram/telegram-client'
import type { CommandsFeature, ForwardFeature, MediaFeature } from '../../features/runtime/index.js'
import type { PersonalUserBotService } from './PersonalUserBotService.js'
import type { IQQClient } from '../../infrastructure/clients/qq'
import type { ForwardMap } from '@napgram/db-kit'
import type { InstanceLifecycleStatus, WorkMode } from '../models/Instance.js'
import { ForwardMap as ForwardMapModel } from '@napgram/db-kit'
import { env } from '@napgram/env-kit'
import { sentry } from '@napgram/logger-kit'
import { messageConverter } from '@napgram/message-kit'
import { getEventPublisher } from '@napgram/plugin-kit'
import { qqClientFactory } from '../../infrastructure/clients/qq'
import { telegramClientFactory } from '../../infrastructure/clients/telegram'
import { bridgeQQEvents } from '../models/services/QQEventBridge.js'
import { enableQQMediaDownloadDiagnostics } from '../models/services/QQMediaDiagnostics.js'

export interface ConnectionSupervisorHost {
  readonly id: number
  readonly log: AppLogger
  readonly qq?: {
    wsUrl?: string
    wsToken?: string
  } | null
  tgBot?: Telegram
  tgUserBot?: Telegram
  qqClient?: IQQClient
  forwardPairs?: ForwardMap
  mediaFeature?: MediaFeature
  commandsFeature?: CommandsFeature
  forwardFeature?: ForwardFeature
  isInit: boolean
  isSetup: boolean
  status: InstanceLifecycleStatus
  botSessionId: number
  hasConfiguredWorkMode(): boolean
  startUserBot(): Promise<void>
  stopUserBot(): Promise<void>
  workMode: WorkMode
}

export class ConnectionSupervisor {
  private initPromise?: Promise<void>

  constructor(
    private readonly host: ConnectionSupervisorHost,
    private readonly personalUserBotService: PersonalUserBotService,
  ) {}

  async login(botToken?: string) {
    if (this.initPromise) {
      return this.initPromise
    }

    this.initPromise = (async () => {
      this.host.status = 'starting'
      this.host.log.debug('TG Bot 正在登录')
      const token = botToken ?? env.TG_BOT_TOKEN
      if (this.host.botSessionId) {
        const tgBot = await telegramClientFactory.connect({
          type: 'mtcute',
          sessionId: this.host.botSessionId,
          authMode: 'bot',
          botToken: token,
          appName: 'NapGram',
        })
        this.host.tgBot = tgBot
      }
      else {
        if (!token) {
          throw new Error('botToken 未指定')
        }
        const tgBot = await telegramClientFactory.create({
          type: 'mtcute',
          authMode: 'bot',
          botToken: token,
          appName: 'NapGram',
        })
        this.host.tgBot = tgBot
        this.host.botSessionId = tgBot.sessionId ?? 0
      }
      this.host.log.info('TG Bot ✓ 登录完成')

      await this.personalUserBotService.initIfNeeded()

      const wsUrl = this.host.qq?.wsUrl || env.NAPCAT_WS_URL
      if (!wsUrl) {
        throw new Error('NapCat WebSocket 地址未配置 (qqBot.wsUrl 或 NAPCAT_WS_URL)')
      }
      const wsToken = this.host.qq?.wsToken || (env as any).NAPCAT_WS_TOKEN

      this.host.log.debug('NapCat 客户端 正在初始化')
      const qqClient = await qqClientFactory.create({
        type: 'napcat',
        wsUrl,
        ...(wsToken ? { token: wsToken } : {}),
        reconnect: true,
      })
      this.host.qqClient = qqClient

      const maxRetries = 3
      const retryDelay = 5000
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          await qqClient.login()
          break
        }
        catch (error) {
          if (attempt >= maxRetries) {
            throw error
          }
          this.host.log.warn(`NapCat 连接失败 (${attempt}/${maxRetries})，${retryDelay / 1000}s 后重试...`)
          await new Promise(resolve => setTimeout(resolve, retryDelay))
        }
      }

      enableQQMediaDownloadDiagnostics(qqClient, this.host.log)
      this.host.log.info('NapCat 客户端 ✓ 初始化完成')

      this.host.forwardPairs = await ForwardMapModel.load(this.host.id)
      messageConverter.setInstance(this.host as any)

      try {
        const eventPublisher = getEventPublisher()
        await eventPublisher.publishInstanceStatus({ instanceId: this.host.id, status: 'starting' })
        bridgeQQEvents(this.host.id, qqClient, eventPublisher, this.host.log, this.host as any)
      }
      catch (error) {
        this.host.log.warn('Plugin event bridge init failed:', error)
      }

      this.host.status = 'running'
      try {
        await getEventPublisher().publishInstanceStatus({ instanceId: this.host.id, status: 'running' })
      }
      catch (error) {
        this.host.log.warn('Failed to publish instance running status:', error)
      }

      qqClient.on('offline', async () => {
        this.host.log.warn('NapCat connection offline (disconnect)')
        this.host.isSetup = false
        if (!this.host.hasConfiguredWorkMode()) {
          return
        }
        try {
          getEventPublisher().publishNotice({
            instanceId: this.host.id,
            platform: 'qq',
            noticeType: 'connection-lost',
            timestamp: Date.now(),
          })
        }
        catch (error) {
          this.host.log.warn('Failed to publish connection-lost notice:', error)
        }
      })

      qqClient.on('online', async () => {
        this.host.log.info('NapCat connection online (connect)')
        this.host.isSetup = true
        if (!this.host.hasConfiguredWorkMode()) {
          return
        }
        try {
          getEventPublisher().publishNotice({
            instanceId: this.host.id,
            platform: 'qq',
            noticeType: 'connection-restored',
            timestamp: Date.now(),
          })
        }
        catch (error) {
          this.host.log.warn('Failed to publish connection-restored notice:', error)
        }
      })

      qqClient.on('connection:lost', async (event: any) => {
        this.host.log.warn('NapCat connection lost:', event)
        this.host.isSetup = false
        if (!this.host.hasConfiguredWorkMode()) {
          return
        }
        try {
          getEventPublisher().publishNotice({
            instanceId: this.host.id,
            platform: 'qq',
            noticeType: 'connection-lost',
            timestamp: typeof event?.timestamp === 'number' ? event.timestamp : Date.now(),
            raw: event,
          })
        }
        catch (error) {
          this.host.log.warn('Failed to publish connection-lost notice:', error)
        }
      })

      qqClient.on('connection:restored', async (event: any) => {
        this.host.log.info('NapCat connection restored:', event)
        this.host.isSetup = true
        if (!this.host.hasConfiguredWorkMode()) {
          return
        }
        try {
          getEventPublisher().publishNotice({
            instanceId: this.host.id,
            platform: 'qq',
            noticeType: 'connection-restored',
            timestamp: typeof event?.timestamp === 'number' ? event.timestamp : Date.now(),
            raw: event,
          })
        }
        catch (error) {
          this.host.log.warn('Failed to publish connection-restored notice:', error)
        }
      })

      this.host.isSetup = true
      this.host.isInit = true
    })()

    this.initPromise
      .then(() => this.host.log.info('Instance ✓ 初始化完成'))
      .catch((err) => {
        this.host.status = 'error'
        this.host.log.error('初始化失败', err)
        void Promise.resolve(
          getEventPublisher().publishInstanceStatus({ instanceId: this.host.id, status: 'error', error: err as Error }),
        )
          .catch((publishError) => {
            this.host.log.warn('Failed to publish instance error status:', publishError)
          })
        sentry.captureException(err, { stage: 'instance-init', instanceId: this.host.id })
      })

    return this.initPromise
  }

  async disposeRuntimeResources() {
    this.host.mediaFeature = undefined
    this.host.commandsFeature = undefined
    this.host.forwardFeature = undefined

    try {
      await (this.host.qqClient as any)?.logout?.()
    }
    catch (error) {
      this.host.log.warn('Failed to disconnect QQ client during cleanup:', error)
    }
    finally {
      this.host.qqClient = undefined
    }

    await this.personalUserBotService.stop()

    try {
      await (this.host.tgBot as any)?.disconnect?.()
    }
    catch (error) {
      this.host.log.warn('Failed to disconnect Telegram client during cleanup:', error)
    }
    finally {
      this.host.tgBot = undefined
    }

    this.host.isSetup = false
    this.host.isInit = false
    this.initPromise = undefined
  }
}
