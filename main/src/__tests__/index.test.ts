import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test'
import { bunEnv } from '../shared/utils/runtime.js'

const bunProcess = (globalThis as typeof globalThis & {
  process: { on: (event: string, handler: (...args: any[]) => void) => unknown }
}).process

const loggerMocks = (() => ({
  info: mock(),
  warn: mock(),
  error: mock(),
  debug: mock(),
}))()

const dbKitMocks = (() => ({
  db: {
    query: {
      instance: {
        findMany: mock(),
      },
    },
  },
}))()

const envKitMocks = (() => ({
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
}))()

const loggerKitMocks = (() => ({
  getLogger: mock(() => loggerMocks),
  telemetry: {
    init: mock(),
    captureException: mock(),
    event: mock(),
    flush: mock().mockResolvedValue(true),
    setExceptionFilter: mock(),
    shutdown: mock().mockResolvedValue(true),
  },
}))()

const performanceMonitorMocks = (() => ({
  performanceMonitor: {
    getStats: mock(() => ({
      totalMessages: 0,
      errorRate: 0,
    })),
  },
}))()

const randomMocks = (() => ({
  default: {
    hex: mock(() => 'generated-admin-token'),
  },
}))()

const pluginRuntimeMocks = (() => ({
  start: mock().mockResolvedValue(undefined),
  stop: mock().mockResolvedValue(undefined),
  setInstanceResolvers: mock(),
}))()

const runtimeRegistryMocks = (() => ({
  instanceRegistry: {
    getById: mock(),
    getAll: mock(() => []),
  },
}))()

const interfaceMocks = (() => {
  const app = { name: 'test-app' }
  return {
    app,
    createServer: mock(() => app),
    configureRuntimeBridge: mock(),
    registerWebRoutes: mock(),
    startServer: mock().mockResolvedValue(app),
    stopServer: mock().mockResolvedValue(undefined),
  }
})()

const instanceMocks = (() => ({
  start: mock(),
}))()

mock.module('@napgram/db-kit', () => dbKitMocks)
mock.module('@napgram/env-kit', () => envKitMocks)
mock.module('@napgram/logger-kit', () => loggerKitMocks)
mock.module('@napgram/plugin-kit', () => ({
  PluginRuntime: pluginRuntimeMocks,
}))
mock.module('../features/runtime/instance-registry', () => runtimeRegistryMocks)
mock.module('@napgram/builtins', () => ({
  builtins: [{ id: 'builtin-test' }],
}))
mock.module('../interfaces', () => interfaceMocks)
mock.module('../domain/models/Instance', () => ({
  default: instanceMocks,
}))
mock.module('@napgram/infra-kit', () => performanceMonitorMocks)
mock.module('../shared/utils/random', () => randomMocks)

function createInstance(id: number) {
  const commandsFeature = {
    reloadCommands: mock().mockResolvedValue(undefined),
  }
  return {
    id,
    commandsFeature,
    reloadCommands: mock().mockImplementation(() => commandsFeature.reloadCommands()),
    stop: mock().mockResolvedValue(undefined),
  }
}

async function flushTasks() {
  await Promise.resolve()
  await new Promise(resolve => setTimeout(resolve, 0))
}

describe('main startup flow', () => {
  let listeners: Map<string, (...args: any[]) => void>

  beforeEach(() => {
    mock.restore()
    mock.clearAllMocks()
    listeners = new Map()

    bunEnv.ADMIN_TOKEN = 'admin-token'
    bunEnv.NAPGRAM_DISABLE_AUTO_MAIN = '1'
    delete bunEnv.SHOW_FULL_TOKEN

    spyOn(bunProcess, 'on').mockImplementation(((event: string, handler: (...args: any[]) => void) => {
      listeners.set(String(event), handler)
      return bunProcess
    }) as any)
    spyOn(globalThis, 'setInterval').mockImplementation(() => ({
      unref: mock(),
    }) as any)

    dbKitMocks.db.query.instance.findMany.mockResolvedValue([])
    pluginRuntimeMocks.start.mockResolvedValue(undefined)
    pluginRuntimeMocks.stop.mockResolvedValue(undefined)
    interfaceMocks.startServer.mockResolvedValue(interfaceMocks.app)
    interfaceMocks.stopServer.mockResolvedValue(undefined)
    loggerKitMocks.telemetry.flush.mockResolvedValue(true)
    loggerKitMocks.telemetry.shutdown.mockResolvedValue(true)
  })

  afterEach(() => {
    delete bunEnv.ADMIN_TOKEN
    delete bunEnv.NAPGRAM_DISABLE_AUTO_MAIN
    delete bunEnv.SHOW_FULL_TOKEN
    mock.restore()
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
    await expect(main()).rejects.toThrow('NapGram shutdown failed with exit code 1')
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
    expect(loggerKitMocks.telemetry.flush).toHaveBeenCalledWith(3_000)
    expect(loggerKitMocks.telemetry.shutdown).toHaveBeenCalledWith(3_000)
  })

  it('generates a random ADMIN_TOKEN if not provided', async () => {
    delete bunEnv.ADMIN_TOKEN
    dbKitMocks.db.query.instance.findMany.mockResolvedValue([])

    const { main } = await import('../index')
    await main()

    expect(bunEnv.ADMIN_TOKEN).toBe('generated-admin-token')
    expect(loggerMocks.info).toHaveBeenCalledWith(expect.stringContaining('ADMIN_TOKEN auto-generated for this session'))
  })

  it('handles error objects with string message', async () => {
    const { handleFatalStartupError } = await import('../index')
    await expect(handleFatalStartupError({ message: 'some error message' })).rejects.toThrow('some error message')
    expect(loggerMocks.error).toHaveBeenCalledWith(expect.objectContaining({ error: { message: 'some error message' } }), 'Fatal startup error')
  })
})

describe('initInfra', () => {
  beforeEach(() => {
    mock.clearAllMocks()
  })

  it('configures telemetry to filter transient errors', async () => {
    const { initInfra } = await import('../bootstrap')
    await initInfra(loggerMocks as any)
    const filter = loggerKitMocks.telemetry.setExceptionFilter.mock.calls[0][0]

    expect(filter(new Error('ConnectionError: 连接超时'))).toBe(false)
    expect(filter(new TypeError('Normal error'))).toBe(true)
    expect(loggerKitMocks.telemetry.event).toHaveBeenCalledWith('app.boot', { stage: 'infrastructure' })
  })
})

describe('handleFatalStartupError directly', () => {
  beforeEach(() => {
    mock.restore()
  })

  afterEach(() => {
    mock.restore()
  })

  it('handles fatal startup errors', async () => {
    const { handleFatalStartupError } = await import('../bootstrap')
    await expect(handleFatalStartupError(new Error('fatal error'))).rejects.toThrow('fatal error')

    expect(loggerMocks.error).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(Error) }), 'Fatal startup error')
    expect(interfaceMocks.stopServer).toHaveBeenCalled()
    expect(pluginRuntimeMocks.stop).toHaveBeenCalled()
    expect(loggerKitMocks.telemetry.flush).toHaveBeenCalledWith(3_000)
    expect(loggerKitMocks.telemetry.shutdown).toHaveBeenCalledWith(3_000)
  })
})
