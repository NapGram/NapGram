import { beforeEach, describe, expect, it, mock } from 'bun:test'
import Instance from '../Instance'

// Mocks
const { mockInstance, mockUpdate, mockInsert } = (() => ({
  mockInstance: {
    id: 1,
    owner: 0,
    isSetup: false,
    workMode: 'personal',
    flags: 0,
    botSessionId: 0,
    qqBot: { wsUrl: 'ws://fake' },
  },
  mockUpdate: mock(() => ({
    set: mock(() => ({
      where: mock().mockResolvedValue(undefined),
    })),
  })),
  mockInsert: mock(() => ({
    values: mock(() => ({
      returning: mock().mockResolvedValue([{ id: 1 }]),
    })),
  })),
}))()

mock.module('@napgram/env-kit', () => ({
  env: {
    TG_BOT_TOKEN: 'fake-token',
    NAPCAT_WS_URL: 'ws://fake',
    LOG_FILE: '/tmp/test.log',
    DATA_DIR: '/tmp/data',
    CACHE_DIR: '/tmp/cache',
  },
}))

mock.module('@napgram/db-kit', () => ({
  db: {
    query: {
      instance: {
        findFirst: mock().mockResolvedValue(mockInstance),
      },
    },
    insert: mockInsert,
    update: mockUpdate,
  },
  schema: { instance: { id: 'id' } },
  eq: mock(),
  ForwardMap: {
    load: mock().mockResolvedValue({ map: true }),
  },
}))

mock.module('@napgram/logger-kit', () => ({
  getLogger: mock(() => ({
    info: mock(),
    debug: mock(),
    error: mock(),
    warn: mock(),
    trace: mock(),
  })),
  telemetry: {
    captureException: mock(),
  },
}))

mock.module('../../../infrastructure/clients/qq', () => ({
  qqClientFactory: {
    create: mock().mockResolvedValue({
      login: mock(),
      on: mock(),
    }),
  },
}))
mock.module('../../../infrastructure/clients/telegram', () => ({
  telegramClientFactory: {
    connect: mock(),
    create: mock().mockResolvedValue({
      sessionId: 123,
      me: { id: 123, username: 'test_bot' },
    }),
  },
}))

mock.module('../../../features/runtime/instance-registry', () => ({
  instanceRegistry: {
    add: mock(),
    remove: mock(),
  },
}))

mock.module('@napgram/plugin-kit', () => ({
  getEventPublisher: mock(() => ({
    publishInstanceStatus: mock(),
    publishFriendRequest: mock(),
    publishGroupRequest: mock(),
    publishNotice: mock(),
  })),
}))

describe('instance Branches', () => {
  beforeEach(async () => {
    const { telegramClientFactory } = await import('../../../infrastructure/clients/telegram')
    ;(telegramClientFactory.create as any).mockClear()
    mockUpdate.mockClear()
  })

  // Hack to access private constructor or we use static method
  // Instance.start calls new Instance(id)

  it('should handle property setters', async () => {
    const instance = await Instance.createNew('token') as Instance
    mockUpdate.mockClear()

    // Setters trigger db update
    instance.owner = 123
    const ownerSetCalls = (mockUpdate as any).mock.results[0]?.value?.set?.mock?.calls ?? []
    expect(ownerSetCalls[0]?.[0]).toEqual({ owner: BigInt(123) })

    instance.isSetup = true
    const setupSetCalls = (mockUpdate as any).mock.results[1]?.value?.set?.mock?.calls ?? []
    expect(setupSetCalls[0]?.[0]).toEqual({ isSetup: true })

    instance.workMode = 'group'
    const workModeSetCalls = (mockUpdate as any).mock.results[2]?.value?.set?.mock?.calls ?? []
    expect(workModeSetCalls[0]?.[0]).toEqual({ workMode: 'group' })

    instance.botSessionId = 999
    const botSessionSetCalls = (mockUpdate as any).mock.results[3]?.value?.set?.mock?.calls ?? []
    expect(botSessionSetCalls[0]?.[0]).toEqual({ botSessionId: 999 })

    instance.flags = 1
    const flagsSetCalls = (mockUpdate as any).mock.results[4]?.value?.set?.mock?.calls ?? []
    expect(flagsSetCalls[0]?.[0]).toEqual({ flags: 1 })

    // qqBotId setter
    instance.qqBotId = 111
    const qqBotSetCalls = (mockUpdate as any).mock.results[5]?.value?.set?.mock?.calls ?? []
    expect(qqBotSetCalls[0]?.[0]).toEqual({ qqBotId: 111 })
  })

  it('should not re-initialize on subsequent init calls', async () => {
    const instance = await Instance.createNew('token') as any

    await instance.init('t2')

    const { telegramClientFactory } = await import('../../../infrastructure/clients/telegram')
    expect(telegramClientFactory.create).toHaveBeenCalledTimes(1)
  })

  it('should throw when createNew returns no db entry', async () => {
    mockInsert.mockReturnValueOnce({
      values: mock(() => ({
        returning: mock().mockResolvedValue([]),
      })),
    })

    await expect(Instance.createNew('token')).rejects.toThrow('Failed to create instance')
  })
})
