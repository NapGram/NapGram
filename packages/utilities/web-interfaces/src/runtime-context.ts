import type { FastifyInstance } from 'fastify'
import { getWebRuntimeBridge } from '@napgram/runtime-kit'

export interface RuntimeInstancePatch {
  owner?: number | bigint
  flags?: number
  isSetup?: boolean
  userSessionId?: number | null
  workMode?: string
}

function toJsonSafe(value: any): any {
  if (typeof value === 'bigint')
    return value.toString()
  if (Array.isArray(value))
    return value.map(toJsonSafe)
  if (value && typeof value === 'object') {
    if (value instanceof Date)
      return value
    const out: Record<string, any> = {}
    for (const [key, val] of Object.entries(value))
      out[key] = toJsonSafe(val)
    return out
  }
  return value
}

function buildPersonalModeDiagnostics(instance: any, runtimeInstance?: any) {
  if (typeof runtimeInstance?.getPersonalModeDiagnostics === 'function') {
    return runtimeInstance.getPersonalModeDiagnostics()
  }

  const workMode = runtimeInstance?.workMode ?? instance.workMode
  const userSessionId = runtimeInstance?.userSessionId ?? instance.userSessionId ?? null
  const userBotRequired = workMode === 'personal'
  const userBotStatus = userBotRequired
    ? (userSessionId ? (runtimeInstance?.userBotStatus ?? 'stopped') : 'not-configured')
    : 'disabled'

  return {
    workMode,
    userBotRequired,
    userSessionId,
    userBotStatus,
    hasTgUserBot: Boolean(runtimeInstance?.tgUserBot?.isOnline),
    canAutoProvisionPairs: userBotStatus === 'running',
    manualPairingAvailable: Boolean(runtimeInstance?.tgBot && runtimeInstance?.qqClient),
    ...(userBotRequired && !userSessionId
      ? { reason: 'personal 模式未配置 TG User session，自动建群不可用；手动绑定仍可使用' }
      : {}),
    ...(runtimeInstance?.userBotError ? { error: runtimeInstance.userBotError } : {}),
  }
}

function getBridge(host: FastifyInstance) {
  return getWebRuntimeBridge(host)
}

export function createInstanceRuntimeContext(host: FastifyInstance) {
  const bridge = getBridge(host)
  const getInstance = (instanceId: number) => bridge.getInstance(instanceId) as any

  return {
    getInstance,
    listInstances: () => bridge.listInstances() as any[],
    describeInstance: (instance: any, extra: Record<string, any> = {}, runtimeInstance = getInstance(instance.id)) => {
      const personalMode = buildPersonalModeDiagnostics(instance, runtimeInstance)
      return {
        ...toJsonSafe(instance),
        ...extra,
        runtimeStatus: runtimeInstance?.status ?? 'stopped',
        hasQqClient: Boolean(runtimeInstance?.qqClient),
        hasTgBot: Boolean(runtimeInstance?.tgBot),
        hasTgUserBot: Boolean(runtimeInstance?.tgUserBot?.isOnline),
        userBotStatus: personalMode.userBotStatus,
        personalMode,
      }
    },
    syncInstance: async (instanceId: number, body: RuntimeInstancePatch) => {
      const runtimeInstance = getInstance(instanceId)
      if (!runtimeInstance)
        return

      if (body.owner !== undefined && 'owner' in runtimeInstance)
        runtimeInstance.owner = Number(body.owner)
      if (body.flags !== undefined && 'flags' in runtimeInstance)
        runtimeInstance.flags = body.flags
      if (body.isSetup !== undefined && 'isSetup' in runtimeInstance)
        runtimeInstance.isSetup = body.isSetup

      const nextWorkMode = body.workMode ?? runtimeInstance.workMode
      if (body.userSessionId !== undefined && 'userSessionId' in runtimeInstance)
        runtimeInstance.userSessionId = body.userSessionId

      if (body.workMode !== undefined) {
        if (typeof runtimeInstance.setWorkMode === 'function') {
          await runtimeInstance.setWorkMode(body.workMode)
        }
        else {
          runtimeInstance.workMode = body.workMode
        }
        return
      }

      if (body.userSessionId !== undefined && nextWorkMode === 'personal') {
        if (body.userSessionId && typeof runtimeInstance.startUserBot === 'function')
          await runtimeInstance.startUserBot()
        else if (!body.userSessionId && typeof runtimeInstance.stopUserBot === 'function')
          await runtimeInstance.stopUserBot()
      }
    },
    reloadForwardMap: async (instanceId: number) => {
      const runtimeInstance = getInstance(instanceId)
      const map = runtimeInstance?.forwardPairs as any
      if (map && typeof map.reload === 'function') {
        await map.reload()
      }
    },
    startUserBot: async (instanceId: number) => {
      const runtimeInstance = getInstance(instanceId)
      if (!runtimeInstance)
        return false

      if (typeof runtimeInstance.startUserBot === 'function') {
        await runtimeInstance.startUserBot()
        return true
      }

      const userSessionId = runtimeInstance.userSessionId
      if (!userSessionId) {
        throw new Error('UserBot session is not configured')
      }

      const { telegramClientFactory } = await import('@napgram/telegram-client')
      runtimeInstance._userBotStatus = 'starting'
      try {
        const bot = await telegramClientFactory.connect({
          type: 'mtcute',
          sessionId: userSessionId,
          authMode: 'user',
          appName: 'NapGram User',
        })
        runtimeInstance.tgUserBot = bot
        runtimeInstance._userBotStatus = 'running'
        return true
      }
      catch (error: any) {
        runtimeInstance._userBotStatus = 'error'
        runtimeInstance._userBotError = error?.message || String(error)
        throw error
      }
    },
    stopUserBot: async (instanceId: number) => {
      const runtimeInstance = getInstance(instanceId)
      if (!runtimeInstance)
        return false

      if (typeof runtimeInstance.stopUserBot === 'function') {
        await runtimeInstance.stopUserBot()
        return true
      }

      if (runtimeInstance.tgUserBot) {
        try {
          await (runtimeInstance.tgUserBot as any).disconnect?.()
        }
        catch {
          // 忽略回退断开错误
        }
        runtimeInstance.tgUserBot = undefined
      }
      runtimeInstance._userBotStatus = 'stopped'
      return true
    },
  }
}

export function createAdminQueryContext(host: FastifyInstance) {
  const bridge = getBridge(host)
  return {
    getRuntimeReport: () => bridge.getRuntimeReport(),
    listInstances: () => bridge.listInstances() as any[],
  }
}

export function createMessageBridgeContext(host: FastifyInstance) {
  const bridge = getBridge(host)
  return {
    getInstance: (instanceId: number) => bridge.getInstance(instanceId) as any,
  }
}
