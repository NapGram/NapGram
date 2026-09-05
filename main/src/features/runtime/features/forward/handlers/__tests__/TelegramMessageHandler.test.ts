import { db } from '@napgram/db-kit'
import { messageConverter } from '@napgram/message-kit'
import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { TelegramMessageHandler } from '../TelegramMessageHandler.js'

mock.module('@napgram/message-kit', () => ({
  messageConverter: { fromTelegram: mock(), toNapCat: mock() },
}))

mock.module('@napgram/db-kit', () => ({
  db: {
    insert: mock(() => ({
      values: mock(() => ({ returning: mock().mockResolvedValue([{ id: 1 }]) })),
    })),
  },
  schema: { message: { id: 'id' } },
}))

mock.module('@napgram/logger-kit', () => ({
  getLogger: mock(() => ({ debug: mock(), info: mock(), warn: mock(), error: mock(), trace: mock() })),
}))

mock.module('@napgram/infra-kit', () => ({
  performanceMonitor: { recordCall: mock(), recordError: mock(), recordMessage: mock() },
}))

describe('telegramMessageHandler', () => {
  const qqClient = {
    sendMessage: mock().mockResolvedValue({ success: true, messageId: 'qq-123' }),
    sendGroupForwardMsg: mock().mockResolvedValue({ success: true, messageId: 'qq-456' }),
    uin: '123456',
  }
  const mediaGroupHandler = { handleMediaGroup: mock().mockResolvedValue(false) }
  const replyResolver = { resolveTGReply: mock().mockResolvedValue(null) }
  const prepareMediaForQQ = mock().mockResolvedValue(undefined)
  const renderContent = mock().mockReturnValue('rendered')
  const getNicknameMode = mock().mockReturnValue('00')

  let handler: TelegramMessageHandler

  beforeEach(() => {
    qqClient.sendMessage.mockClear()
    qqClient.sendMessage.mockResolvedValue({ success: true, messageId: 'qq-123' })
    qqClient.sendGroupForwardMsg.mockClear()
    qqClient.sendGroupForwardMsg.mockResolvedValue({ success: true, messageId: 'qq-456' })
    mediaGroupHandler.handleMediaGroup.mockClear()
    mediaGroupHandler.handleMediaGroup.mockResolvedValue(false)
    replyResolver.resolveTGReply.mockClear()
    replyResolver.resolveTGReply.mockResolvedValue(null)
    prepareMediaForQQ.mockClear()
    prepareMediaForQQ.mockResolvedValue(undefined)
    renderContent.mockClear()
    renderContent.mockReturnValue('rendered')
    getNicknameMode.mockClear()
    getNicknameMode.mockReturnValue('00')
    ;(messageConverter as any).fromTelegram.mockClear()
    ;(messageConverter as any).toNapCat.mockClear()
    ;(db as any).insert.mockClear()

    handler = new TelegramMessageHandler(
      qqClient as any,
      mediaGroupHandler as any,
      replyResolver as any,
      prepareMediaForQQ,
      renderContent,
      getNicknameMode,
    )
  })

  it('handles media group messages by skipping further processing', async () => {
    mediaGroupHandler.handleMediaGroup.mockResolvedValueOnce(true)
    await handler.handleTGMessage({ id: 1, text: '', chat: { id: 100 }, date: new Date() } as any, { instanceId: 1, qqRoomId: '888', tgChatId: '100' })
    expect(mediaGroupHandler.handleMediaGroup).toHaveBeenCalled()
    expect((messageConverter as any).fromTelegram).not.toHaveBeenCalled()
  })

  it('handles messages with nickname mode 01 (show nickname)', async () => {
    getNicknameMode.mockReturnValueOnce('01')
    const unified = { platform: 'telegram' as const, id: '1', sender: { id: 'Alice', name: 'Alice' }, content: [{ type: 'text' as const, data: { text: 'Hello' } }], chat: { id: '888', type: 'group' as const }, timestamp: Date.now() }
    ;(messageConverter as any).fromTelegram.mockReturnValueOnce(unified)
    ;(messageConverter as any).toNapCat.mockResolvedValueOnce([{ type: 'text', data: { text: 'Hello' } }])
    await handler.handleTGMessage({ id: 1, text: 'Hello', chat: { id: 100 }, date: new Date(), sender: { id: 10 } } as any, { instanceId: 1, qqRoomId: '888', tgChatId: '100' })
    const sentMsg = qqClient.sendMessage.mock.calls[0][1]
    expect(sentMsg.content).toContainEqual({ type: 'text', data: { text: 'Alice:\n' } })
  })

  it('handles video/file as forward message nodes', async () => {
    const unified = { platform: 'telegram' as const, id: '1', sender: { id: 'Alice', name: 'Alice' }, content: [{ type: 'video' as const, data: { file: 'vid' } }], chat: { id: '888', type: 'group' as const }, timestamp: Date.now() }
    ;(messageConverter as any).fromTelegram.mockReturnValueOnce(unified)
    ;(messageConverter as any).toNapCat.mockResolvedValueOnce([{ type: 'video', data: { file: 'vid' } }])
    await handler.handleTGMessage({ id: 1, text: '', chat: { id: 100 }, date: new Date(), sender: { id: 10 } } as any, { instanceId: 1, qqRoomId: '888', tgChatId: '100' })
    expect(qqClient.sendGroupForwardMsg).toHaveBeenCalled()
    const nodes = qqClient.sendGroupForwardMsg.mock.calls[0][1]
    expect(nodes[0].data.content).toContainEqual({ type: 'video', data: { file: 'vid' } })
  })

  it('handles audio/image with split send', async () => {
    const unified = { platform: 'telegram' as const, id: '1', sender: { id: 'Alice', name: 'Alice' }, content: [{ type: 'image' as const, data: { file: 'img' } }, { type: 'text' as const, data: { text: 'caption' } }], chat: { id: '888', type: 'group' as const }, timestamp: Date.now() }
    ;(messageConverter as any).fromTelegram.mockReturnValueOnce(unified)
    ;(messageConverter as any).toNapCat.mockResolvedValueOnce([{ type: 'image', data: { file: 'img' } }, { type: 'text', data: { text: 'caption' } }])
    await handler.handleTGMessage({ id: 1, text: '', chat: { id: 100 }, date: new Date(), sender: { id: 10 } } as any, { instanceId: 1, qqRoomId: '888', tgChatId: '100' })
    expect(qqClient.sendMessage).toHaveBeenCalledTimes(2)
  })

  it('handles reply resolution', async () => {
    replyResolver.resolveTGReply.mockResolvedValueOnce({ seq: 555, rand: BigInt(777), pktnum: 1, time: 12345, senderUin: '999', qqRoomId: '888' })
    const unified = { platform: 'telegram' as const, id: '1', sender: { id: 'Alice', name: 'Alice' }, content: [{ type: 'text' as const, data: { text: 'Reply' } }], chat: { id: '888', type: 'group' as const }, timestamp: Date.now() }
    ;(messageConverter as any).fromTelegram.mockReturnValueOnce(unified)
    ;(messageConverter as any).toNapCat.mockResolvedValueOnce([{ type: 'text', data: { text: 'Reply' } }])
    await handler.handleTGMessage({ id: 1, text: 'Reply', chat: { id: 100 }, date: new Date(), sender: { id: 10 } } as any, { instanceId: 1, qqRoomId: '888', tgChatId: '100' })
    const sentMsg = qqClient.sendMessage.mock.calls[0][1]
    const reply = sentMsg.content.find((c: any) => c.type === 'reply')
    expect(reply).toBeTruthy()
    expect(reply.data).toEqual(expect.objectContaining({ seq: 555, rand: '777', pktnum: 1, time: 12345, senderUin: '999' }))
  })

  it('handles receipt with error', async () => {
    const unified = { platform: 'telegram' as const, id: '1', sender: { id: 'Alice', name: 'Alice' }, content: [{ type: 'text' as const, data: { text: 'Hello' } }], chat: { id: '888', type: 'group' as const }, timestamp: Date.now() }
    ;(messageConverter as any).fromTelegram.mockReturnValueOnce(unified)
    ;(messageConverter as any).toNapCat.mockResolvedValueOnce([{ type: 'text', data: { text: 'Hello' } }])
    qqClient.sendMessage.mockResolvedValueOnce({ success: false, error: 'Send failed' })
    await handler.handleTGMessage({ id: 1, text: 'Hello', chat: { id: 100 }, date: new Date(), sender: { id: 10 } } as any, { instanceId: 1, qqRoomId: '888', tgChatId: '100' })
    expect(qqClient.sendMessage).toHaveBeenCalled()
    expect((db as any).insert).not.toHaveBeenCalled()
  })

  it('handles receipt without messageId', async () => {
    const unified = { platform: 'telegram' as const, id: '1', sender: { id: 'Alice', name: 'Alice' }, content: [{ type: 'text' as const, data: { text: 'Hello' } }], chat: { id: '888', type: 'group' as const }, timestamp: Date.now() }
    ;(messageConverter as any).fromTelegram.mockReturnValueOnce(unified)
    ;(messageConverter as any).toNapCat.mockResolvedValueOnce([{ type: 'text', data: { text: 'Hello' } }])
    qqClient.sendMessage.mockResolvedValueOnce({ success: true })
    await handler.handleTGMessage({ id: 1, text: 'Hello', chat: { id: 100 }, date: new Date(), sender: { id: 10 } } as any, { instanceId: 1, qqRoomId: '888', tgChatId: '100' })
    expect(qqClient.sendMessage).toHaveBeenCalled()
    expect((db as any).insert).not.toHaveBeenCalled()
  })

  it('handles hint message sending failure gracefully', async () => {
    const unified = { platform: 'telegram' as const, id: '1', sender: { id: 'Alice', name: 'Alice' }, content: [{ type: 'video' as const, data: { file: 'vid' } }], chat: { id: '888', type: 'group' as const }, timestamp: Date.now() }
    ;(messageConverter as any).fromTelegram.mockReturnValueOnce(unified)
    ;(messageConverter as any).toNapCat.mockResolvedValueOnce([{ type: 'video', data: { file: 'vid' } }])
    getNicknameMode.mockReturnValueOnce('01')
    qqClient.sendMessage.mockRejectedValueOnce(new Error('Hint failed'))
    await handler.handleTGMessage({ id: 1, text: '', chat: { id: 100 }, date: new Date(), sender: { id: 10 } } as any, { instanceId: 1, qqRoomId: '888', tgChatId: '100' })
    expect(qqClient.sendGroupForwardMsg).toHaveBeenCalled()
  })

  it('handles general error in handleTGMessage', async () => {
    ;(messageConverter as any).fromTelegram.mockImplementationOnce(() => {
      throw new Error('Converter Logic Error')
    })
    await handler.handleTGMessage({ id: 1, text: 'Hello', chat: { id: 100 } } as any, { instanceId: 1, qqRoomId: '888', tgChatId: '100' })
    expect(qqClient.sendMessage).not.toHaveBeenCalled()
  })

  it('handles private forward messages (sendPrivateForwardMessage present)', async () => {
    const unified = { platform: 'telegram' as const, id: '1', sender: { id: 'Alice', name: 'Alice' }, content: [{ type: 'video' as const, data: { file: 'vid' } }], chat: { id: '888', type: 'private' as const }, timestamp: Date.now() }
    ;(messageConverter as any).fromTelegram.mockReturnValueOnce(unified)
    ;(messageConverter as any).toNapCat.mockResolvedValueOnce([{ type: 'video', data: { file: 'vid' } }])
    const sendPrivateForwardMessage = mock().mockResolvedValue({ message_id: 'priv-123' })
    Object.assign(qqClient, { sendPrivateForwardMessage })
    await handler.handleTGMessage({ id: 1, text: '', chat: { id: 100 }, date: new Date(), sender: { id: 10 } } as any, { instanceId: 1, qqRoomId: '888', tgChatId: '100', qqChatType: 'private' })
    expect(sendPrivateForwardMessage).toHaveBeenCalled()
    const args = sendPrivateForwardMessage.mock.calls[0][0]
    expect(args.user_id).toBe('888')
    expect(args.messages[0].data.content).toContainEqual({ type: 'video', data: { file: 'vid' } })
    delete (qqClient as any).sendPrivateForwardMessage
  })

  it('handles private forward messages fallback (sendPrivateForwardMessage absent)', async () => {
    const unified = { platform: 'telegram' as const, id: '1', sender: { id: 'Alice', name: 'Alice' }, content: [{ type: 'video' as const, data: { file: 'vid' } }], chat: { id: '888', type: 'private' as const }, timestamp: Date.now() }
    ;(messageConverter as any).fromTelegram.mockReturnValueOnce(unified)
    ;(messageConverter as any).toNapCat.mockResolvedValueOnce([{ type: 'video', data: { file: 'vid' } }])
    delete (qqClient as any).sendPrivateForwardMessage
    await handler.handleTGMessage({ id: 1, text: '', chat: { id: 100 }, date: new Date(), sender: { id: 10 } } as any, { instanceId: 1, qqRoomId: '888', tgChatId: '100', qqChatType: 'private' })
    expect(qqClient.sendMessage).toHaveBeenCalled()
    expect(qqClient.sendGroupForwardMsg).not.toHaveBeenCalled()
  })

  it('handles normalizeReceipt boolean result', async () => {
    const unified = { platform: 'telegram' as const, id: '1', sender: { id: 'Alice', name: 'Alice' }, content: [{ type: 'video' as const, data: { file: 'vid' } }], chat: { id: '888', type: 'private' as const }, timestamp: Date.now() }
    ;(messageConverter as any).fromTelegram.mockReturnValueOnce(unified)
    ;(messageConverter as any).toNapCat.mockResolvedValueOnce([{ type: 'video', data: { file: 'vid' } }])
    const sendPrivateForwardMessage = mock().mockResolvedValue({ success: true, messageId: 'bool-success' })
    Object.assign(qqClient, { sendPrivateForwardMessage })
    await handler.handleTGMessage({ id: 1, text: '', chat: { id: 100 }, date: new Date(), sender: { id: 10 } } as any, { instanceId: 1, qqRoomId: '888', tgChatId: '100', qqChatType: 'private' })
    expect(sendPrivateForwardMessage).toHaveBeenCalled()
    delete (qqClient as any).sendPrivateForwardMessage
  })

  it('handles normalizeReceipt empty result', async () => {
    const unified = { platform: 'telegram' as const, id: '1', sender: { id: 'Alice', name: 'Alice' }, content: [{ type: 'video' as const, data: { file: 'vid' } }], chat: { id: '888', type: 'private' as const }, timestamp: Date.now() }
    ;(messageConverter as any).fromTelegram.mockReturnValueOnce(unified)
    ;(messageConverter as any).toNapCat.mockResolvedValueOnce([{ type: 'video', data: { file: 'vid' } }])
    const sendPrivateForwardMessage = mock().mockResolvedValue(null)
    Object.assign(qqClient, { sendPrivateForwardMessage })
    await handler.handleTGMessage({ id: 1, text: '', chat: { id: 100 }, date: new Date(), sender: { id: 10 } } as any, { instanceId: 1, qqRoomId: '888', tgChatId: '100', qqChatType: 'private' })
    expect(sendPrivateForwardMessage).toHaveBeenCalled()
    delete (qqClient as any).sendPrivateForwardMessage
  })

  it('handles empty actionText in hasSplitMedia', async () => {
    const unified = { platform: 'telegram' as const, id: '1', sender: { id: 'Alice', name: 'Alice' }, content: [{ type: 'audio' as const, data: { file: 'aud' } }], chat: { id: '888', type: 'group' as const }, timestamp: Date.now() }
    ;(messageConverter as any).fromTelegram.mockReturnValueOnce(unified)
    ;(messageConverter as any).toNapCat.mockResolvedValueOnce([{ type: 'audio', data: { file: 'aud' } }])
    getNicknameMode.mockReturnValueOnce('00')
    await handler.handleTGMessage({ id: 1, text: '', chat: { id: 100 }, date: new Date(), sender: { id: 10 } } as any, { instanceId: 1, qqRoomId: '888', tgChatId: '100' })
    expect(qqClient.sendMessage).toHaveBeenCalledTimes(1)
  })
})
