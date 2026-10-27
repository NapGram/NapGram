import { beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test'

let TelegramMessageHandler: any

mock.module('@napgram/message-kit', () => ({
  messageConverter: {
    fromTelegram: mock().mockReturnValue({
      id: 'u1',
      platform: 'telegram',
      sender: { id: '100', name: 'TgUser' },
      chat: { id: '-100400', type: 'group' },
      content: [{ type: 'text', data: { text: 'hello' } }],
    }),
    toNapCat: mock().mockResolvedValue([{ type: 'text', data: { text: 'napcat' } }]),
  },
}))

mock.module('../../../../capabilities/logging.js', () => ({
  getLogger: mock(() => ({
    debug: mock(),
    info: mock(),
    warn: mock(),
    error: mock(),
    trace: mock(),
  })),
}))

const performanceMocks = {
  recordMessage: mock(),
  recordError: mock(),
}

mock.module('../../../../capabilities/observability.js', () => ({
  performanceMonitor: performanceMocks,
}))

const mapperInstance: any = { saveTgToQqMapping: mock().mockResolvedValue(undefined) }

mock.module('../../services/MessageMapper.js', () => ({
  ForwardMapper: mock(function MapperMock() {
    return mapperInstance
  }),
}))

function makeDeps(overrides: Record<string, any> = {}) {
  return {
    qqClient: {
      uin: '88888',
      sendMessage: mock().mockResolvedValue({ success: true, messageId: '900' }),
      sendGroupForwardMsg: mock().mockResolvedValue({ success: true, messageId: '901' }),
      ...overrides,
    } as any,
    mediaGroupHandler: { handleMediaGroup: mock().mockResolvedValue(false) },
    replyResolver: { resolveTGReply: mock().mockResolvedValue(undefined) },
    prepareMediaForQQ: mock().mockResolvedValue(undefined),
    renderContent: (content: any) => `rendered:${JSON.stringify(content)}`,
    getNicknameMode: mock(() => '00'),
  }
}

function makePair(overrides: Record<string, any> = {}) {
  return {
    instanceId: 1,
    qqRoomId: '20002',
    tgChatId: '-100400',
    qqChatType: 'group',
    ...overrides,
  }
}

function makeTgMsg(overrides: Record<string, any> = {}) {
  return {
    id: 1001,
    chat: { id: -100400 },
    sender: { id: 100 },
    ...overrides,
  } as any
}

describe('telegramMessageHandler', () => {
  let deps: ReturnType<typeof makeDeps>
  let handler: any

  beforeAll(async () => {
    ;({ TelegramMessageHandler } = await import('../TelegramMessageHandler.js'))
  })

  beforeEach(() => {
    deps = makeDeps()
    handler = new TelegramMessageHandler(
      deps.qqClient,
      deps.mediaGroupHandler as any,
      deps.replyResolver as any,
      deps.prepareMediaForQQ,
      deps.renderContent,
      deps.getNicknameMode,
    )
    performanceMocks.recordMessage.mockClear()
    performanceMocks.recordError.mockClear()
    mapperInstance.saveTgToQqMapping.mockClear()
  })

  it('buffers media group messages without normal forwarding', async () => {
    deps.mediaGroupHandler.handleMediaGroup.mockResolvedValue(true)
    await handler.handleTGMessage(makeTgMsg(), makePair())
    expect(deps.qqClient.sendMessage).not.toHaveBeenCalled()
    expect(deps.prepareMediaForQQ).not.toHaveBeenCalled()
  })

  it('forwards plain text with nickname disabled', async () => {
    await handler.handleTGMessage(makeTgMsg(), makePair())
    expect(deps.qqClient.sendMessage).toHaveBeenCalledTimes(1)
    const sent = deps.qqClient.sendMessage.mock.calls[0][1]
    expect(sent.platform).toBe('qq')
    expect(sent.chat).toMatchObject({ id: '20002', type: 'group' })
    expect(mapperInstance.saveTgToQqMapping).toHaveBeenCalled()
    expect(performanceMocks.recordMessage).toHaveBeenCalled()
  })

  it('prepends a QQ reply segment when the resolver finds the source', async () => {
    deps.replyResolver.resolveTGReply.mockResolvedValue({
      seq: '55',
      rand: 7,
      pktnum: 1,
      time: 123,
      senderUin: '10001',
      qqChatType: 'group',
      qqRoomId: '20002',
    })
    await handler.handleTGMessage(makeTgMsg(), makePair())
    const sent = deps.qqClient.sendMessage.mock.calls[0][1]
    const replySegment = sent.content.find((s: any) => s.type === 'reply')
    expect(replySegment).toBeDefined()
    expect(replySegment.data.peer.chatType).toBe(2)
  })

  it('maps private pairs to chatType 1 in the reply segment', async () => {
    deps.replyResolver.resolveTGReply.mockResolvedValue({
      seq: '55',
      qqChatType: 'private',
      qqRoomId: '20002',
    })
    await handler.handleTGMessage(makeTgMsg(), makePair({ qqChatType: 'private' }))
    const sent = deps.qqClient.sendMessage.mock.calls[0][1]
    expect(sent.content.find((s: any) => s.type === 'reply').data.peer.chatType).toBe(1)
  })

  it('sends a video hint and uses the group forward API for media', async () => {
    deps.getNicknameMode.mockReturnValue('11')
    await handler.handleTGMessage(makeTgMsg(), makePair(), {
      id: 'u1',
      platform: 'telegram',
      sender: { id: '100', name: 'TgUser' },
      chat: { id: '-100400', type: 'group' },
      content: [{ type: 'video', data: { file: 'v.mp4' } }],
    } as any)

    expect(deps.qqClient.sendMessage).toHaveBeenCalledWith('20002', expect.objectContaining({
      content: [expect.objectContaining({ type: 'text' })],
    }))
    expect(String(deps.qqClient.sendMessage.mock.calls[0][1].content[0].data.text)).toContain('发来一个视频')
    expect(deps.qqClient.sendGroupForwardMsg).toHaveBeenCalledWith('20002', [expect.objectContaining({ type: 'node' })])
  })

  it('uses the file action text for file media', async () => {
    deps.getNicknameMode.mockReturnValue('11')
    await handler.handleTGMessage(makeTgMsg(), makePair(), {
      id: 'u1',
      platform: 'telegram',
      sender: { id: '100', name: 'TgUser' },
      chat: { id: '-100400', type: 'group' },
      content: [{ type: 'file', data: { file: 'f.pdf' } }],
    } as any)

    expect(String(deps.qqClient.sendMessage.mock.calls[0][1].content[0].data.text)).toContain('发来一个文件')
  })

  it('splits image messages into header and media sends', async () => {
    deps.getNicknameMode.mockReturnValue('11')
    await handler.handleTGMessage(makeTgMsg(), makePair(), {
      id: 'u1',
      platform: 'telegram',
      sender: { id: '100', name: 'TgUser' },
      chat: { id: '-100400', type: 'group' },
      content: [{ type: 'image', data: { file: 'i.jpg' } }],
    } as any)

    const firstCall = deps.qqClient.sendMessage.mock.calls[0][1]
    expect(String(firstCall.content[0].data.text)).toContain('发来一张图片')
    const mediaCall = deps.qqClient.sendMessage.mock.calls.at(-1)[1]
    expect(mediaCall.content).toEqual([{ type: 'image', data: { file: 'i.jpg' } }])
  })

  it('splits audio messages with the voice action text', async () => {
    deps.getNicknameMode.mockReturnValue('11')
    await handler.handleTGMessage(makeTgMsg(), makePair(), {
      id: 'u1',
      platform: 'telegram',
      sender: { id: '100', name: 'TgUser' },
      chat: { id: '-100400', type: 'group' },
      content: [{ type: 'audio', data: { file: 'a.mp3' } }],
    } as any)

    expect(String(deps.qqClient.sendMessage.mock.calls[0][1].content[0].data.text)).toContain('发来一条语音')
  })

  it('routes private forwards through sendPrivateForwardMessage when available', async () => {
    deps.getNicknameMode.mockReturnValue('11')
    const sendPrivateForwardMessage = mock().mockResolvedValue({ message_id: 77 })
    deps.qqClient.sendPrivateForwardMessage = sendPrivateForwardMessage
    await handler.handleTGMessage(makeTgMsg(), makePair({ qqChatType: 'private' }), {
      id: 'u1',
      platform: 'telegram',
      sender: { id: '100', name: 'TgUser' },
      chat: { id: '-100400', type: 'group' },
      content: [{ type: 'video', data: { file: 'v.mp4' } }],
    } as any)

    expect(sendPrivateForwardMessage).toHaveBeenCalledWith(expect.objectContaining({ user_id: '20002' }))
  })

  it('falls back to sendMessage for private forwards without the private API', async () => {
    deps.getNicknameMode.mockReturnValue('11')
    await handler.handleTGMessage(makeTgMsg(), makePair({ qqChatType: 'private' }), {
      id: 'u1',
      platform: 'telegram',
      sender: { id: '100', name: 'TgUser' },
      chat: { id: '-100400', type: 'group' },
      content: [{ type: 'video', data: { file: 'v.mp4' } }],
    } as any)

    expect(deps.qqClient.sendGroupForwardMsg).not.toHaveBeenCalled()
    expect(deps.qqClient.sendMessage).toHaveBeenCalledTimes(2) // hint + fallback message
  })

  it('warns on failure receipts', async () => {
    deps.qqClient.sendMessage.mockResolvedValue({ success: false, error: 'boom' })
    await handler.handleTGMessage(makeTgMsg(), makePair())
    expect(performanceMocks.recordMessage).not.toHaveBeenCalled()
  })

  it('skips success bookkeeping when a raw group-forward result lacks a success flag', async () => {
    deps.getNicknameMode.mockReturnValue('11')
    deps.qqClient.sendGroupForwardMsg = mock().mockResolvedValue({ message_id: 42 })
    await handler.handleTGMessage(makeTgMsg(), makePair(), {
      id: 'u1',
      platform: 'telegram',
      sender: { id: '100', name: 'TgUser' },
      chat: { id: '-100400', type: 'group' },
      content: [{ type: 'video', data: { file: 'v.mp4' } }],
    } as any)

    // the group path returns the raw NapCat receipt; without a success flag
    // neither the success bookkeeping nor the failure warn fires
    expect(performanceMocks.recordMessage).not.toHaveBeenCalled()
    expect(performanceMocks.recordError).not.toHaveBeenCalled()
  })

  it('records the error when the QQ side throws', async () => {
    deps.qqClient.sendMessage.mockRejectedValue(new Error('send boom'))
    await handler.handleTGMessage(makeTgMsg(), makePair())
    expect(performanceMocks.recordError).toHaveBeenCalled()
  })
})
