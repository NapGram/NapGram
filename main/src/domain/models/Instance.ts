import type { AppLogger } from '@napgram/logger-kit'
import type { CommandsFeature, ForwardFeature, MediaFeature } from '../../features/runtime/index.js'
import type { IQQClient } from '../../infrastructure/clients/qq'
import type Telegram from '@napgram/telegram-client'
import { db, eq, ForwardMap, schema } from '@napgram/db-kit'
import { getLogger } from '@napgram/logger-kit'
import { getEventPublisher } from '@napgram/plugin-kit'
import { instanceRegistry } from '../../features/runtime/instance-registry'
import { withDbRetry } from './services/db-retry'
import { ConnectionSupervisor } from '../services/ConnectionSupervisor.js'
import { PersonalUserBotService } from '../services/PersonalUserBotService.js'

export type WorkMode = 'personal' | 'group' | 'public'
export type InstanceLifecycleStatus = 'starting' | 'running' | 'stopping' | 'stopped' | 'error'
export type PersonalUserBotStatus = 'disabled' | 'not-configured' | 'starting' | 'running' | 'stopped' | 'error'

const CONFIGURED_WORK_MODES = new Set(['personal', 'group', 'public'])

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

  public readonly log: AppLogger
  private readonly personalUserBotService: PersonalUserBotService
  private readonly connectionSupervisor: ConnectionSupervisor

  public tgBot!: Telegram
  public tgUserBot?: Telegram
  public qqClient?: IQQClient
  public forwardPairs!: ForwardMap
  public mediaFeature?: MediaFeature
  public commandsFeature?: CommandsFeature
  public forwardFeature?: ForwardFeature
  public isInit = false
  public status: InstanceLifecycleStatus = 'stopped'
  public eventPublisher?: { publishMessageCreated: (...args: any[]) => Promise<void> }

  private constructor(public readonly id: number) {
    this.log = getLogger(`Instance - ${this.id}`)
    this.personalUserBotService = new PersonalUserBotService(this)
    this.connectionSupervisor = new ConnectionSupervisor(this, this.personalUserBotService)
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

  private async initPersonalUserBotIfNeeded() {
    await this.personalUserBotService.initIfNeeded()
  }

  public async startUserBot() {
    await this.personalUserBotService.start()
  }

  public async stopUserBot() {
    await this.personalUserBotService.stop()
  }

  public async reloadCommands() {
    await this.commandsFeature?.reloadCommands?.()
  }

  private async init(botToken?: string) {
    return this.connectionSupervisor.login(botToken)
  }

  private async disposeRuntimeResources() {
    await this.connectionSupervisor.disposeRuntimeResources()
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
      await getEventPublisher().publishInstanceStatus({ instanceId: this.id, status: 'stopping' })
    }
    catch (error) {
      this.log.warn('Failed to publish instance stopping status:', error)
    }

    await this.disposeRuntimeResources()
    this.status = 'stopped'
    instanceRegistry.remove(this.id)

    try {
      await getEventPublisher().publishInstanceStatus({ instanceId: this.id, status: 'stopped' })
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

  hasConfiguredWorkMode() {
    return CONFIGURED_WORK_MODES.has(String(this._workMode || '').trim())
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
    return this.personalUserBotService.getDiagnostics()
  }

  setUserBotState(status: PersonalUserBotStatus, error?: string) {
    this._userBotStatus = status
    this._userBotError = error
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

  private async persistDb(fields: Record<string, unknown>) {
    await this.dbRetry(
      () => db.update(schema.instance)
        .set(fields)
        .where(eq(schema.instance.id, this.id))
        .then(() => this.log.trace(fields)),
      'update instance',
    )
  }

  async setWorkMode(workMode: WorkMode) {
    const previous = this._workMode
    this._workMode = workMode
    await this.persistDb({ workMode })

    if (workMode === 'personal') {
      await this.startUserBot()
    }
    else {
      if (previous === 'personal' || this.tgUserBot)
        await this.stopUserBot()
      else
        this._userBotStatus = 'disabled'
    }
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
