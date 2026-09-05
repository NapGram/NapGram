import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'

const dbMocks = (() => ({
  query: {
    message: {
      findFirst: mock(),
    },
  },
  update: mock(() => ({
    set: mock(() => ({
      where: mock().mockResolvedValue(undefined),
    })),
  })),
}))()

const envMock = (() => ({
  ENABLE_AUTO_RECALL: true,
  DATA_DIR: '/tmp/napgram',
  CACHE_DIR: '/tmp/napgram/cache',
  LOG_FILE: '/tmp/napgram-plugin-recall.log',
}))()

const schemaMock = (() => ({
  message: {
    instanceId: 'instanceId',
    qqRoomId: 'qqRoomId',
    qqChatType: 'qqChatType',
    seq: 'seq',
    id: 'id',
    tgChatId: 'tgChatId',
    tgMsgId: 'tgMsgId',
    ignoreDelete: 'ignoreDelete',
  },
}))()

mock.module('@napgram/db-kit', () => ({
  db: dbMocks,
  env: envMock,
  eq: mock((left: unknown, right: unknown) => ({ left, right })),
  and: mock((...clauses: unknown[]) => clauses),
  schema: schemaMock,
}))

mock.module('@napgram/env-kit', () => ({
  env: envMock,
}))

import plugin from '../index.js'

describe('plugin-recall', () => {
  let recallHandler: ((event: any) => Promise<void>) | undefined
  let deleteHandler: ((update: any) => Promise<void>) | undefined
  let unloadCallback: (() => Promise<void> | void) | undefined
  let fakeChat: { deleteMessages: ReturnType<typeof mock> }
  let fakeQqClient: {
    on: ReturnType<typeof mock>
    off: ReturnType<typeof mock>
    recallMessage: ReturnType<typeof mock>
  }
  let fakeTgBot: {
    getChat: ReturnType<typeof mock>
    addDeletedMessageEventHandler: ReturnType<typeof mock>
    removeDeletedMessageEventHandler: ReturnType<typeof mock>
  }
  let fakeInstance: any
  let ctx: any

  beforeEach(() => {
    mock.clearAllMocks()
    recallHandler = undefined
    deleteHandler = undefined
    unloadCallback = undefined

    fakeChat = {
      deleteMessages: mock().mockResolvedValue(undefined),
    }
    fakeQqClient = {
      on: mock((event: string, handler: any) => {
        if (event === 'recall') {
          recallHandler = handler
        }
      }),
      off: mock(),
      recallMessage: mock().mockResolvedValue(undefined),
    }
    fakeTgBot = {
      getChat: mock().mockResolvedValue(fakeChat),
      addDeletedMessageEventHandler: mock((handler: any) => {
        deleteHandler = handler
      }),
      removeDeletedMessageEventHandler: mock(),
    }
    fakeInstance = {
      id: 7,
      status: 'running',
      workMode: 'group',
      qqClient: fakeQqClient,
      tgBot: fakeTgBot,
    }

    ctx = {
      logger: {
        info: mock(),
        debug: mock(),
        warn: mock(),
        error: mock(),
      },
      native: {
        getInstance: mock((instanceId: number) => (instanceId === 7 ? fakeInstance : undefined)),
        getInstances: mock(() => [fakeInstance]),
      },
      on: mock((event: string, handler: any) => {
        if (event === 'instance-status') {
          return {
            unsubscribe: mock(),
          }
        }
        return {
          unsubscribe: mock(),
        }
      }),
      onUnload: mock((handler: any) => {
        unloadCallback = handler
      }),
    }
  })

  afterEach(() => {
    mock.clearAllMocks()
  })

  it('attaches recall handlers and processes QQ/TG recall events', async () => {
    dbMocks.query.message.findFirst.mockResolvedValueOnce({
      id: 11,
      tgChatId: BigInt(88),
      tgMsgId: BigInt(99),
      seq: 123,
    })
    dbMocks.query.message.findFirst.mockResolvedValueOnce({
      id: 12,
      seq: 456,
    })

    await plugin.install(ctx)

    expect(fakeQqClient.on).toHaveBeenCalledWith('recall', expect.any(Function))
    expect(fakeTgBot.addDeletedMessageEventHandler).toHaveBeenCalledWith(expect.any(Function))
    expect(recallHandler).toBeInstanceOf(Function)
    expect(deleteHandler).toBeInstanceOf(Function)

    await recallHandler?.({
      messageId: '123',
      chatId: '88',
      chatType: 'group',
    })

    expect(fakeTgBot.getChat).toHaveBeenCalledWith(88)
    expect(fakeChat.deleteMessages).toHaveBeenCalledWith([99])
    expect(dbMocks.update).toHaveBeenCalledWith(schemaMock.message)

    await deleteHandler?.({
      chatId: '88',
      messageIds: ['100'],
    })

    expect(fakeQqClient.recallMessage).toHaveBeenCalledWith('456')
  })

  it('detaches handlers during unload', async () => {
    dbMocks.query.message.findFirst.mockResolvedValue({
      id: 11,
      tgChatId: BigInt(88),
      tgMsgId: BigInt(99),
      seq: 123,
    })

    await plugin.install(ctx)
    await unloadCallback?.()

    expect(fakeQqClient.off).toHaveBeenCalledWith('recall', expect.any(Function))
    expect(fakeTgBot.removeDeletedMessageEventHandler).toHaveBeenCalledWith(expect.any(Function))
  })
})
