import type { IInstance, RuntimeReport } from './runtime-types.js'

const WEB_RUNTIME_BRIDGE_SYMBOL = Symbol.for('@napgram/runtime-kit/web-runtime-bridge')
export const WEB_RUNTIME_BRIDGE_DECORATOR = 'napgramRuntimeBridge'

export interface WebRuntimeBridge {
  getInstance(instanceId: number): IInstance | undefined
  listInstances(): IInstance[]
  getRuntimeReport(): RuntimeReport | null
}

const registeredPluginWebRoutes = new Set<string>()
const activePluginWebRoutes = new Set<string>()

interface DecoratableHost {
  hasDecorator?: (name: string) => boolean
  decorate?: (name: string, value: unknown) => unknown
}

function isDecoratableHost(target: object): target is object & DecoratableHost {
  return typeof (target as DecoratableHost).decorate === 'function'
}

export function setWebRuntimeBridge(target: object, bridge: WebRuntimeBridge): void {
  if (isDecoratableHost(target)) {
    if (target.hasDecorator?.(WEB_RUNTIME_BRIDGE_DECORATOR)) {
      ;(target as Record<string, unknown>)[WEB_RUNTIME_BRIDGE_DECORATOR] = bridge
    }
    else {
      target.decorate?.(WEB_RUNTIME_BRIDGE_DECORATOR, bridge)
    }
  }

  Object.defineProperty(target, WEB_RUNTIME_BRIDGE_SYMBOL, {
    value: bridge,
    configurable: true,
    enumerable: false,
    writable: true,
  })
}

export function clearWebRuntimeBridge(target: object): void {
  try {
    ;(target as Record<string, unknown>)[WEB_RUNTIME_BRIDGE_DECORATOR] = null
    delete (target as Record<string, unknown>)[WEB_RUNTIME_BRIDGE_DECORATOR]
  }
  catch {
    // Fastify decorations may not be configurable on some hosts.
  }
  ;(target as Record<PropertyKey, unknown>)[WEB_RUNTIME_BRIDGE_SYMBOL] = null
  delete (target as Record<PropertyKey, unknown>)[WEB_RUNTIME_BRIDGE_SYMBOL]
}

export function hasPluginWebRoutes(pluginId: string): boolean {
  return registeredPluginWebRoutes.has(String(pluginId || '').trim())
}

export function markPluginWebRoutes(pluginId: string): boolean {
  const id = String(pluginId || '').trim()
  if (!id) {
    return false
  }

  const isNew = !registeredPluginWebRoutes.has(id)
  registeredPluginWebRoutes.add(id)
  activePluginWebRoutes.add(id)
  return isNew
}

export function activatePluginWebRoutes(pluginId: string): void {
  const id = String(pluginId || '').trim()
  if (!id) {
    return
  }

  activePluginWebRoutes.add(id)
}

export function deactivatePluginWebRoutes(pluginId: string): void {
  const id = String(pluginId || '').trim()
  if (!id) {
    return
  }

  activePluginWebRoutes.delete(id)
}

export function isPluginWebRoutesActive(pluginId: string): boolean {
  return activePluginWebRoutes.has(String(pluginId || '').trim())
}

export function resetPluginWebRoutesRegistry(): void {
  registeredPluginWebRoutes.clear()
  activePluginWebRoutes.clear()
}

export function tryGetWebRuntimeBridge(target: object): WebRuntimeBridge | null {
  const bridgeBySymbol = (target as Record<PropertyKey, unknown>)[WEB_RUNTIME_BRIDGE_SYMBOL] as WebRuntimeBridge | undefined
  if (bridgeBySymbol) {
    return bridgeBySymbol
  }

  return ((target as Record<string, unknown>)[WEB_RUNTIME_BRIDGE_DECORATOR] as WebRuntimeBridge | undefined) ?? null
}

export function getWebRuntimeBridge(target: object): WebRuntimeBridge {
  const bridge = tryGetWebRuntimeBridge(target)
  if (!bridge) {
    throw new Error('Web runtime bridge is not configured on the host application.')
  }
  return bridge
}
