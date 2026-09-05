import { bytesFromUtf8 } from '../../../shared/utils/binary.js'
import { beforeEach, describe, expect, it, mock } from 'bun:test'
import TelegramSession from '../TelegramSession'

const envMock = (() => ({
  TG_INITIAL_DCID: 9,
  TG_INITIAL_SERVER: '203.0.113.10',
}))()

const dbMocks = (() => ({
  query: {
    instance: {
      findFirst: mock(),
    },
    session: {
      findFirst: mock(),
    },
  },
  insert: mock(() => ({
    values: mock(() => ({
      returning: mock().mockResolvedValue([]),
      onConflictDoUpdate: mock(() => ({
        returning: mock().mockResolvedValue([]),
      })),
    })),
  })),
  update: mock(() => ({
    set: mock(() => ({
      where: mock().mockResolvedValue(undefined),
    })),
  })),
}))()

const schemaMocks = (() => ({
  instance: {
    id: 'id',
    owner: 'owner',
    isSetup: 'isSetup',
    workMode: 'workMode',
    botSessionId: 'botSessionId',
    qqBotId: 'qqBotId',
    flags: 'flags',
  },
  session: {
    id: 'id',
    dcId: 'dcId',
    serverAddress: 'serverAddress',
    authKey: 'authKey',
  },
}))()

const eqMock = (() => mock((left, right) => ({ left, right })))()

const loggerMocks = (() => ({
  trace: mock(),
  debug: mock(),
  warn: mock(),
}))()

mock.module('@napgram/env-kit', () => ({
  env: envMock,
}))

mock.module('@napgram/db-kit', () => ({
  db: dbMocks,
  schema: schemaMocks,
  eq: eqMock,
}))

mock.module('@napgram/logger-kit', () => ({
  getLogger: mock(() => loggerMocks),
}))

describe('telegramSession', () => {
  beforeEach(() => {
    dbMocks.query.instance.findFirst.mockClear()
    dbMocks.query.session.findFirst.mockClear()
    dbMocks.insert.mockClear()
    dbMocks.update.mockClear()
    eqMock.mockClear()
    loggerMocks.trace.mockClear()
    loggerMocks.debug.mockClear()
    loggerMocks.warn.mockClear()
  })

  it('creates a new session entry when dbId is missing', async () => {
    const returningMock = mock().mockResolvedValue([{ id: 42 }])
    const valuesMock = mock().mockReturnValue({ returning: returningMock })
    dbMocks.insert.mockReturnValue({ values: valuesMock })
    const session = new TelegramSession()

    await session.load()

    expect(dbMocks.insert).toHaveBeenCalledWith(schemaMocks.session)
    expect(valuesMock).toHaveBeenCalledWith({
      dcId: envMock.TG_INITIAL_DCID,
      serverAddress: envMock.TG_INITIAL_SERVER,
    })
    expect(returningMock).toHaveBeenCalledWith({ id: schemaMocks.session.id })
    expect(session.dbId).toBe(42)
    expect(session.sessionString).toBeUndefined()
  })

  it('loads session string when authKey looks valid', async () => {
    dbMocks.query.session.findFirst.mockResolvedValue({
      authKey: bytesFromUtf8('abc123'),
    })
    const session = new TelegramSession(7)

    await session.load()

    expect(eqMock).toHaveBeenCalledWith(schemaMocks.session.id, 7)
    expect(dbMocks.query.session.findFirst).toHaveBeenCalledWith({
      where: { left: schemaMocks.session.id, right: 7 },
    })
    expect(session.sessionString).toBe('abc123')
  })

  it('ignores authKey that does not look like a session string', async () => {
    dbMocks.query.session.findFirst.mockResolvedValue({
      authKey: new Uint8Array([0, 1, 2]),
    })
    const session = new TelegramSession(8)

    await session.load()

    expect(session.sessionString).toBeUndefined()
    expect(loggerMocks.warn).toHaveBeenCalled()
  })

  it('upserts session string when dbId is set', async () => {
    const onConflictMock = mock()
    const valuesMock = mock().mockReturnValue({
      onConflictDoUpdate: onConflictMock,
    })
    dbMocks.insert.mockReturnValue({ values: valuesMock })
    const session = new TelegramSession(9)

    await session.save('session-value')

    const expectedAuthKey = bytesFromUtf8('session-value')
    expect(dbMocks.insert).toHaveBeenCalledWith(schemaMocks.session)
    expect(valuesMock).toHaveBeenCalledWith({
      id: 9,
      dcId: envMock.TG_INITIAL_DCID,
      serverAddress: envMock.TG_INITIAL_SERVER,
      authKey: expectedAuthKey,
    })
    expect(onConflictMock).toHaveBeenCalledWith({
      target: schemaMocks.session.id,
      set: { authKey: expectedAuthKey },
    })
    expect(session.sessionString).toBe('session-value')
  })

  it('uses default DC ID and server address when env vars are missing', async () => {
    // Temporarily mock env values to undefined
    const originalDcid = envMock.TG_INITIAL_DCID
    const originalServer = envMock.TG_INITIAL_SERVER
    // @ts-expect-error: mock env value
    envMock.TG_INITIAL_DCID = undefined
    // @ts-expect-error: mock env value
    envMock.TG_INITIAL_SERVER = undefined

    const returningMock = mock().mockResolvedValue([{ id: 50 }])
    const valuesMock = mock().mockReturnValue({ returning: returningMock })
    dbMocks.insert.mockReturnValue({ values: valuesMock })
    const session = new TelegramSession()
    await session.load()

    expect(valuesMock).toHaveBeenCalledWith({
      dcId: 2,
      serverAddress: '149.154.167.50',
    })

    // Restore
    envMock.TG_INITIAL_DCID = originalDcid
    envMock.TG_INITIAL_SERVER = originalServer
  })

  it('does not save session if dbId is missing', async () => {
    const session = new TelegramSession()
    // dbId is undefined since we didn't call load()
    await session.save('s')
    expect(dbMocks.insert).not.toHaveBeenCalled()
  })

  it('handles existing dbEntry but missing/null authKey', async () => {
    dbMocks.query.session.findFirst.mockResolvedValue({
      id: 10,
      authKey: null, // null authKey
    })
    const session = new TelegramSession(10)
    await session.load()
    expect(session.sessionString).toBeUndefined()
  })

  it('uses default values in save upsert when env vars are missing', async () => {
    const originalDcid = envMock.TG_INITIAL_DCID
    const originalServer = envMock.TG_INITIAL_SERVER
    // @ts-expect-error: mock env value
    envMock.TG_INITIAL_DCID = undefined
    // @ts-expect-error: mock env value
    envMock.TG_INITIAL_SERVER = undefined

    const valuesMock = mock().mockReturnValue({
      onConflictDoUpdate: mock(),
    })
    dbMocks.insert.mockReturnValue({ values: valuesMock })
    const session = new TelegramSession(11)
    await session.save('s')

    expect(valuesMock).toHaveBeenCalledWith(expect.objectContaining({
      dcId: 2,
      serverAddress: '149.154.167.50',
    }))

    // Restore
    envMock.TG_INITIAL_DCID = originalDcid
    envMock.TG_INITIAL_SERVER = originalServer
  })
})
