import type { UnifiedMessage } from '@napgram/message-kit'
import type { IQQClient } from '../../../../runtime-types.js'
import type { CommandContext } from '../CommandContext.js'
import { beforeEach, describe, expect, it, mock } from 'bun:test'

const loggerMocks = {
  debug: mock(),
  info: mock(),
  warn: mock(),
  error: mock(),
}

const pairHelperMocks = {
  findPairByQQWithChatType: mock((forwardMap: any, _instanceId: number, qqRoomId: string) => forwardMap.findByQQ(qqRoomId)),
  findPairByTGWithChatType: mock((forwardMap: any, tgChatId: string, tgThreadId: bigint | undefined, allowFallback: boolean) => forwardMap.findByTG(tgChatId, tgThreadId, allowFallback)),
  formatQqChatTypeLabel: (chatType: string) => chatType === 'private' ? 'QQ 好友' : 'QQ 群',
  parseQqChatType: (value: unknown) => value === 'group' || value === 'private' ? value : undefined,
  removeForwardPairById: mock().mockResolvedValue(undefined),
}

mock.module('../../../../capabilities/logging.js', () => ({
  getLogger: mock(() => loggerMocks),
}))

mock.module('../../../commands/utils/ForwardPairChatType.js', () => pairHelperMocks)

const { UnbindCommandHandler } = await import('../UnbindCommandHandler.js')

// Mock QQ Client
function createMockQQClient(): IQQClient {
  return {
    uin: 123456,
    nickname: 'TestBot',
    clientType: 'napcat',
    isOnline: mock().mockResolvedValue(true),
    sendMessage: mock().mockResolvedValue({ success: true }),
    recallMessage: mock(),
    getMessage: mock(),
    getFriendList: mock(),
    getGroupList: mock(),
    getGroupMemberList: mock(),
    getGroupMemberInfo: mock(),
    getFriendInfo: mock(),
    getGroupInfo: mock(),
    on: mock(),
    once: mock(),
    off: mock(),
    removeListener: mock(),
    removeAllListeners: mock(),
    emit: mock(),
    login: mock(),
    logout: mock(),
    destroy: mock(),
  } as any
}

// Mock Telegram Bot
function createMockTgBot() {
  return {
    sendMessage: mock().mockResolvedValue({}),
    getChat: mock().mockResolvedValue({
      sendMessage: mock().mockResolvedValue({}),
    }),
  } as any
}

// Mock Command Context
function createMockContext(qqClient: IQQClient, tgBot: any): CommandContext {
  return {
    qqClient,
    tgBot,
    registry: {} as any,
    permissionChecker: {} as any,
    stateManager: {} as any,
    instance: {
      id: 1,
      owner: '123456',
      forwardPairs: {
        reload: mock().mockResolvedValue(undefined),
        findByTG: mock().mockReturnValue(null),
        findByQQ: mock().mockReturnValue(null),
        find: mock(),
        add: mock(),
        remove: mock().mockResolvedValue(undefined),
      },
    } as any,
    replyTG: mock().mockResolvedValue(undefined),
    extractThreadId: mock().mockReturnValue(undefined),
  } as any
}

// Helper to create UnifiedMessage
function createMessage(text: string, senderId: string = '999999', chatId: string = '777777'): UnifiedMessage {
  return {
    id: '12345',
    platform: 'telegram',
    sender: {
      id: senderId,
      name: 'TestUser',
    },
    chat: {
      id: chatId,
      type: 'group',
    },
    content: [
      {
        type: 'text',
        data: { text },
      },
    ],
    timestamp: Date.now(),
    metadata: {},
  }
}

