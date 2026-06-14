import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fileManagerRoutes = vi.hoisted(() => vi.fn())
const logger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}))
const webPluginRouteState = vi.hoisted(() => ({
  registered: new Set<string>(),
  active: new Set<string>(),
}))
const runtimeKitMocks = vi.hoisted(() => ({
  hasPluginWebRoutes: vi.fn((pluginId: string) => webPluginRouteState.registered.has(String(pluginId || '').trim())),
  markPluginWebRoutes: vi.fn((pluginId: string) => {
    const id = String(pluginId || '').trim()
    if (!id) {
      return false
    }
    const isNew = !webPluginRouteState.registered.has(id)
    webPluginRouteState.registered.add(id)
    webPluginRouteState.active.add(id)
    return isNew
  }),
  activatePluginWebRoutes: vi.fn((pluginId: string) => {
    const id = String(pluginId || '').trim()
    if (id) {
      webPluginRouteState.active.add(id)
    }
  }),
  deactivatePluginWebRoutes: vi.fn((pluginId: string) => {
    const id = String(pluginId || '').trim()
    if (id) {
      webPluginRouteState.active.delete(id)
    }
  }),
  isPluginWebRoutesActive: vi.fn((pluginId: string) => webPluginRouteState.active.has(String(pluginId || '').trim())),
  resetPluginWebRoutesRegistry: vi.fn(() => {
    webPluginRouteState.registered.clear()
    webPluginRouteState.active.clear()
  }),
  setWebRuntimeBridge: vi.fn((app: any, bridge: any) => {
    app.__runtimeBridge = bridge
  }),
  getWebRuntimeBridge: vi.fn((app: any) => app.__runtimeBridge ?? null),
  tryGetWebRuntimeBridge: vi.fn((app: any) => app.__runtimeBridge ?? null),
  clearWebRuntimeBridge: vi.fn((app: any) => {
    app.__runtimeBridge = null
  }),
}))

vi.mock('@napgram/env-kit', () => ({
  env: {
    LISTEN_PORT: 8080,
  },
}))

vi.mock('@napgram/logger-kit', () => ({
  getLogger: vi.fn(() => logger),
}))

vi.mock('@napgram/runtime-kit', () => runtimeKitMocks)

vi.mock('../routes/fileManager', () => ({
  default: fileManagerRoutes,
  fileManagerRoutes,
}))

describe('web interfaces', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  afterEach(async () => {
    const { stopServer } = await import('../index')
    await stopServer()
  })

  it('creates a singleton server with base routes', async () => {
    const { createServer } = await import('../index')

    const a = createServer()
    const b = createServer()

    expect(a).toBe(b)
    expect(fileManagerRoutes).toHaveBeenCalledTimes(1)

    const response = await a.inject({ method: 'GET', url: '/' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ hello: 'NapGram (Fastify)' })
  })

  it('deduplicates plugin route registration by pluginId', async () => {
    const { createServer, registerWebRoutes } = await import('../index')
    const app = createServer()
    const register = vi.fn()

    registerWebRoutes(register, 'plugin-a')
    registerWebRoutes(register, 'plugin-a')
    registerWebRoutes(register, 'plugin-b')
    await app.ready()

    expect(register).toHaveBeenCalledTimes(2)
    expect(logger.debug).toHaveBeenCalledWith('Web routes already registered for plugin: plugin-a')
  })

  it('creates a fresh server after stopServer', async () => {
    const { createServer, stopServer } = await import('../index')

    const first = createServer()
    await stopServer()
    const second = createServer()

    expect(second).not.toBe(first)
  })

  it('returns 500 with error message from error handler', async () => {
    const { createServer } = await import('../index')
    const app = createServer()

    // Register a route that throws
    app.get('/test-error', async () => {
      throw new Error('test error message')
    })

    const response = await app.inject({ method: 'GET', url: '/test-error' })
    expect(response.statusCode).toBe(500)
    expect(response.json()).toEqual({ message: 'test error message' })
    expect(logger.error).toHaveBeenCalledWith('GET', '/test-error', 'test error message')
  })

  it('getWebApi returns registerRoutes function', async () => {
    const { getWebApi } = await import('../index')
    const api = getWebApi()
    expect(typeof api.registerRoutes).toBe('function')
  })

  it('stores and clears the runtime bridge on the host app', async () => {
    const { configureRuntimeBridge, createServer, getRuntimeBridge, stopServer } = await import('../index')
    const app = createServer()
    const bridge = {
      getInstance: vi.fn(),
      listInstances: vi.fn(() => []),
      getRuntimeReport: vi.fn(() => null),
    }

    configureRuntimeBridge(app, bridge)
    expect(getRuntimeBridge(app)).toBe(bridge)

    await stopServer()
    expect(getRuntimeBridge(app)).toBeNull()
    expect(runtimeKitMocks.resetPluginWebRoutesRegistry).toHaveBeenCalled()
  })

  it('startServer starts listening on configured port', async () => {
    const { startServer, stopServer } = await import('../index')
    try {
      const app = await startServer()
      expect(app).toBeDefined()
      expect(logger.info).toHaveBeenCalledWith('Listening on', 8080)
      await stopServer()
    }
    catch (e: any) {
      // Port binding may be restricted in sandboxed test runs.
      if (e.code === 'EADDRINUSE' || e.code === 'EPERM') {
        await stopServer()
        return
      }
      throw e
    }
  })

  it('stopServer is a no-op when no server exists', async () => {
    const { stopServer } = await import('../index')
    // Should not throw
    await stopServer()
    // Calling again should also be fine
    await stopServer()
  })

  it('startServer propagates listen errors', async () => {
    const { createServer, startServer, stopServer } = await import('../index')
    const app = createServer()
    try {
      await startServer(app)
    }
    catch (e: any) {
      // Port binding may be restricted in sandboxed test runs.
      if (e.code === 'EADDRINUSE' || e.code === 'EPERM') {
        expect(['EADDRINUSE', 'EPERM']).toContain(e.code)
        return
      }
      throw e
    }
    // If first start succeeded, second should fail
    await expect(startServer(app)).rejects.toThrow()
    await stopServer()
  })
})
