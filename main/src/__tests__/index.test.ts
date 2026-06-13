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
vi.mock('../infrastructure/services/PerformanceMonitor', () => performanceMonitorMocks)
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

    expect(pluginRuntimeMocks.start).toHaveBeenCalledWith({
      defaultInstances: [1, 2],
      webRoutes: interfaceMocks.registerWebRoutes,
      builtins: [{ id: 'builtin-test' }],
    })
    expect(interfaceMocks.startServer).toHaveBeenCalledWith(interfaceMocks.app)
    expect(instanceA.commandsFeature.reloadCommands).toHaveBeenCalled()
    expect(instanceB.commandsFeature.reloadCommands).toHaveBeenCalled()
    expect(process.exit).not.toHaveBeenCalled()
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
})
