import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { ConnectionSupervisor, type ConnectionSupervisorHost } from '../ConnectionSupervisor.js'

const qqFactory = { create: mock() }
const tgFactory = {
  create: mock(),
  connect: mock(),
}
const forwardMapLoad = mock()
const bridgeQQEvents = mock()
const enableDiagnostics = mock()
const eventPublisher = {
  publishInstanceStatus: mock().mockResolvedValue(undefined),
  publishNotice: mock().mockResolvedValue(undefined),
}

mock.module('@napgram/env-kit', () => ({
  env: {
    TG_BOT_TOKEN: '',
    NAPCAT_WS_URL: '',
    DATA_DIR: '/tmp',
    CACHE_DIR: '/tmp/cache',
  },
}))

mock.module('@napgram/logger-kit', () => ({
  getLogger: mock(() => ({
    debug: mock(),
    info: mock(),
    warn: mock(),
    error: mock(),
    trace: mock(),
  })),
  telemetry: { captureException: mock() },
}))

mock.module('@napgram/message-kit', () => ({
  messageConverter: { setInstance: mock() },
}))

mock.module('@napgram/plugin-kit', () => ({
  getEventPublisher: mock(() => eventPublisher),
}))

mock.module('../../../infrastructure/clients/qq', () => ({
  qqClientFactory: qqFactory,
}))

mock.module('../../../infrastructure/clients/telegram', () => ({
  telegramClientFactory: tgFactory,
}))

mock.module('../../models/services/QQEventBridge.js', () => ({
  bridgeQQEvents,
}))

mock.module('../../models/services/QQMediaDiagnostics.js', () => ({
  enableQQMediaDownloadDiagnostics: enableDiagnostics,
}))

mock.module('@napgram/db-kit', () => ({
  ForwardMap: { load: forwardMapLoad },
}))

function makeFakeClient() {
  const handlers = new Map<string, any[]>()
  return {
    login: mock().mockResolvedValue(undefined),
    on: mock((event: string, handler: any) => {
      if (!handlers.has(event))
        handlers.set(event, [])
      handlers.get(event)!.push(handler)
    }),
    __handlers: handlers,
  } as any
}

function makeHost(overrides: Record<string, any> = {}): ConnectionSupervisorHost {
  return {
    id: 1,
    log: {
      debug: mock(),
      info: mock(),
      warn: mock(),
      error: mock(),
      trace: mock(),
    } as any,
    qq: null,
    isInit: false,
    isSetup: false,
    status: 'idle',
    botSessionId: 0,
    hasConfiguredWorkMode: mock().mockReturnValue(true),
    startUserBot: mock().mockResolvedValue(undefined),
    stopUserBot: mock().mockResolvedValue(undefined),
    workMode: 'group',
    ...overrides,
  } as any
}

function makeService() {
  return { initIfNeeded: mock().mockResolvedValue(undefined) } as any
}

