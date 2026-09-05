import type { UnifiedMessage } from '@napgram/message-kit'
import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { ReplyResolver } from '../ReplyResolver.js'

const debugMock = mock()

mock.module('@napgram/logger-kit', () => ({
  getLogger: mock(() => ({
    debug: mock(),
    info: mock(),
    warn: mock(),
    error: mock(),
    trace: mock(),
  })),
}))

function createMessage(): UnifiedMessage {
  return {
    id: '1',
    platform: 'qq',
    sender: { id: '123', name: 'Tester' },
    chat: { id: '456', type: 'group' },
    content: [{ type: 'text', data: { text: 'hello' } }],
    timestamp: Date.now(),
  }
}

describe('replyResolver', () => {
  beforeEach(() => {
    debugMock.mockClear()
  })

  it('returns undefined when QQ message has no reply content', async () => {
    const mapper = { findTgMsgId: mock() }
    const resolver = new ReplyResolver(mapper as any)
    const result = await resolver.resolveQQReply(createMessage(), 1, BigInt(456))
    expect(result).toBeUndefined()
    expect(mapper.findTgMsgId).not.toHaveBeenCalled()
  })

  it('resolves QQ reply via mapper', async () => {
    const mapper = { findTgMsgId: mock().mockResolvedValue(99) }
    const resolver = new ReplyResolver(mapper as any)
    const msg = createMessage()
    msg.content.push({ type: 'reply', data: { messageId: '88' } } as any)
    const result = await resolver.resolveQQReply(msg, 1, BigInt(456))
    expect(mapper.findTgMsgId).toHaveBeenCalledWith(1, BigInt(456), '88', 'group')
    expect(result as any).toBe(99)
  })

  it('handle QQ reply when TG message ID not found', async () => {
    const mapper = { findTgMsgId: mock().mockResolvedValue(undefined) }
    const resolver = new ReplyResolver(mapper as any)
    const msg = createMessage()
    msg.content.push({ type: 'reply', data: { messageId: '77' } } as any)
    const result = await resolver.resolveQQReply(msg, 1, BigInt(456))
    expect(mapper.findTgMsgId).toHaveBeenCalledWith(1, BigInt(456), '77', 'group')
    expect(result).toBeUndefined()
    expect(debugMock).not.toHaveBeenCalled()
  })

  it('returns undefined when TG message has no replyToMessage', async () => {
    const mapper = { findQqSource: mock() }
    const resolver = new ReplyResolver(mapper as any)
    const result = await resolver.resolveTGReply({}, 1, BigInt(222))
    expect(result).toBeUndefined()
    expect(mapper.findQqSource).not.toHaveBeenCalled()
  })

  it('resolves TG reply via mapper', async () => {
    const mapper = {
      findQqSource: mock().mockResolvedValue({
        seq: 7,
        rand: BigInt(8),
        pktnum: 1,
        qqRoomId: BigInt(111),
        qqChatType: 'group',
        qqSenderId: BigInt(222),
        time: 123,
      }),
    }
    const resolver = new ReplyResolver(mapper as any)
    const result = await resolver.resolveTGReply({ replyToMessage: { id: 555 } }, 1, BigInt(222))
    expect(mapper.findQqSource).toHaveBeenCalledWith(1, BigInt(222), BigInt(555))
    expect(result).toEqual({
      seq: 7,
      rand: BigInt(8),
      pktnum: 1,
      qqRoomId: BigInt(111),
      qqChatType: 'group',
      senderUin: '222',
      time: 123,
    })
  })

  it('returns undefined when findQqSource returns null', async () => {
    const mapper = { findQqSource: mock().mockResolvedValue(null) }
    const resolver = new ReplyResolver(mapper as any)
    const result = await resolver.resolveTGReply({ replyToMessage: { id: 555 } }, 1, BigInt(222))
    expect(mapper.findQqSource).toHaveBeenCalledWith(1, BigInt(222), BigInt(555))
    expect(result).toBeUndefined()
  })
})
