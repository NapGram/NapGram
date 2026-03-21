import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fileManagerRoutes = vi.hoisted(() => vi.fn())
const logger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}))

vi.mock('@napgram/infra-kit', () => ({
  env: {
    LISTEN_PORT: 8080,
  },
  getLogger: vi.fn(() => logger),
}))

vi.mock('@napgram/web-interfaces', () => ({
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
})
