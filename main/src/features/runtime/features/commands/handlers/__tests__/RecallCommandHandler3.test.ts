/* eslint-disable eslint-comments/no-unlimited-disable */
/* eslint-disable */
import { and, db, eq, schema } from '@napgram/db-kit'
import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { RecallCommandHandler } from '../RecallCommandHandler.js'

mock.module('../../../../../../shared/utils/index.js', () => ({
  telegramMessage: {
    getTelegramReplyMessageId: mock(),
  },
}))
mock.module('@napgram/db-kit', async () => ({
    db: {
    query: { message: { findFirst: mock(), findMany: mock() } },
  },
  schema: { message: { tgChatId: 1, tgMsgId: 2, instanceId: 3, seq: 4, qqRoomId: 5 } },
  eq: mock(),
  and: mock(),
  lt: mock(),
  desc: mock(),
}))

mock.module('@napgram/logger-kit', async () => ({
    getLogger: mock().mockReturnValue({ info: mock(), warn: mock(), error: mock(), debug: mock() }),
}))

mock.module('@napgram/env-kit', async () => ({
    env: { ENABLE_AUTO_RECALL: true },
}))

describe('recall cascade', () => {
  it('covers cascade delete', async () => {
    const mockContext = {
      replyTG: mock(),
      permissionChecker: { isAdmin: mock().mockReturnValue(true) },
      instance: { id: 1 },
      tgBot: {
        getChat: mock().mockResolvedValue({ deleteMessages: mock().mockResolvedValue(true) }),
        client: { call: mock().mockResolvedValue([{ id: 1000 }]) },
      },
      qqClient: { recallMessage: mock().mockResolvedValue(true) },
    } as any

    const handler = new RecallCommandHandler(mockContext)
    const msg = {
      chat: { id: 123 },
      sender: { id: 456 },
      platform: 'telegram',
      content: [],
      metadata: {
        raw: {
          replyToMessage: {
            senderId: 1000,
            replyTo: { replyToMsgId: 9999 },
          },
        },
      },
    } as any

    db.query.message.findFirst
      .mockResolvedValueOnce({ tgSenderId: 456, seq: 555 } as any)
      .mockResolvedValueOnce({ seq: 777 } as any)

    const utils = await import('../../../../../../shared/utils/index.js')
    utils.telegramMessage.getTelegramReplyMessageId.mockReturnValue(888n)

    await handler.execute(msg, [])

    expect(mockContext.tgBot.getChat).toHaveBeenCalled()
    expect(mockContext.qqClient.recallMessage).toHaveBeenCalledWith('777')
  })
})
