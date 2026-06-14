import { db } from '@napgram/db-kit'
import { messageConverter } from '@napgram/message-kit'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TelegramMessageHandler } from '../TelegramMessageHandler.js'

vi.mock('@napgram/message-kit', () => ({
  messageConverter: {
    fromTelegram: vi.fn(),
    toNapCat: vi.fn(),
  },
}))

vi.mock('@napgram/db-kit', async importOriginal => ({
  ...(await importOriginal() as any),
  db: {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([{ id: 1 }]),
      })),
    })),
  },
  schema: {
    message: { id: 'id' },
  },
}))

vi.mock('@napgram/logger-kit', async importOriginal => ({
  ...(await importOriginal() as any),
  getLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
  })),
}))

vi.mock('@napgram/infra-kit', async importOriginal => ({
  ...(await importOriginal() as any),
  performanceMonitor: { recordCall: vi.fn(), recordError: vi.fn(), recordMessage: vi.fn() },
}))

describe('telegramMessageHandler', () => {
  const qqClient = {
    sendMessage: vi.fn().mockResolvedValue({ success: true, messageId: 'qq-123' }),
    sendGroupForwardMsg: vi.fn().mockResolvedValue({ success: true, messageId: 'qq-456' }),
    uin: '123456',
  }
  const mediaGroupHandler = {
    handleMediaGroup: vi.fn().mockResolvedValue(false),
  }
  const replyResolver = {
    resolveTGReply: vi.fn().mockResolvedValue(null),
  }
  const prepareMediaForQQ = vi.fn().mockResolvedValue(undefined)
  const renderContent = vi.fn().mockReturnValue('rendered')
  const getNicknameMode = vi.fn().mockReturnValue('00')

  let handler: TelegramMessageHandler

  beforeEach(() => {
    vi.clearAllMocks()
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
    const tgMsg: any = { id: 1, text: '', chat: { id: 100 }, date: new Date() }
    const pair = { instanceId: 1, qqRoomId: '888', tgChatId: '100' }

    await handler.handleTGMessage(tgMsg, pair)

    expect(mediaGroupHandler.handleMediaGroup).toHaveBeenCalled()
    expect(messageConverter.fromTelegram).not.toHaveBeenCalled()
  })

  it('handles messages with nickname mode 01 (show nickname)', async () => {
    getNicknameMode.mockReturnValueOnce('01')
    const tgMsg: any = { id: 1, text: 'Hello', chat: { id: 100 }, date: new Date(), sender: { id: 10 } }
    const pair = { instanceId: 1, qqRoomId: '888', tgChatId: '100' }
    const unified = {
      platform: 'telegram' as const,
      id: '1',
      sender: { id: 'Alice', name: 'Alice' },
      content: [{ type: 'text' as const, data: { text: 'Hello' } }],
      chat: { id: '888', type: 'group' as const },
      timestamp: Date.now(),
    }
    vi.mocked(messageConverter.fromTelegram).mockReturnValueOnce(unified)
    vi.mocked(messageConverter.toNapCat).mockResolvedValueOnce([{ type: 'text', data: { text: 'Hello' } }])

    await handler.handleTGMessage(tgMsg, pair)

    const sentMsg = qqClient.sendMessage.mock.calls[0][1]
    expect(sentMsg.content).toContainEqual({ type: 'text', data: { text: 'Alice:\n' } })
  })

  it('handles video/file as forward message nodes', async () => {
    const tgMsg: any = { id: 1, text: '', chat: { id: 100 }, date: new Date(), sender: { id: 10 } }
    const pair = { instanceId: 1, qqRoomId: '888', tgChatId: '100' }
    const unified = {
      platform: 'telegram' as const,
      id: '1',
      sender: { id: 'Alice', name: 'Alice' },
      content: [{ type: 'video' as const, data: { file: 'vid' } }],
      chat: { id: '888', type: 'group' as const },
      timestamp: Date.now(),
    }
    vi.mocked(messageConverter.fromTelegram).mockReturnValueOnce(unified)
    vi.mocked(messageConverter.toNapCat).mockResolvedValueOnce([{ type: 'video', data: { file: 'vid' } }])

    await handler.handleTGMessage(tgMsg, pair)

    expect(qqClient.sendGroupForwardMsg).toHaveBeenCalled()
    const nodes = qqClient.sendGroupForwardMsg.mock.calls[0][1]
    expect(nodes[0].data.content).toContainEqual({ type: 'video', data: { file: 'vid' } })
  })

  it('handles audio/image with split send', async () => {
    const tgMsg: any = { id: 1, text: '', chat: { id: 100 }, date: new Date(), sender: { id: 10 } }
    const pair = { instanceId: 1, qqRoomId: '888', tgChatId: '100' }
    const unified = {
      platform: 'telegram' as const,
      id: '1',
      sender: { id: 'Alice', name: 'Alice' },
      content: [{ type: 'image' as const, data: { file: 'img' } }, { type: 'text' as const, data: { text: 'caption' } }],
      chat: { id: '888', type: 'group' as const },
      timestamp: Date.now(),
    }
    vi.mocked(messageConverter.fromTelegram).mockReturnValueOnce(unified)
    vi.mocked(messageConverter.toNapCat).mockResolvedValueOnce([{ type: 'image', data: { file: 'img' } }, { type: 'text', data: { text: 'caption' } }])

    await handler.handleTGMessage(tgMsg, pair)

    // Should call sendMessage twice: once for text/header, once for media
    expect(qqClient.sendMessage).toHaveBeenCalledTimes(2)
  })

  it('handles reply resolution', async () => {
    const tgMsg: any = { id: 1, text: 'Reply', chat: { id: 100 }, date: new Date(), sender: { id: 10 } }
    const pair = { instanceId: 1, qqRoomId: '888', tgChatId: '100' }
    replyResolver.resolveTGReply.mockResolvedValueOnce({
      seq: 555,
      rand: BigInt(777),
      pktnum: 1,
      time: 12345,
      senderUin: '999',
      qqRoomId: '888',
    })
    const unified = {
      platform: 'telegram' as const,
      id: '1',
      sender: { id: 'Alice', name: 'Alice' },
      content: [{ type: 'text' as const, data: { text: 'Reply' } }],
      chat: { id: '888', type: 'group' as const },
      timestamp: Date.now(),
    }
    vi.mocked(messageConverter.fromTelegram).mockReturnValueOnce(unified)
    vi.mocked(messageConverter.toNapCat).mockResolvedValueOnce([{ type: 'text', data: { text: 'Reply' } }])

    await handler.handleTGMessage(tgMsg, pair)

    const sentMsg = qqClient.sendMessage.mock.calls[0][1]
    const reply = sentMsg.content.find((c: any) => c.type === 'reply')
    expect(reply).toBeTruthy()
    expect(reply.data).toEqual(expect.objectContaining({
      seq: 555,
      rand: '777',
      pktnum: 1,
      time: 12345,
      senderUin: '999',
    }))
  })

  it('handles receipt with error', async () => {
    const tgMsg: any = { id: 1, text: 'Hello', chat: { id: 100 }, date: new Date(), sender: { id: 10 } }
    const pair = { instanceId: 1, qqRoomId: '888', tgChatId: '100' }
    const unified = {
      platform: 'telegram' as const,
      id: '1',
      sender: { id: 'Alice', name: 'Alice' },
      content: [{ type: 'text' as const, data: { text: 'Hello' } }],
      chat: { id: '888', type: 'group' as const },
      timestamp: Date.now(),
    }
    vi.mocked(messageConverter.fromTelegram).mockReturnValueOnce(unified)
    vi.mocked(messageConverter.toNapCat).mockResolvedValueOnce([{ type: 'text', data: { text: 'Hello' } }])

    // Mock failure
    qqClient.sendMessage.mockResolvedValueOnce({ success: false, error: 'Send failed' })

    await handler.handleTGMessage(tgMsg, pair)

    expect(qqClient.sendMessage).toHaveBeenCalled()
    expect(db.insert).not.toHaveBeenCalled()
  })

  it('handles receipt without messageId', async () => {
    const tgMsg: any = { id: 1, text: 'Hello', chat: { id: 100 }, date: new Date(), sender: { id: 10 } }
    const pair = { instanceId: 1, qqRoomId: '888', tgChatId: '100' }
    const unified = {
      platform: 'telegram' as const,
      id: '1',
      sender: { id: 'Alice', name: 'Alice' },
      content: [{ type: 'text' as const, data: { text: 'Hello' } }],
      chat: { id: '888', type: 'group' as const },
      timestamp: Date.now(),
    }
    vi.mocked(messageConverter.fromTelegram).mockReturnValueOnce(unified)
    vi.mocked(messageConverter.toNapCat).mockResolvedValueOnce([{ type: 'text', data: { text: 'Hello' } }])

    // Mock success but no ID
    qqClient.sendMessage.mockResolvedValueOnce({ success: true })

    await handler.handleTGMessage(tgMsg, pair)

    expect(qqClient.sendMessage).toHaveBeenCalled()
    expect(db.insert).not.toHaveBeenCalled()
  })

  it('handles hint message sending failure gracefully', async () => {
    const tgMsg: any = { id: 1, text: '', chat: { id: 100 }, date: new Date(), sender: { id: 10 } }
    const pair = { instanceId: 1, qqRoomId: '888', tgChatId: '100' }
    const unified = {
      platform: 'telegram' as const,
      id: '1',
      sender: { id: 'Alice', name: 'Alice' },
      content: [{ type: 'video' as const, data: { file: 'vid' } }],
      chat: { id: '888', type: 'group' as const },
      timestamp: Date.now(),
    }
    vi.mocked(messageConverter.fromTelegram).mockReturnValueOnce(unified)
    vi.mocked(messageConverter.toNapCat).mockResolvedValueOnce([{ type: 'video', data: { file: 'vid' } }])

    // Enable nickname mode to trigger hint
    getNicknameMode.mockReturnValueOnce('01')

    // First call (hint) fails
    qqClient.sendMessage.mockRejectedValueOnce(new Error('Hint failed'))

    await handler.handleTGMessage(tgMsg, pair)

    // Should proceed to send forward message
    expect(qqClient.sendGroupForwardMsg).toHaveBeenCalled()
  })

  it('handles general error in handleTGMessage', async () => {
    const tgMsg: any = { id: 1, text: 'Hello', chat: { id: 100 } }
    const pair = { instanceId: 1, qqRoomId: '888', tgChatId: '100' }

    // Mock converter throwing error
    vi.mocked(messageConverter.fromTelegram).mockImplementationOnce(() => {
      throw new Error('Converter Logic Error')
    })

    await handler.handleTGMessage(tgMsg, pair)

    // Should catch and log error
    expect(qqClient.sendMessage).not.toHaveBeenCalled()
  })

  it('handles private forward messages (sendPrivateForwardMessage present)', async () => {
    const tgMsg: any = { id: 1, text: '', chat: { id: 100 }, date: new Date(), sender: { id: 10 } }
    const pair = { instanceId: 1, qqRoomId: '888', tgChatId: '100', qqChatType: 'private' }
    const unified = {
      platform: 'telegram' as const,
      id: '1',
      sender: { id: 'Alice', name: 'Alice' },
      content: [{ type: 'video' as const, data: { file: 'vid' } }],
      chat: { id: '888', type: 'private' as const },
      timestamp: Date.now(),
    }
    vi.mocked(messageConverter.fromTelegram).mockReturnValueOnce(unified)
    vi.mocked(messageConverter.toNapCat).mockResolvedValueOnce([{ type: 'video', data: { file: 'vid' } }])

    const sendPrivateForwardMessage = vi.fn().mockResolvedValue({ message_id: 'priv-123' });
    (qqClient as any).sendPrivateForwardMessage = sendPrivateForwardMessage

    await handler.handleTGMessage(tgMsg, pair)

    expect(sendPrivateForwardMessage).toHaveBeenCalled()
    const args = sendPrivateForwardMessage.mock.calls[0][0]
    expect(args.user_id).toBe('888')
    expect(args.messages[0].data.content).toContainEqual({ type: 'video', data: { file: 'vid' } })

    // Cleanup
    delete (qqClient as any).sendPrivateForwardMessage
  })

  it('handles private forward messages fallback (sendPrivateForwardMessage absent)', async () => {
    const tgMsg: any = { id: 1, text: '', chat: { id: 100 }, date: new Date(), sender: { id: 10 } }
    const pair = { instanceId: 1, qqRoomId: '888', tgChatId: '100', qqChatType: 'private' }
    const unified = {
      platform: 'telegram' as const,
      id: '1',
      sender: { id: 'Alice', name: 'Alice' },
      content: [{ type: 'video' as const, data: { file: 'vid' } }],
      chat: { id: '888', type: 'private' as const },
      timestamp: Date.now(),
    }
    vi.mocked(messageConverter.fromTelegram).mockReturnValueOnce(unified)
    vi.mocked(messageConverter.toNapCat).mockResolvedValueOnce([{ type: 'video', data: { file: 'vid' } }])

    // Ensure it's absent
    delete (qqClient as any).sendPrivateForwardMessage

    await handler.handleTGMessage(tgMsg, pair)

    expect(qqClient.sendMessage).toHaveBeenCalled()
    expect(qqClient.sendGroupForwardMsg).not.toHaveBeenCalled()
  })

  it('handles normalizeReceipt boolean result', async () => {
    const tgMsg: any = { id: 1, text: '', chat: { id: 100 }, date: new Date(), sender: { id: 10 } }
    const pair = { instanceId: 1, qqRoomId: '888', tgChatId: '100', qqChatType: 'private' }
    const unified = {
      platform: 'telegram' as const,
      id: '1',
      sender: { id: 'Alice', name: 'Alice' },
      content: [{ type: 'video' as const, data: { file: 'vid' } }],
      chat: { id: '888', type: 'private' as const },
      timestamp: Date.now(),
    }
    vi.mocked(messageConverter.fromTelegram).mockReturnValueOnce(unified)
    vi.mocked(messageConverter.toNapCat).mockResolvedValueOnce([{ type: 'video', data: { file: 'vid' } }])

    const sendPrivateForwardMessage = vi.fn().mockResolvedValue({ success: true, messageId: 'bool-success' });
    (qqClient as any).sendPrivateForwardMessage = sendPrivateForwardMessage

    await handler.handleTGMessage(tgMsg, pair)

    expect(sendPrivateForwardMessage).toHaveBeenCalled()
    // db.insert check is handled by mapper mock in the code
    delete (qqClient as any).sendPrivateForwardMessage
  })

  it('handles normalizeReceipt empty result', async () => {
    const tgMsg: any = { id: 1, text: '', chat: { id: 100 }, date: new Date(), sender: { id: 10 } }
    const pair = { instanceId: 1, qqRoomId: '888', tgChatId: '100', qqChatType: 'private' }
    const unified = {
      platform: 'telegram' as const,
      id: '1',
      sender: { id: 'Alice', name: 'Alice' },
      content: [{ type: 'video' as const, data: { file: 'vid' } }],
      chat: { id: '888', type: 'private' as const },
      timestamp: Date.now(),
    }
    vi.mocked(messageConverter.fromTelegram).mockReturnValueOnce(unified)
    vi.mocked(messageConverter.toNapCat).mockResolvedValueOnce([{ type: 'video', data: { file: 'vid' } }])

    const sendPrivateForwardMessage = vi.fn().mockResolvedValue(null);
    (qqClient as any).sendPrivateForwardMessage = sendPrivateForwardMessage

    await handler.handleTGMessage(tgMsg, pair)

    expect(sendPrivateForwardMessage).toHaveBeenCalled()
    delete (qqClient as any).sendPrivateForwardMessage
  })

  it('handles empty actionText in hasSplitMedia', async () => {
    const tgMsg: any = { id: 1, text: '', chat: { id: 100 }, date: new Date(), sender: { id: 10 } }
    const pair = { instanceId: 1, qqRoomId: '888', tgChatId: '100' }
    const unified = {
      platform: 'telegram' as const,
      id: '1',
      sender: { id: 'Alice', name: 'Alice' },
      content: [{ type: 'audio' as const, data: { file: 'aud' } }], // No text, no image
      chat: { id: '888', type: 'group' as const },
      timestamp: Date.now(),
    }
    vi.mocked(messageConverter.fromTelegram).mockReturnValueOnce(unified)
    vi.mocked(messageConverter.toNapCat).mockResolvedValueOnce([{ type: 'audio', data: { file: 'aud' } }])

    // Use mode 00 so showTGToQQNickname is false
    getNicknameMode.mockReturnValueOnce('00')

    await handler.handleTGMessage(tgMsg, pair)

    // Should only send the media message since headerText and textSegments are empty
    expect(qqClient.sendMessage).toHaveBeenCalledTimes(1)
  })
})
