/* eslint-disable eslint-comments/no-unlimited-disable */
/* eslint-disable */
import { and, db, eq, schema } from '@napgram/db-kit'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RecallCommandHandler } from '../RecallCommandHandler.js'

vi.mock('../../../../../../shared/utils/index.js', () => ({
  telegramMessage: {
    getTelegramReplyMessageId: vi.fn(),
  },
}))
vi.mock('@napgram/db-kit', async importOriginal => ({
  ...(await importOriginal() as any),
  db: {
    query: { message: { findFirst: vi.fn(), findMany: vi.fn() } },
  },
  schema: { message: { tgChatId: 1, tgMsgId: 2, instanceId: 3, seq: 4, qqRoomId: 5 } },
  eq: vi.fn(),
  and: vi.fn(),
  lt: vi.fn(),
  desc: vi.fn(),
}))

vi.mock('@napgram/logger-kit', async importOriginal => ({
  ...(await importOriginal() as any),
  getLogger: vi.fn().mockReturnValue({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

vi.mock('@napgram/env-kit', async importOriginal => ({
  ...(await importOriginal() as any),
  env: { ENABLE_AUTO_RECALL: true },
}))

describe('recall cascade', () => {
  it('covers cascade delete', async () => {
    const mockContext = {
      replyTG: vi.fn(),
      permissionChecker: { isAdmin: vi.fn().mockReturnValue(true) },
      instance: { id: 1 },
      tgBot: {
        getChat: vi.fn().mockResolvedValue({ deleteMessages: vi.fn().mockResolvedValue(true) }),
        client: { call: vi.fn().mockResolvedValue([{ id: 1000 }]) },
      },
      qqClient: { recallMessage: vi.fn().mockResolvedValue(true) },
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

    vi.mocked(db.query.message.findFirst)
      .mockResolvedValueOnce({ tgSenderId: 456, seq: 555 } as any)
      .mockResolvedValueOnce({ seq: 777 } as any)

    const utils = await import('../../../../../../shared/utils/index.js')
    vi.mocked(utils.telegramMessage.getTelegramReplyMessageId).mockReturnValue(888n)

    await handler.execute(msg, [])

    expect(mockContext.tgBot.getChat).toHaveBeenCalled()
    expect(mockContext.qqClient.recallMessage).toHaveBeenCalledWith('777')
  })
})
