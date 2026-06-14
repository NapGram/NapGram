import process from 'node:process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}))

const dbKitMocks = vi.hoisted(() => ({
  db: {
    query: {
      instance: {
        findMany: vi.fn(),
      },
    },
  },
}))

const envKitMocks = vi.hoisted(() => ({
  normalizeUserIdentity: (value: unknown) => String(value ?? '').trim().replace(/^(?:tg|qq):u:/i, ''),
  isConfiguredIdentity: (value: unknown) => value !== undefined && value !== null && String(value).trim() !== '',
  matchesUserIdentity: (userId: string, identity: unknown) => {
    const normalize = (value: unknown) => String(value ?? '').trim().replace(/^(?:tg|qq):u:/i, '')
    return String(userId ?? '') !== '' && normalize(userId) === normalize(identity)
  },
  matchesAnyIdentity: (userId: string, identities: unknown[]) => {
    const normalize = (value: unknown) => String(value ?? '').trim().replace(/^(?:tg|qq):u:/i, '')
    return String(userId ?? '') !== '' && identities.some(identity => normalize(userId) === normalize(identity))
  },
  getSystemOwners: () => ({
    qq: undefined,
    tg: undefined,
  }),
  env: {
    FORWARD_MODE: '11',
    SHOW_NICKNAME_MODE: '11',
    TG_CONNECTION: 'direct',
    TG_INITIAL_DCID: '',
    TG_INITIAL_SERVER: '',
    NAPCAT_WS_URL: 'ws://napcat',
    WEB_ENDPOINT: 'http://localhost:8080',
    LOG_LEVEL: 'info',
    TG_LOG_LEVEL: 'info',
    PROXY_IP: '',
    PROXY_PORT: '',
    ADMIN_TOKEN: 'admin-token',
  },
}))

const loggerKitMocks = vi.hoisted(() => ({
  getLogger: vi.fn(() => loggerMocks),
  sentry: {
    init: vi.fn(),
    captureException: vi.fn(),
  },
}))

const performanceMonitorMocks = vi.hoisted(() => ({
  performanceMonitor: {
    getStats: vi.fn(() => ({
      totalMessages: 0,
      errorRate: 0,
    })),
  },
}))

const randomMocks = vi.hoisted(() => ({
  default: {
    hex: vi.fn(() => 'generated-admin-token'),
  },
}))

const pluginRuntimeMocks = vi.hoisted(() => ({
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(undefined),
  setInstanceResolvers: vi.fn(),
}))

const runtimeRegistryMocks = vi.hoisted(() => ({
  instanceRegistry: {
    getById: vi.fn(),
    getAll: vi.fn(() => []),
  },
}))

const interfaceMocks = vi.hoisted(() => {
  const app = { name: 'test-app' }
  return {
    app,
    createServer: vi.fn(() => app),
    configureRuntimeBridge: vi.fn(),
    registerWebRoutes: vi.fn(),
    startServer: vi.fn().mockResolvedValue(app),
    stopServer: vi.fn().mockResolvedValue(undefined),
  }
})

const sentryNodeMocks = vi.hoisted(() => ({
  addEventProcessor: vi.fn(),
  flush: vi.fn().mockResolvedValue(true),
}))

const instanceMocks = vi.hoisted(() => ({
  start: vi.fn(),
}))

vi.mock('@napgram/db-kit', () => dbKitMocks)
vi.mock('@napgram/env-kit', () => envKitMocks)
vi.mock('@napgram/logger-kit', () => loggerKitMocks)
vi.mock('@napgram/plugin-kit', () => ({
  PluginRuntime: pluginRuntimeMocks,
}))
vi.mock('../features/runtime/instance-registry', () => runtimeRegistryMocks)
vi.mock('@sentry/node', () => sentryNodeMocks)
vi.mock('@napgram/builtins', () => ({
  builtins: [{ id: 'builtin-test' }],
}))
vi.mock('../interfaces', () => interfaceMocks)
vi.mock('../domain/models/Instance', () => ({
  default: instanceMocks,
}))
vi.mock('@napgram/infra-kit', () => performanceMonitorMocks)
vi.mock('../shared/utils/random', () => randomMocks)

