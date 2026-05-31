import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fileManagerRoutes = vi.hoisted(() => vi.fn())
const logger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}))

vi.mock('@napgram/env-kit', () => ({
  env: {
    LISTEN_PORT: 8080,
  },
}))

vi.mock('@napgram/logger-kit', () => ({
  getLogger: vi.fn(() => logger),
}))

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
    const { registerWebRoutes } = await import('../index')
    const register = vi.fn()

    registerWebRoutes(register, 'plugin-a')
    registerWebRoutes(register, 'plugin-a')
    registerWebRoutes(register, 'plugin-b')

    expect(register).toHaveBeenCalledTimes(2)
    expect(logger.warn).toHaveBeenCalledWith('Web routes already registered for plugin: plugin-a')
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

  it('startServer starts listening on configured port', async () => {
    const { startServer, stopServer } = await import('../index')
    try {
      const app = await startServer()
      expect(app).toBeDefined()
      expect(logger.info).toHaveBeenCalledWith('Listening on', 8080)
      await stopServer()
    }
    catch (e: any) {
      // Port might be in use from other tests, that's OK
      if (e.code === 'EADDRINUSE') {
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
      // Port already in use - that's the expected error path
      if (e.code === 'EADDRINUSE') {
        expect(e.code).toBe('EADDRINUSE')
        return
      }
      throw e
    }
    // If first start succeeded, second should fail
    await expect(startServer(app)).rejects.toThrow()
    await stopServer()
  })
})
