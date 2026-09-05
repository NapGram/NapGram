import { db } from '@napgram/db-kit'
import { describe, expect, it, mock } from 'bun:test'
import Instance from '../Instance'

// Local mock removed to rely on fixed global mock
const { mockUpdate, mockInsert } = (() => ({
  mockUpdate: mock(() => ({
    set: mock(() => ({
      where: mock().mockResolvedValue({}),
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
        findFirst: mock(),
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
  qqClientFactory: { create: mock().mockResolvedValue({ login: mock(), on: mock() }) },
}))

// Mock telegram with undefined sessionId
mock.module('../../../infrastructure/clients/telegram', () => ({
  telegramClientFactory: {
    connect: mock(),
    create: mock().mockResolvedValue({
      sessionId: undefined, // The Key Difference
      start: mock(),
      setParseMode: mock(),
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
  })),
}))

describe('instance Session Coverage', () => {
  it('should default botSessionId to 0 when sessionId is undefined', async () => {
    // Setup mock return values via the global mock
    (db.query.instance.findFirst as any).mockResolvedValue({ id: 1 } as any)

    const instance = await Instance.createNew('token') as Instance

    expect(instance.botSessionId).toBe(0)
  })
})
