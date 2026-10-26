import type { UnifiedMessage } from '@napgram/message-kit'
import type { CommandContext } from '../CommandContext.js'
import { db } from '@napgram/db-kit'
import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { RecallCommandHandler } from '../RecallCommandHandler.js'

mock.module('@napgram/db-kit', async () => {
  const mockDb = {
    query: {
      message: { findFirst: mock(), findMany: mock() },
      forwardPair: { findFirst: mock(), findMany: mock() },
      forwardMultiple: { findFirst: mock(), findMany: mock() },
      qqRequest: { findFirst: mock(), findMany: mock() },
    },
    update: mock(() => ({
      set: mock(() => ({
        where: mock().mockResolvedValue({}),
      })),
    })),
    insert: mock(() => ({
      values: mock(() => ({
        returning: mock().mockResolvedValue([]),
      })),
    })),
    select: mock(() => ({
      from: mock(() => ({
        where: mock(() => ({
          groupBy: mock().mockResolvedValue([]),
        })),
        groupBy: mock().mockResolvedValue([]),
      })),
    })),
    execute: mock().mockResolvedValue({ rows: [] }),
  }

  return {
    db: mockDb,
    schema: {
      message: { id: 'id', tgChatId: 'tgChatId', tgMsgId: 'tgMsgId', qqChatType: 'qqChatType', qqRoomId: 'qqRoomId', seq: 'seq', instanceId: 'instanceId' },
      forwardPair: { id: 'id' },
      qqRequest: { id: 'id' },
    },
    eq: mock(),
    and: mock(),
    lt: mock(),
    desc: mock(),
    gte: mock(),
    sql: mock(),
    count: mock(),
  }
})

mock.module('@napgram/env-kit', async () => ({
  env: {
    ENABLE_AUTO_RECALL: true,
    TG_MEDIA_TTL_SECONDS: undefined,
    DATA_DIR: '/tmp',
    CACHE_DIR: '/tmp/cache',
    WEB_ENDPOINT: 'http://napgram-dev:8080',
  },
}))

mock.module('@napgram/logger-kit', async () => ({
  getLogger: mock(() => ({
    debug: mock(),
    info: mock(),
    warn: mock(),
    error: mock(),
    trace: mock(),
  })),
}))

function createMockContext(): CommandContext {
  return {
    qqClient: {
      recallMessage: mock().mockResolvedValue(undefined),
    } as any,
    tgBot: {
      getChat: mock().mockResolvedValue({
        deleteMessages: mock().mockResolvedValue(undefined),
      }),
      client: {
        call: mock().mockResolvedValue([{ id: 1 }]),
      },
    } as any,
    registry: {} as any,
    permissionChecker: {
      isAdmin: mock().mockReturnValue(false),
    } as any,
    stateManager: {} as any,
    instance: {
      id: 1,
      owner: '123456',
      forwardPairs: {} as any,
      reload: mock().mockResolvedValue(undefined),
    } as any,
    replyTG: mock().mockResolvedValue(undefined),
    extractThreadId: mock().mockReturnValue(undefined),
  } as any
}

function createMessage(platform: 'telegram' | 'qq' = 'telegram', raw?: any): UnifiedMessage {
  return {
    id: '12345',
    platform,
    sender: {
      id: '999999',
      name: 'TestUser',
    },
    chat: {
      id: '777777',
      type: platform === 'qq' ? 'private' : 'group',
    },
    content: [
      {
        type: 'text',
        data: { text: '/rm' },
      },
    ],
    timestamp: Date.now(),
    metadata: raw ? { raw } : {},
  }
}

