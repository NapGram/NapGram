import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const dbMocks = vi.hoisted(() => ({
  query: {
    message: {
      findFirst: vi.fn(),
    },
  },
  update: vi.fn(() => ({
    set: vi.fn(() => ({
      where: vi.fn().mockResolvedValue(undefined),
    })),
  })),
}))

const envMock = vi.hoisted(() => ({
  ENABLE_AUTO_RECALL: true,
  DATA_DIR: '/tmp/napgram',
  CACHE_DIR: '/tmp/napgram/cache',
  LOG_FILE: '/tmp/napgram-plugin-recall.log',
}))

const schemaMock = vi.hoisted(() => ({
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
}))

vi.mock('@napgram/db-kit', () => ({
  db: dbMocks,
  env: envMock,
  eq: vi.fn((left: unknown, right: unknown) => ({ left, right })),
  and: vi.fn((...clauses: unknown[]) => clauses),
  schema: schemaMock,
}))

vi.mock('@napgram/env-kit', () => ({
  env: envMock,
}))

import plugin from '../index.js'

describe('plugin-recall', () => {
  let recallHandler: ((event: any) => Promise<void>) | undefined
  let deleteHandler: ((update: any) => Promise<void>) | undefined
  let unloadCallback: (() => Promise<void> | void) | undefined
  let fakeChat: { deleteMessages: ReturnType<typeof vi.fn> }
  let fakeQqClient: {
    on: ReturnType<typeof vi.fn>
    off: ReturnType<typeof vi.fn>
    recallMessage: ReturnType<typeof vi.fn>
  }
  let fakeTgBot: {
    getChat: ReturnType<typeof vi.fn>
    addDeletedMessageEventHandler: ReturnType<typeof vi.fn>
    removeDeletedMessageEventHandler: ReturnType<typeof vi.fn>
  }
  let fakeInstance: any
  let ctx: any

  beforeEach(() => {
    vi.clearAllMocks()
    recallHandler = undefined
    deleteHandler = undefined
    unloadCallback = undefined

    fakeChat = {
      deleteMessages: vi.fn().mockResolvedValue(undefined),
    }
    fakeQqClient = {
      on: vi.fn((event: string, handler: any) => {
        if (event === 'recall') {
          recallHandler = handler
        }
      }),
      off: vi.fn(),
      recallMessage: vi.fn().mockResolvedValue(undefined),
    }
    fakeTgBot = {
      getChat: vi.fn().mockResolvedValue(fakeChat),
      addDeletedMessageEventHandler: vi.fn((handler: any) => {
        deleteHandler = handler
      }),
      removeDeletedMessageEventHandler: vi.fn(),
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
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      native: {
        getInstance: vi.fn((instanceId: number) => (instanceId === 7 ? fakeInstance : undefined)),
        getInstances: vi.fn(() => [fakeInstance]),
      },
      on: vi.fn((event: string, handler: any) => {
        if (event === 'instance-status') {
          return {
            unsubscribe: vi.fn(),
          }
        }
        return {
          unsubscribe: vi.fn(),
        }
      }),
      onUnload: vi.fn((handler: any) => {
        unloadCallback = handler
      }),
    }
  })

  afterEach(() => {
    vi.clearAllMocks()
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