describe('unbindCommandHandler', () => {
  let handler: UnbindCommandHandler
  let mockQQClient: IQQClient
  let mockTgBot: any
  let mockContext: CommandContext

  beforeEach(() => {
    mockQQClient = createMockQQClient()
    mockTgBot = createMockTgBot()
    mockContext = createMockContext(mockQQClient, mockTgBot)
    handler = new UnbindCommandHandler(mockContext)
  })

  describe('platform Filtering', () => {
    it('should ignore non-telegram platforms', async () => {
      const msg: UnifiedMessage = {
        ...createMessage('/unbind', '999999', '777777'),
        platform: 'qq',
      }

      await handler.execute(msg, [])

      expect(mockContext.instance.forwardPairs.findByTG).not.toHaveBeenCalled()
      expect(mockContext.instance.forwardPairs.findByQQ).not.toHaveBeenCalled()
      expect(mockContext.replyTG).not.toHaveBeenCalled()
    })
  })

  describe('unbind by QQ Group ID', () => {
    it('should include thread info in success message when thread exists', async () => {
      const mockBinding = {
        qqRoomId: '888888',
        tgChatId: '777777',
        tgThreadId: BigInt(12345),
      }

      mockContext.instance.forwardPairs.findByQQ = mock().mockReturnValue(mockBinding)

      const msg = createMessage('/unbind 888888', '999999', '777777')
      await handler.execute(msg, ['888888'])

      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '777777',
        expect.stringContaining('话题 12345'),
        BigInt(12345),
      )
    })
  })

  describe('unbind by TG Chat/Thread', () => {
    it('should use fuzzy match when no thread ID', async () => {
      const mockBinding = {
        qqRoomId: '888888',
        tgChatId: '777777',
        tgThreadId: undefined,
      }

      mockContext.instance.forwardPairs.findByTG = mock().mockReturnValue(mockBinding)

      const msg = createMessage('/unbind', '999999', '777777')
      await handler.execute(msg, [])

      // Third parameter should be true for fuzzy match
      expect(mockContext.instance.forwardPairs.findByTG).toHaveBeenCalledWith(
        '777777',
        undefined,
        true,
      )
    })
  })

  describe('error Handling', () => {
    it('should report error when binding not found by QQ group ID', async () => {
      mockContext.instance.forwardPairs.findByQQ = mock().mockReturnValue(null)

      const msg = createMessage('/unbind 888888', '999999', '777777')
      await handler.execute(msg, ['888888'])

      expect(mockContext.instance.forwardPairs.remove).not.toHaveBeenCalled()
      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '777777',
        expect.stringContaining('未找到绑定关系'),
        undefined,
      )
    })

    it('should report error when binding not found by TG chat', async () => {
      mockContext.instance.forwardPairs.findByTG = mock().mockReturnValue(null)

      const msg = createMessage('/unbind', '999999', '777777')
      await handler.execute(msg, [])

      expect(mockContext.instance.forwardPairs.remove).not.toHaveBeenCalled()
      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '777777',
        expect.stringContaining('未找到绑定关系'),
        undefined,
      )
    })
  })

  describe('input Parsing', () => {
    it('should treat non-numeric argument as TG lookup', async () => {
      const mockBinding = {
        qqRoomId: '888888',
        tgChatId: '777777',
        tgThreadId: undefined,
      }

      mockContext.instance.forwardPairs.findByTG = mock().mockReturnValue(mockBinding)

      const msg = createMessage('/unbind abc', '999999', '777777')
      await handler.execute(msg, ['abc'])

      // Should use TG lookup, not QQ
      expect(mockContext.instance.forwardPairs.findByQQ).not.toHaveBeenCalled()
      expect(mockContext.instance.forwardPairs.findByTG).toHaveBeenCalled()
    })

    it('should handle numeric strings correctly', async () => {
      const mockBinding = {
        qqRoomId: '123456789',
        tgChatId: '777777',
        tgThreadId: undefined,
      }

      mockContext.instance.forwardPairs.findByQQ = mock().mockReturnValue(mockBinding)

      const msg = createMessage('/unbind 123456789', '999999', '777777')
      await handler.execute(msg, ['123456789'])

      expect(mockContext.instance.forwardPairs.findByQQ).toHaveBeenCalledWith('123456789')
    })
  })

  describe('reply Message Threading', () => {
    it('should reply to correct thread after unbinding', async () => {
      const mockBinding = {
        qqRoomId: '888888',
        tgChatId: '777777',
        tgThreadId: BigInt(99999),
      }

      mockContext.instance.forwardPairs.findByQQ = mock().mockReturnValue(mockBinding)

      const msg = createMessage('/unbind 888888', '999999', '777777')
      await handler.execute(msg, ['888888'])

      // Should reply to the thread that was unbound
      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '777777',
        expect.any(String),
        BigInt(99999),
      )
    })

    it('should use extracted thread ID when unbinding from TG', async () => {
      const mockBinding = {
        qqRoomId: '888888',
        tgChatId: '777777',
        tgThreadId: undefined,
      }

      mockContext.instance.forwardPairs.findByTG = mock().mockReturnValue(mockBinding)
      mockContext.extractThreadId.mockReturnValue(BigInt(77777))

      const msg = createMessage('/unbind', '999999', '777777')
      await handler.execute(msg, [])

      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '777777',
        expect.any(String),
        BigInt(77777),
      )
    })
  })

  describe('edge Cases', () => {
    it('should handle QQ group ID with leading zeros', async () => {
      const groupIdWithZeros = '00888888'
      const mockBinding = {
        qqRoomId: groupIdWithZeros,
        tgChatId: '777777',
        tgThreadId: undefined,
      }

      mockContext.instance.forwardPairs.findByQQ = mock().mockReturnValue(mockBinding)

      const msg = createMessage(`/unbind ${groupIdWithZeros}`, '999999', '777777')
      await handler.execute(msg, [groupIdWithZeros])

      expect(mockContext.instance.forwardPairs.findByQQ).toHaveBeenCalledWith(
        groupIdWithZeros,
      )
    })
  })
})
