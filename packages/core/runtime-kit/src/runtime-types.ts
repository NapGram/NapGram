export interface RuntimeStats {
  total: number
  native: number
  installed: number
  error: number
}

export type PluginUserBotStatus = 'disabled' | 'not-configured' | 'starting' | 'running' | 'stopped' | 'error'
export type RuntimeInstanceStatus = 'starting' | 'running' | 'stopping' | 'stopped' | 'error'

export interface PluginInstancePersonalModeDiagnostics {
  workMode?: string
  userBotRequired: boolean
  userSessionId: number | null
  userBotStatus: PluginUserBotStatus
  hasTgUserBot: boolean
  canAutoProvisionPairs: boolean
  manualPairingAvailable: boolean
  reason?: string
  error?: string
}

export interface PluginTgChatLike {
  sendMessage?: (text: string, options?: { replyTo?: number }) => Promise<{ id?: string | number }>
  deleteMessages?: (messageIds: number[]) => Promise<void>
}

export interface PluginTgBotLike {
  username?: string
  isRunning?: boolean
  getChat?: (chatId: number) => Promise<PluginTgChatLike>
  downloadMedia?: (media: unknown) => Promise<Buffer | Uint8Array | null>
}

export interface PluginQqMessageContent {
  type?: string
  data?: {
    text?: string
    userId?: string | number
    userName?: string
    url?: string
    file?: string
    name?: string
    messages?: unknown
    [key: string]: unknown
  } | null
}

export interface PluginQqMessageLike {
  content?: PluginQqMessageContent[] | null
  chat?: {
    id?: string | number | null
    type?: string | null
  } | null
  sender?: {
    id?: string | number | null
    name?: string | null
  } | null
  timestamp?: number | string | null
}

export interface PluginQqSendReceipt {
  messageId?: string | number
  message_id?: string | number
  data?: {
    messageId?: string | number
    message_id?: string | number
  }
}

export interface PluginQqClientLike {
  uin?: string | number
  nickname?: string
  isConnected?: boolean
  isOnline?: () => Promise<boolean>
  sendMessage?: (channelId: string, message: any) => Promise<PluginQqSendReceipt>
  recallMessage?: (messageId: string) => Promise<void>
  getMessage?: (messageId: string) => Promise<PluginQqMessageLike | null>
  sendGroupForwardMsg?: (channelId: string, nodes: unknown[]) => Promise<PluginQqSendReceipt>
  sendPrivateForwardMessage?: (payload: { user_id: string, messages: unknown[] }) => Promise<PluginQqSendReceipt>
  sendForwardMsg?: (payload: { user_id: string, messages: unknown[] }) => Promise<PluginQqSendReceipt>
}

export interface PluginForwardPairsLike {
  getAll: () => unknown[]
}

export interface IInstance {
  id: number
  name?: string
  tgBot?: PluginTgBotLike | null
  tgUserBot?: {
    isOnline?: boolean
  } | null
  qqClient?: PluginQqClientLike | null
  forwardPairs?: PluginForwardPairsLike | null
  owner?: number | string
  ownerTgId?: string | number
  workMode?: string
  userSessionId?: number | null
  userBotStatus?: PluginUserBotStatus
  getPersonalModeDiagnostics?: () => PluginInstancePersonalModeDiagnostics
  flags?: number
  status?: RuntimeInstanceStatus
  createdAt?: Date
  starting?: boolean
  stopping?: boolean
  stopped?: boolean
  reloadCommands?: () => Promise<void>
}

export type PluginRuntimeInstance = Partial<IInstance>
export type PluginInstanceResolver = (instanceId: number) => PluginRuntimeInstance | undefined
export type PluginInstancesResolver = () => PluginRuntimeInstance[]

export type RuntimePluginExports = Record<string, unknown>

export interface RuntimePluginContextLike {
  pluginId?: string
  exports?: RuntimePluginExports
}

export interface RuntimePluginDefinition {
  id: string
  name: string
  version: string
  description?: string
  homepage?: string
  defaultConfig?: unknown
  exports?: RuntimePluginExports
}

export interface RuntimePluginHandle {
  id: string
  context: unknown
  plugin?: RuntimePluginDefinition
  config?: unknown
  state?: string | number
}

export interface RuntimeReport {
  enabled: boolean
  loaded: string[]
  loadedPlugins?: RuntimePluginHandle[]
  failed: Array<{ id: string, error: string }>
  stats: RuntimeStats
}

export interface ReloadPluginResult {
  id: string
  success: boolean
  error?: string
}

/**
 * Interface for PluginRuntime to allow dependency inversion.
 * Consumers (like marketplace-kit) depend on this interface,
 * while the implementation (main/server) provides it.
 */
export interface IPluginRuntime {
  /**
   * Get the last runtime report
   */
  getLastReport(): RuntimeReport

  /**
   * Check if runtime is active
   */
  isActive(): boolean

  /**
   * Reload a single plugin
   */
  reloadPlugin(pluginId: string, newConfig?: unknown): Promise<ReloadPluginResult>

  /**
   * Reload the entire runtime (reloads all plugins)
   */
  reload(options?: unknown): Promise<RuntimeReport>

  /**
   * Get a plugin instance by ID
   */
  getPlugin(id: string): RuntimePluginHandle | undefined

  /**
   * Get event bus (abstract return type to avoid coupling)
   */
  getEventBus(): unknown
}