describe('connectionSupervisor', () => {
  beforeEach(() => {
    qqFactory.create.mockReset()
    tgFactory.create.mockReset()
    tgFactory.connect.mockReset()
    forwardMapLoad.mockReset().mockResolvedValue({})
    bridgeQQEvents.mockReset()
    enableDiagnostics.mockReset()
    eventPublisher.publishInstanceStatus.mockReset().mockResolvedValue(undefined)
    eventPublisher.publishNotice.mockReset().mockResolvedValue(undefined)
  })

  it('throws when no bot token and no session id', async () => {
    const supervisor = new ConnectionSupervisor(makeHost(), makeService())
    await expect(supervisor.login(undefined)).rejects.toThrow('botToken 未指定')
  })

  it('throws when neither NapCat nor official credentials are configured', async () => {
    tgFactory.connect.mockResolvedValue({ sessionId: 5 })
    const supervisor = new ConnectionSupervisor(makeHost({ botSessionId: 5 }), makeService())
    await expect(supervisor.login()).rejects.toThrow('NapCat WebSocket 地址未配置')
  })

  it('connects an existing session and wires the official client with event bridge', async () => {
    const tgBot = { sessionId: 5 }
    tgFactory.connect.mockResolvedValue(tgBot)
    const official = makeFakeClient()
    qqFactory.create.mockResolvedValue(official)

    const host = makeHost({
      botSessionId: 5,
      qq: { officialAppId: 'app', officialAppSecret: 'sec' },
    })
    const supervisor = new ConnectionSupervisor(host, makeService())
    await supervisor.login()

    expect(tgFactory.connect).toHaveBeenCalled()
    expect(qqFactory.create).toHaveBeenCalledWith(expect.objectContaining({ type: 'qqofficial' }))
    expect(official.login).toHaveBeenCalledTimes(1)
    expect(bridgeQQEvents).toHaveBeenCalledTimes(2) // router + official
    expect(host.status).toBe('running')
    expect(host.qqClient).toBe(official) // 单客户端直接返回原对象
  })

  it('creates a new bot session, routes napcat+official and enables diagnostics', async () => {
    const tgBot = { sessionId: 9 }
    tgFactory.create.mockResolvedValue(tgBot)
    const napcat = makeFakeClient()
    const official = makeFakeClient()
    qqFactory.create.mockImplementation(async (opts: any) =>
      opts.type === 'napcat' ? napcat : official)

    const host = makeHost({
      qq: {
        wsUrl: 'ws://napcat',
        wsToken: 'tok',
        officialAppId: 'app',
        officialAppSecret: 'sec',
      },
      hasConfiguredWorkMode: mock().mockReturnValue(false),
    })
    const supervisor = new ConnectionSupervisor(host, makeService())
    await supervisor.login('token-x')

    expect(tgFactory.create).toHaveBeenCalled()
    expect(host.botSessionId).toBe(9)
    expect(enableDiagnostics).toHaveBeenCalledWith(napcat, host.log)
    expect(bridgeQQEvents).toHaveBeenCalledTimes(2)

    // 事件处理器在 router 上注册；workMode 未配置时提前返回
    const offlineHandlers = napcat.__handlers.get('offline') || []
    const onlineHandlers = napcat.__handlers.get('online') || []
    const lostHandlers = napcat.__handlers.get('connection:lost') || []
    expect(offlineHandlers.length).toBeGreaterThan(0)
    await offlineHandlers[0]()
    await onlineHandlers[0]()
    await lostHandlers[0]({ timestamp: 123 })
    expect(eventPublisher.publishNotice).not.toHaveBeenCalled()
    expect(host.isSetup).toBe(false)
  })

  it('publishes connection notices when work mode is configured', async () => {
    tgFactory.create.mockResolvedValue({ sessionId: 9 })
    const napcat = makeFakeClient()
    qqFactory.create.mockResolvedValue(napcat)

    const host = makeHost({ qq: { wsUrl: 'ws://napcat' } })
    const supervisor = new ConnectionSupervisor(host, makeService())
    await supervisor.login('token-x')

    const handlers = napcat.__handlers
    await (handlers.get('offline') || [])[0]()
    expect(eventPublisher.publishNotice).toHaveBeenCalledWith(expect.objectContaining({ noticeType: 'connection-lost' }))
    expect(host.isSetup).toBe(false)

    await (handlers.get('online') || [])[0]()
    expect(eventPublisher.publishNotice).toHaveBeenCalledWith(expect.objectContaining({ noticeType: 'connection-restored' }))
    expect(host.isSetup).toBe(true)

    await (handlers.get('connection:lost') || [])[0]({ timestamp: 555 })
    expect(eventPublisher.publishNotice).toHaveBeenCalledWith(expect.objectContaining({ noticeType: 'connection-lost', timestamp: 555 }))

    // 通知失败被吞掉
    eventPublisher.publishNotice.mockRejectedValueOnce(new Error('publish boom'))
    await (handlers.get('offline') || [])[0]()
  })

  it('reuses the in-flight login promise', async () => {
    tgFactory.create.mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 30))
      return { sessionId: 3 }
    })
    const napcat = makeFakeClient()
    qqFactory.create.mockResolvedValue(napcat)

    const host = makeHost({ qq: { wsUrl: 'ws://napcat' } })
    const supervisor = new ConnectionSupervisor(host, makeService())
    const [a, b] = await Promise.all([supervisor.login('token'), supervisor.login('token')])
    expect(a).toBeUndefined()
    expect(b).toBeUndefined()
    expect(tgFactory.create).toHaveBeenCalledTimes(1)
  })

  it('bridging failure only warns and login still completes', async () => {
    tgFactory.create.mockResolvedValue({ sessionId: 2 })
    const napcat = makeFakeClient()
    qqFactory.create.mockResolvedValue(napcat)
    bridgeQQEvents.mockImplementation(() => {
      throw new Error('bridge boom')
    })

    const host = makeHost({ qq: { wsUrl: 'ws://napcat' } })
    const supervisor = new ConnectionSupervisor(host, makeService())
    await expect(supervisor.login('token')).resolves.toBeUndefined()
    expect(host.status).toBe('running')
  })
})