function createInstance(id: number) {
  const commandsFeature = {
    reloadCommands: vi.fn().mockResolvedValue(undefined),
  }
  return {
    id,
    commandsFeature,
    reloadCommands: vi.fn().mockImplementation(() => commandsFeature.reloadCommands()),
    stop: vi.fn().mockResolvedValue(undefined),
  }
}

async function flushTasks() {
  await Promise.resolve()
  await new Promise(resolve => setTimeout(resolve, 0))
}

describe('main startup flow', () => {
  let listeners: Map<string, (...args: any[]) => void>

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    listeners = new Map()

    process.env.ADMIN_TOKEN = 'admin-token'
    process.env.NAPGRAM_DISABLE_AUTO_MAIN = '1'
    delete process.env.SHOW_FULL_TOKEN

    vi.spyOn(process, 'on').mockImplementation(((event: string | symbol, handler: (...args: any[]) => void) => {
      listeners.set(String(event), handler)
      return process
    }) as any)
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    vi.spyOn(globalThis, 'setInterval').mockImplementation(() => ({
      unref: vi.fn(),
    }) as any)

    dbKitMocks.db.query.instance.findMany.mockResolvedValue([])
    pluginRuntimeMocks.start.mockResolvedValue(undefined)
    pluginRuntimeMocks.stop.mockResolvedValue(undefined)
    interfaceMocks.startServer.mockResolvedValue(interfaceMocks.app)
    interfaceMocks.stopServer.mockResolvedValue(undefined)
    sentryNodeMocks.flush.mockResolvedValue(true)
  })

  afterEach(() => {
    delete process.env.ADMIN_TOKEN
    delete process.env.NAPGRAM_DISABLE_AUTO_MAIN
    delete process.env.SHOW_FULL_TOKEN
    vi.restoreAllMocks()
  })

  it('starts all instances successfully without exiting', async () => {
    const instanceA = createInstance(1)
    const instanceB = createInstance(2)
    dbKitMocks.db.query.instance.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }])
    instanceMocks.start
      .mockResolvedValueOnce(instanceA)
      .mockResolvedValueOnce(instanceB)

    const { main } = await import('../index')
    await main()

    const startOptions = pluginRuntimeMocks.start.mock.calls[0]?.[0]
    expect(startOptions.webRoutes).toBe(interfaceMocks.registerWebRoutes)
    expect(startOptions.builtins.map((builtin: any) => builtin.id)).toEqual([
      'core-media',
      'core-commands',
      'core-forward',
      'builtin-test',
    ])
    expect(interfaceMocks.startServer).toHaveBeenCalledWith(interfaceMocks.app)
    expect(instanceA.commandsFeature.reloadCommands).toHaveBeenCalled()
    expect(instanceB.commandsFeature.reloadCommands).toHaveBeenCalled()
    expect(process.exit).not.toHaveBeenCalled()
  })

  it('handles SIGINT and SIGTERM gracefully', async () => {
    // Mock successful start so it doesn't shutdown with 'all-instances-failed'
    dbKitMocks.db.query.instance.findMany.mockResolvedValue([{ id: 1 }])
    instanceMocks.start.mockResolvedValueOnce(createInstance(1))

    const { main } = await import('../index')
    await main()

    const sigint = listeners.get('SIGINT')
    const sigterm = listeners.get('SIGTERM')
    expect(sigint).toBeDefined()
    expect(sigterm).toBeDefined()

    // Trigger SIGINT
    sigint?.()

    // Process multiple ticks to resolve shutdown promises
    await new Promise(resolve => setImmediate(resolve))

    // Trigger SIGTERM (should early return)
    sigterm?.()

    expect(loggerMocks.info).toHaveBeenCalledWith(expect.objectContaining({ reason: 'SIGINT' }), 'Shutting down NapGram')
  })

  it('keeps the app running when some instances fail to start', async () => {
    const instance = createInstance(1)
    dbKitMocks.db.query.instance.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }])
    instanceMocks.start
      .mockResolvedValueOnce(instance)
      .mockRejectedValueOnce(new Error('instance-2 failed'))

    const { main } = await import('../index')
    await main()

    expect(instance.commandsFeature.reloadCommands).toHaveBeenCalledTimes(1)
    expect(interfaceMocks.stopServer).not.toHaveBeenCalled()
    expect(pluginRuntimeMocks.stop).not.toHaveBeenCalled()
    expect(process.exit).not.toHaveBeenCalled()
    expect(loggerMocks.error).toHaveBeenCalledWith(
      {
        instances: [
          {
            instanceId: 2,
            error: 'instance-2 failed',
          },
        ],
      },
      'Failed instances',
    )
  })

  it('shuts down with a non-zero exit code when all instances fail', async () => {
    dbKitMocks.db.query.instance.findMany.mockResolvedValue([{ id: 9 }])
    instanceMocks.start.mockRejectedValue(new Error('all failed'))

    const { main } = await import('../index')
    await main()

    expect(interfaceMocks.stopServer).toHaveBeenCalled()
    expect(pluginRuntimeMocks.stop).toHaveBeenCalled()
    expect(sentryNodeMocks.flush).toHaveBeenCalledWith(3_000)
    expect(process.exit).toHaveBeenCalledWith(1)
  })

  it('handles SIGTERM with ordered shutdown of running instances', async () => {
    const instance = createInstance(7)
    dbKitMocks.db.query.instance.findMany.mockResolvedValue([{ id: 7 }])
    instanceMocks.start.mockResolvedValue(instance)

    const { main } = await import('../index')
    await main()

    const handler = listeners.get('SIGTERM')
    expect(handler).toBeTypeOf('function')

    handler?.()
    await flushTasks()

    expect(interfaceMocks.stopServer).toHaveBeenCalled()
    expect(pluginRuntimeMocks.stop).toHaveBeenCalled()
    expect(instance.stop).toHaveBeenCalled()
    expect(sentryNodeMocks.flush).toHaveBeenCalledWith(3_000)
    expect(process.exit).toHaveBeenCalledWith(0)
  })

  it('generates a random ADMIN_TOKEN if not provided', async () => {
    delete process.env.ADMIN_TOKEN
    dbKitMocks.db.query.instance.findMany.mockResolvedValue([])

    const { main } = await import('../index')
    await main()

    expect(process.env.ADMIN_TOKEN).toBe('generated-admin-token')
    expect(loggerMocks.info).toHaveBeenCalledWith(expect.stringContaining('ADMIN_TOKEN auto-generated for this session'))
  })

  it('handles error objects with string message', async () => {
    const { handleFatalStartupError } = await import('../index')
    handleFatalStartupError({ message: 'some error message' })
    expect(loggerMocks.error).toHaveBeenCalledWith(expect.objectContaining({ error: { message: 'some error message' } }), 'Fatal startup error')
  })
})

describe('initInfra', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sentry event processor filters transient errors', async () => {
    const { initInfra } = await import('../bootstrap')
    await initInfra(loggerMocks as any)
    const processor = sentryNodeMocks.addEventProcessor.mock.calls[0][0]

    expect(processor({ message: 'ConnectionError: 连接超时' })).toBeNull()

    const event = { message: 'Normal error', exception: { values: [{ type: 'TypeError', value: 'foo' }] } }
    expect(processor(event)).toBe(event)
  })
})

describe('handleFatalStartupError directly', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('handles fatal startup errors', async () => {
    const { handleFatalStartupError } = await import('../bootstrap')
    await handleFatalStartupError(new Error('fatal error'))

    expect(loggerMocks.error).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(Error) }), 'Fatal startup error')
    expect(interfaceMocks.stopServer).toHaveBeenCalled()
    expect(pluginRuntimeMocks.stop).toHaveBeenCalled()
    expect(sentryNodeMocks.flush).toHaveBeenCalledWith(3_000)
    expect(process.exit).toHaveBeenCalledWith(1)
  })
})
