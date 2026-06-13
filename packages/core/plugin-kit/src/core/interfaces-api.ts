import type {
  EventSubscription,
  FriendRequestEventHandler,
  GroupRequestEventHandler,
  InstanceStatus,
  InstanceStatusEventHandler,
  MessageEventHandler,
  MessageSegment,
  NoticeEventHandler,
  PluginReloadEventHandler,
  SendMessageResult,
} from './interfaces-events.js'
import type { CommandConfig } from './interfaces-spec.js'
import type { PluginRuntimeInstance } from '@napgram/runtime-kit'

export interface PluginContext {
  readonly pluginId: string
  readonly logger: PluginLogger
  readonly config: any
  readonly storage: PluginStorage
  readonly database: unknown
  on: ((event: 'message', handler: MessageEventHandler) => EventSubscription) & ((event: 'friend-request', handler: FriendRequestEventHandler) => EventSubscription) & ((event: 'group-request', handler: GroupRequestEventHandler) => EventSubscription) & ((event: 'notice', handler: NoticeEventHandler) => EventSubscription) & ((event: 'instance-status', handler: InstanceStatusEventHandler) => EventSubscription) & ((event: 'plugin-reload', handler: PluginReloadEventHandler) => EventSubscription)
  readonly message: MessageAPI
  readonly instance: InstanceAPI
  readonly user: UserAPI
  readonly group: GroupAPI
  readonly web: WebAPI
  readonly native: PluginNativeInstanceAPI
  command: (config: CommandConfig) => this
  onReload: (callback: () => void | Promise<void>) => void
  onUnload: (callback: () => void | Promise<void>) => void
}

export interface MessageAPI {
  send: (params: SendMessageParams) => Promise<SendMessageResult>
  recall: (params: RecallMessageParams) => Promise<void>
  get: (params: GetMessageParams) => Promise<MessageInfo | null>
}

export interface SendMessageParams {
  instanceId: number
  channelId: string
  content: string | MessageSegment[]
  threadId?: number
  replyTo?: string
}

export interface RecallMessageParams {
  instanceId: number
  messageId: string
}

export interface GetMessageParams {
  instanceId: number
  messageId: string
}

export interface MessageInfo {
  id: string
  channelId: string
  userId: string
  text: string
  segments: MessageSegment[]
  timestamp: number
}

export interface InstanceAPI {
  list: () => Promise<InstanceInfo[]>
  get: (instanceId: number) => Promise<InstanceInfo | null>
  getStatus: (instanceId: number) => Promise<InstanceStatus>
}

export interface InstanceInfo {
  id: number
  name?: string
  ownerTgId?: string
  workMode?: string
  status: InstanceStatus
  hasQqClient: boolean
  hasTgBot: boolean
  hasTgUserBot: boolean
  userSessionId?: number | null
  userBotStatus?: 'disabled' | 'not-configured' | 'starting' | 'running' | 'stopped' | 'error'
  personalMode?: {
    workMode?: string
    userBotRequired: boolean
    userSessionId: number | null
    userBotStatus: 'disabled' | 'not-configured' | 'starting' | 'running' | 'stopped' | 'error'
    hasTgUserBot: boolean
    canAutoProvisionPairs: boolean
    manualPairingAvailable: boolean
    reason?: string
    error?: string
  }
  qqAccount?: string
  tgAccount?: string
  createdAt: Date
}

export interface UserAPI {
  getInfo: (params: GetUserParams) => Promise<UserInfo | null>
  isFriend: (params: GetUserParams) => Promise<boolean>
}

export interface GetUserParams {
  instanceId: number
  userId: string
}

export interface UserInfo {
  userId: string
  userName: string
  userNick?: string
  avatar?: string
}

export interface GroupAPI {
  getInfo: (params: GetGroupParams) => Promise<GroupInfo | null>
  getMembers: (params: GetGroupParams) => Promise<GroupMember[]>
  setAdmin: (params: SetAdminParams) => Promise<void>
  muteUser: (params: MuteUserParams) => Promise<void>
  kickUser: (params: KickUserParams) => Promise<void>
}

export interface GetGroupParams {
  instanceId: number
  groupId: string
}

export interface GroupInfo {
  groupId: string
  groupName: string
  memberCount?: number
}

export interface GroupMember {
  userId: string
  userName: string
  userNick?: string
  role: 'owner' | 'admin' | 'member'
}

export interface SetAdminParams {
  instanceId: number
  groupId: string
  userId: string
  enable: boolean
}

export interface MuteUserParams {
  instanceId: number
  groupId: string
  userId: string
  duration: number
}

export interface KickUserParams {
  instanceId: number
  groupId: string
  userId: string
  rejectAddRequest?: boolean
}

export interface WebAPI {
  registerRoutes: (register: (app: any) => void, pluginId?: string) => void
}

export interface PluginNativeInstanceAPI {
  getInstance: (instanceId: number) => PluginRuntimeInstance | undefined
  getInstances: () => PluginRuntimeInstance[]
}

export interface PluginApis {
  message: MessageAPI
  instance: InstanceAPI
  user: UserAPI
  group: GroupAPI
  web: WebAPI
  database: unknown
  native?: PluginNativeInstanceAPI
}

export type PluginWebRouteRegistrar = (register: (app: any) => void, pluginId?: string) => void

export interface PluginStorage {
  get: <T = any>(key: string) => Promise<T | null>
  set: <T = any>(key: string, value: T) => Promise<void>
  delete: (key: string) => Promise<void>
  keys: () => Promise<string[]>
  clear: () => Promise<void>
}

export interface PluginLogger {
  debug: (message: any, ...args: any[]) => void
  info: (message: any, ...args: any[]) => void
  warn: (message: any, ...args: any[]) => void
  error: (message: any, ...args: any[]) => void
}

export type { EventSubscription } from './interfaces-events.js'