describe('recallCommandHandler', () => {
  let handler: RecallCommandHandler
  let mockContext: CommandContext

  beforeEach(() => {
    mock.clearAllMocks()
    mockContext = createMockContext()
    handler = new RecallCommandHandler(mockContext)
  })

  it('rejects batch recall on non-telegram platform', async () => {
    const msg = createMessage('qq')
    await handler.execute(msg, ['5'])

    expect(mockContext.replyTG).toHaveBeenCalledWith(
      '777777',
      expect.stringContaining('仅支持 Telegram'),
    )
  })

  it('requires admin for batch recall', async () => {
    const msg = createMessage('telegram')
    await handler.execute(msg, ['5'])

    expect(mockContext.replyTG).toHaveBeenCalledWith(
      '777777',
      expect.stringContaining('需要管理员权限'),
    )
  })

  it('limits batch recall count', async () => {
    mockContext.permissionChecker.isAdmin.mockReturnValue(true)

    const msg = createMessage('telegram')
    await handler.execute(msg, ['101'])

    expect(mockContext.replyTG).toHaveBeenCalledWith(
      '777777',
      expect.stringContaining('最多支持 100'),
    )
  })

  it('prompts when no reply target is provided', async () => {
    const msg = createMessage('telegram')
    await handler.execute(msg, [])

    expect(mockContext.replyTG).toHaveBeenCalledWith(
      '777777',
      expect.stringContaining('请回复要撤回的消息'),
    )
  })

  it('denies recall when sender lacks permission', async () => {
    db.query.message.findFirst.mockResolvedValueOnce({
      tgSenderId: '111111',
    } as any)

    const msg = createMessage('telegram', { replyToMessage: { id: 42 } })
    await handler.execute(msg, [])

    expect(mockContext.replyTG).toHaveBeenCalledWith(
      '777777',
      expect.stringContaining('无权限撤回'),
    )
  })

  it('recalls a telegram message when authorized', async () => {
    mockContext.permissionChecker.isAdmin.mockReturnValue(true)
    db.query.message.findFirst.mockResolvedValueOnce({
      tgSenderId: '999999',
      tgMsgId: 42,
      tgChatId: '777777',
      seq: 777,
    } as any)

    const chat = { deleteMessages: mock().mockResolvedValue(undefined) }
    mockContext.tgBot.getChat.mockResolvedValue(chat as any)

    const msg = createMessage('telegram', { replyTo: { replyToMsgId: 42 } })
    await handler.execute(msg, [])

    expect(chat.deleteMessages).toHaveBeenCalledWith([42])
    expect(mockContext.qqClient.recallMessage).toHaveBeenCalledWith('777')
  })

  it('handles batch recall success path', async () => {
    mockContext.permissionChecker.isAdmin.mockReturnValue(true)
    db.query.message.findMany.mockResolvedValueOnce([
      { tgMsgId: 40, seq: '111', tgChatId: '777777' },
      { tgMsgId: 39, seq: '222', tgChatId: '777777' },
    ] as any)

    const chat = { deleteMessages: mock().mockResolvedValue(undefined) }
    mockContext.tgBot.getChat.mockResolvedValue(chat as any)

    const msg = createMessage('telegram', { id: 50 })
    await handler.execute(msg, ['2'])

    expect(mockContext.qqClient.recallMessage).toHaveBeenCalledWith('111')
    expect(mockContext.qqClient.recallMessage).toHaveBeenCalledWith('222')
    expect(chat.deleteMessages).toHaveBeenCalledWith([40])
    expect(chat.deleteMessages).toHaveBeenCalledWith([39])
  })

  it('recalls from QQ platform and removes TG mapping', async () => {
    db.query.message.findFirst.mockResolvedValueOnce({
      tgSenderId: '999999',
      tgMsgId: 88,
      tgChatId: '777777',
      seq: 55,
    } as any)

    const chat = { deleteMessages: mock().mockResolvedValue(undefined) }
    mockContext.tgBot.getChat.mockResolvedValue(chat as any)

    const msg = createMessage('qq')
    msg.content.push({ type: 'reply', data: { messageId: '55' } } as any)

    await handler.execute(msg, [])

    expect(mockContext.qqClient.recallMessage).toHaveBeenCalledWith('55')
    expect(chat.deleteMessages).toHaveBeenCalledWith([88])
  })

  it('does not remove the TG mapping from QQ /rm when auto recall is disabled', async () => {
    const { env } = await import('@napgram/env-kit')
    env.ENABLE_AUTO_RECALL = false
    db.query.message.findFirst.mockResolvedValueOnce({
      tgSenderId: '999999',
      tgMsgId: 88,
      tgChatId: '777777',
      seq: 55,
    } as any)

    const chat = { deleteMessages: mock().mockResolvedValue(undefined) }
    mockContext.tgBot.getChat.mockResolvedValue(chat as any)

    const msg = createMessage('qq')
    msg.content.push({ type: 'reply', data: { messageId: '55' } } as any)

    await handler.execute(msg, [])

    expect(mockContext.qqClient.recallMessage).toHaveBeenCalledWith('55')
    expect(chat.deleteMessages).not.toHaveBeenCalledWith([88])
  })

  describe('recall error paths', () => {
    function adminContext(): CommandContext {
      const ctx = createMockContext()
      ;(ctx.permissionChecker.isAdmin as any).mockReturnValue(true)
      return ctx
    }

    beforeEach(async () => {
      // an earlier test in this file disables auto recall on the shared env
      // object and never restores it
      const { env } = await import('@napgram/env-kit')
      env.ENABLE_AUTO_RECALL = true
    })

    it('reports when the batch query finds no messages', async () => {
      const ctx = adminContext()
      const handler = new RecallCommandHandler(ctx)
      ;(db.query.message.findMany as any).mockResolvedValue([])

      await handler.execute(createMessage('telegram', { id: 1234 }), ['3'])

      expect(ctx.replyTG).toHaveBeenCalledWith('777777', '没有找到可撤回的消息')
    })

    it('keeps going when individual QQ recalls or TG deletions fail', async () => {
      const ctx = adminContext()
      const handler = new RecallCommandHandler(ctx)
      ;(db.query.message.findMany as any).mockResolvedValue([
        { tgMsgId: 11n, seq: 's1' },
        { tgMsgId: 12n, seq: 's2' },
      ])
      ;(ctx.qqClient.recallMessage as any).mockRejectedValueOnce(new Error('qq boom'))
      const chat = await ctx.tgBot.getChat(777777)
      let deleteCalls = 0
      ;(chat as any).deleteMessages = async () => {
        deleteCalls++
        // 第一条 TG 删除失败，第二条成功，命令消息删除再失败
        if (deleteCalls === 1 || deleteCalls === 3)
          throw new Error('tg boom')
        return undefined
      }

      await expect(handler.execute(createMessage('telegram', { id: 1234 }), ['2'])).resolves.toBeUndefined()
      expect(ctx.qqClient.recallMessage).toHaveBeenCalledTimes(2)
      expect(deleteCalls).toBe(3)
    })

    it('replies failure hint when the batch query throws', async () => {
      const ctx = adminContext()
      const handler = new RecallCommandHandler(ctx)
      ;(db.query.message.findMany as any).mockRejectedValue(new Error('db down'))

      await handler.execute(createMessage('telegram', { id: 1234 }), ['3'])

      expect(ctx.replyTG).toHaveBeenCalledWith('777777', '❌ 批量撤回失败，请查看日志')
    })

    it('single recall tolerates TG deletion and QQ recall failures', async () => {
      const ctx = adminContext()
      const handler = new RecallCommandHandler(ctx)
      ;(db.query.message.findFirst as any).mockResolvedValue({ seq: 's5', tgSenderId: '999999' })
      ;(ctx.qqClient.recallMessage as any).mockRejectedValue(new Error('qq recall boom'))
      ;(ctx.tgBot.getChat as any).mockRejectedValue(new Error('tg boom'))

      await expect(handler.execute(createMessage('telegram', { id: 1234, replyTo: { id: 55 } }), [])).resolves.toBeUndefined()
      expect(ctx.qqClient.recallMessage).toHaveBeenCalledWith('s5')
    })

    it('single recall from QQ tolerates both side failures', async () => {
      const ctx = adminContext()
      const handler = new RecallCommandHandler(ctx)
      ;(db.query.message.findFirst as any).mockResolvedValue({ seq: '77', tgMsgId: 88n, tgChatId: '777777' })
      ;(ctx.qqClient.recallMessage as any).mockRejectedValue(new Error('qq boom'))
      ;(ctx.tgBot.getChat as any).mockRejectedValue(new Error('tg boom'))
      const msg = createMessage('qq')
      msg.content = [{ type: 'reply', data: { seq: '77' } }] as any

      await expect(handler.execute(msg, [])).resolves.toBeUndefined()
      expect(ctx.qqClient.recallMessage).toHaveBeenCalledWith('77')
    })

    it('cascade swallows trigger-command deletion failure and skips its QQ recall', async () => {
      const ctx = adminContext()
      const handler = new RecallCommandHandler(ctx)
      ;(db.query.message.findFirst as any)
        .mockResolvedValueOnce({ seq: 's5', tgSenderId: '999999' })
        .mockResolvedValueOnce({ seq: 's6' })
      ;(ctx.tgBot.getChat as any).mockImplementation(async () => ({
        deleteMessages: async (ids: number[]) => {
          if (ids[0] === 500)
            throw new Error('cascade delete boom')
          return undefined
        },
      }))
      const raw = {
        id: 1234,
        replyTo: { id: 55 },
        replyToMessage: { senderId: 1, replyTo: { replyToMsgId: 500 } },
      }

      await expect(handler.execute(createMessage('telegram', raw), [])).resolves.toBeUndefined()
      // 级联删除失败后，同一 try 内的 QQ 级联撤回被跳过
      expect(ctx.qqClient.recallMessage).toHaveBeenCalledTimes(1)
      expect(ctx.qqClient.recallMessage).toHaveBeenCalledWith('s5')
    })

    it('cascade tolerates the trigger QQ recall failure', async () => {
      const ctx = adminContext()
      const handler = new RecallCommandHandler(ctx)
      ;(db.query.message.findFirst as any)
        .mockResolvedValueOnce({ seq: 's5', tgSenderId: '999999' })
        .mockResolvedValueOnce({ seq: 's6' })
      ;(ctx.qqClient.recallMessage as any)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('cascade qq boom'))
      const raw = {
        id: 1234,
        replyTo: { id: 55 },
        replyToMessage: { senderId: 1, replyTo: { replyToMsgId: 500 } },
      }

      await expect(handler.execute(createMessage('telegram', raw), [])).resolves.toBeUndefined()
      expect(ctx.qqClient.recallMessage).toHaveBeenCalledWith('s5')
      expect(ctx.qqClient.recallMessage).toHaveBeenCalledWith('s6')
    })
  })
})
