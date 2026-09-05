import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test'

const fileManagerRoutes = (() => mock())()
const logger = (() => ({
  info: mock(),
  warn: mock(),
  error: mock(),
  debug: mock(),
}))()
const webPluginRouteState = (() => ({
  registered: new Set<string>(),
  active: new Set<string>(),
}))()
const runtimeKitMocks = (() => ({
  hasPluginWebRoutes: mock((pluginId: string) => webPluginRouteState.registered.has(String(pluginId || '').trim())),
  markPluginWebRoutes: mock((pluginId: string) => {
    const id = String(pluginId || '').trim()
    if (!id) {
      return false
    }
    const isNew = !webPluginRouteState.registered.has(id)
    webPluginRouteState.registered.add(id)
    webPluginRouteState.active.add(id)
    return isNew
  }),
  activatePluginWebRoutes: mock((pluginId: string) => {
    const id = String(pluginId || '').trim()
    if (id) {
      webPluginRouteState.active.add(id)
    }
  }),
  deactivatePluginWebRoutes: mock((pluginId: string) => {
    const id = String(pluginId || '').trim()
    if (id) {
      webPluginRouteState.active.delete(id)
    }
  }),
  isPluginWebRoutesActive: mock((pluginId: string) => webPluginRouteState.active.has(String(pluginId || '').trim())),
  resetPluginWebRoutesRegistry: mock(() => {
    webPluginRouteState.registered.clear()
    webPluginRouteState.active.clear()
  }),
  setWebRuntimeBridge: mock((app: any, bridge: any) => {
    app.__runtimeBridge = bridge
  }),
  getWebRuntimeBridge: mock((app: any) => app.__runtimeBridge ?? null),
  tryGetWebRuntimeBridge: mock((app: any) => app.__runtimeBridge ?? null),
  clearWebRuntimeBridge: mock((app: any) => {
    app.__runtimeBridge = null
  }),
}))()

mock.module('@napgram/env-kit', () => ({
  env: {
    LISTEN_PORT: 8080,
  },
}))

mock.module('@napgram/logger-kit', () => ({
  getLogger: mock(() => logger),
}))

mock.module('@napgram/runtime-kit', () => runtimeKitMocks)

mock.module('../routes/fileManager', () => ({
  default: fileManagerRoutes,
  fileManagerRoutes,
}))

describe('web interfaces', () => {
  beforeEach(() => {
    mock.restore()
    mock.clearAllMocks()
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
    const register = mock()

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
      getInstance: mock(),
      listInstances: mock(() => []),
      getRuntimeReport: mock(() => null),
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
    spyOn(app, 'listen').mockRejectedValueOnce(new Error('Mock listen error'))

    await expect(startServer(app)).rejects.toThrow('Mock listen error')
    expect(logger.error).toHaveBeenCalledWith('Failed to start web server:', expect.any(Error))
    await stopServer()
  })

  it('stopServer handles unknown close error', async () => {
    const { createServer, stopServer } = await import('../index')
    const app = createServer()
    // app is currently assigned to 'server' internally since createServer assigns it
    spyOn(app, 'close').mockRejectedValueOnce(Object.assign(new Error('Unknown close error'), { code: 'UNKNOWN_CODE' }))

    await expect(stopServer()).rejects.toThrow('Unknown close error')
  })
})
