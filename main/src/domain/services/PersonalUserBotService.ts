import type { AppLogger } from '@napgram/logger-kit'
import type Telegram from '@napgram/telegram-client'
import type { PersonalModeDiagnostics, PersonalUserBotStatus, WorkMode } from '../models/Instance.js'
import { sentry } from '@napgram/logger-kit'
import { telegramClientFactory } from '../../infrastructure/clients/telegram'

export interface PersonalUserBotHost {
  readonly id: number
  readonly log: AppLogger
  readonly workMode: WorkMode
  readonly userSessionId: number | null
  tgUserBot?: Telegram
  tgBot?: Telegram
  qqClient?: unknown
  userBotStatus: PersonalUserBotStatus
  userBotError?: string
  setUserBotState(status: PersonalUserBotStatus, error?: string): void
}

export class PersonalUserBotService {
  constructor(private readonly host: PersonalUserBotHost) {}

  async initIfNeeded() {
    if (this.host.userBotError !== undefined) {
      this.host.setUserBotState(this.host.userBotStatus, undefined)
    }

    if (this.host.workMode !== 'personal') {
      this.host.setUserBotState('disabled')
      return
    }

    if (!this.host.userSessionId) {
      this.host.setUserBotState('not-configured')
      this.host.log.warn('Personal mode enabled but userSessionId is not configured; auto pair provisioning is disabled, manual binding remains available')
      return
    }

    this.host.setUserBotState('starting')
    this.host.log.debug('TG UserBot 正在登录')
    try {
      this.host.tgUserBot = await telegramClientFactory.connect({
        type: 'mtcute',
        sessionId: this.host.userSessionId,
        authMode: 'user',
        appName: 'NapGram User',
      })
      this.host.setUserBotState('running')
      this.host.log.info('TG UserBot ✓ 登录完成')
    }
    catch (error) {
      this.host.tgUserBot = undefined
      const message = this.formatError(error)
      this.host.setUserBotState('error', message)
      this.host.log.warn({ error, userSessionId: this.host.userSessionId }, 'TG UserBot 登录失败；自动建群不可用，手动绑定仍可使用')
      sentry.captureException(error, { stage: 'personal-userbot-init', instanceId: this.host.id })
    }
  }

  async start() {
    if (this.host.tgUserBot) {
      try {
        await (this.host.tgUserBot as any).disconnect?.()
      }
      catch (error) {
        this.host.log.debug({ error }, 'Error disconnecting existing UserBot')
      }
      finally {
        this.host.tgUserBot = undefined
      }
    }

    await this.initIfNeeded()
  }

  async stop() {
    if (this.host.tgUserBot) {
      try {
        await (this.host.tgUserBot as any).disconnect?.()
      }
      catch (error) {
        this.host.log.debug({ error }, 'Error disconnecting UserBot')
      }
      finally {
        this.host.tgUserBot = undefined
      }
    }

    this.host.setUserBotState(
      this.host.workMode === 'personal' && this.host.userSessionId
        ? 'stopped'
        : this.host.workMode === 'personal'
          ? 'not-configured'
          : 'disabled',
    )
  }

  getDiagnostics(): PersonalModeDiagnostics {
    const workMode = this.host.workMode
    const userBotRequired = workMode === 'personal'
    const hasTgUserBot = Boolean(this.host.tgUserBot?.isOnline)
    const userBotStatus = userBotRequired ? this.host.userBotStatus : 'disabled'
    const manualPairingAvailable = Boolean(this.host.tgBot && this.host.qqClient)

    return {
      workMode,
      userBotRequired,
      userSessionId: this.host.userSessionId,
      userBotStatus,
      hasTgUserBot,
      canAutoProvisionPairs: userBotStatus === 'running',
      manualPairingAvailable,
      ...(userBotRequired && !this.host.userSessionId
        ? { reason: 'personal 模式未配置 TG User session，自动建群不可用；手动绑定仍可使用' }
        : {}),
      ...(this.host.userBotError ? { error: this.host.userBotError } : {}),
    }
  }

  private formatError(error: unknown) {
    return String((error as any)?.message || error)
  }
}
