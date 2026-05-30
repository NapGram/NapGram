import type { UnifiedMessage } from '@napgram/message-kit'
import type { IQQClient } from '../../../../shared-types.js'
import type { CommandContext } from '../CommandContext.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BindCommandHandler } from '../BindCommandHandler.js'

// Mock QQ Client
function createMockQQClient(): IQQClient {
  return {
    uin: 123456,
    nickname: 'TestBot',
    clientType: 'napcat',
    isOnline: vi.fn().mockResolvedValue(true),
    sendMessage: vi.fn().mockResolvedValue({ success: true }),
    recallMessage: vi.fn(),
    getMessage: vi.fn(),
    getFriendList: vi.fn(),
    getGroupList: vi.fn(),
    getGroupMemberList: vi.fn(),
    getGroupMemberInfo: vi.fn(),
    getFriendInfo: vi.fn(),
    getGroupInfo: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
    off: vi.fn(),
    removeListener: vi.fn(),
    removeAllListeners: vi.fn(),
    emit: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    destroy: vi.fn(),
  } as any
}

// Mock Telegram Bot
function createMockTgBot() {
  return {
    sendMessage: vi.fn().mockResolvedValue({}),
    getChat: vi.fn().mockResolvedValue({
      sendMessage: vi.fn().mockResolvedValue({}),
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
    stateManager: {
      setBindingState: vi.fn(),
    } as any,
    instance: {
      id: 1,
      owner: '123456',
      forwardPairs: {
        reload: vi.fn().mockResolvedValue(undefined),
        findByTG: vi.fn().mockReturnValue(null),
        findByQQ: vi.fn(),
        find: vi.fn(),
        add: vi.fn().mockImplementation(async (qqRoomId: string, tgChatId: string) => ({
          qqRoomId,
          tgChatId,
        })),
        remove: vi.fn(),
      },
    } as any,
    replyTG: vi.fn().mockResolvedValue(undefined),
    extractThreadId: vi.fn().mockReturnValue(undefined),
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

describe('bindCommandHandler', () => {
  let handler: BindCommandHandler
  let mockQQClient: IQQClient
  let mockTgBot: any
  let mockContext: CommandContext

  beforeEach(() => {
    mockQQClient = createMockQQClient()
    mockTgBot = createMockTgBot()
    mockContext = createMockContext(mockQQClient, mockTgBot)
    handler = new BindCommandHandler(mockContext)
  })

  describe('input Validation', () => {
    it('should reject non-numeric QQ group ID', async () => {
      const msg = createMessage('/bind abc123', '999999', '777777')
      await handler.execute(msg, ['abc123'])

      expect(mockContext.instance.forwardPairs.add).not.toHaveBeenCalled()
      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '777777',
        expect.stringContaining('必须是数字'),
        undefined,
      )
    })

    it('should reject QQ group ID with special characters', async () => {
      const msg = createMessage('/bind 888-888', '999999', '777777')
      await handler.execute(msg, ['888-888'])

      expect(mockContext.instance.forwardPairs.add).not.toHaveBeenCalled()
      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '777777',
        expect.stringContaining('必须是数字'),
        undefined,
      )
    })

    it('should reject empty QQ group ID', async () => {
      const msg = createMessage('/bind ', '999999', '777777')
      await handler.execute(msg, [''])

      expect(mockContext.instance.forwardPairs.add).not.toHaveBeenCalled()
    })
  })

  describe('conflict Detection', () => {
    it('should reject binding when TG thread is already bound to different QQ group', async () => {
      // Mock existing binding
      mockContext.instance.forwardPairs.findByTG = vi.fn().mockReturnValue({
        qqRoomId: '999999',
        tgChatId: '777777',
        tgThreadId: undefined,
      })

      const msg = createMessage('/bind 888888', '999999', '777777')
      await handler.execute(msg, ['888888'])

      expect(mockContext.instance.forwardPairs.add).not.toHaveBeenCalled()
      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '777777',
        expect.stringContaining('已绑定到其他 QQ 群'),
        undefined,
      )
    })
  })

  describe('platform Filtering', () => {
    it('should ignore commands from QQ platform', async () => {
      const msg: UnifiedMessage = {
        id: '12345',
        platform: 'qq',
        sender: {
          id: '999999',
          name: 'TestUser',
        },
        chat: {
          id: '888888',
          type: 'group',
        },
        content: [
          {
            type: 'text',
            data: { text: '/bind 888888' },
          },
        ],
        timestamp: Date.now(),
        metadata: {},
      }

      await handler.execute(msg, ['888888'])

      expect(mockContext.instance.forwardPairs.add).not.toHaveBeenCalled()
      expect(mockContext.replyTG).not.toHaveBeenCalled()
    })
  })

  describe('thread Support', () => {
    it('should set binding state with correct thread ID in interactive mode', async () => {
      vi.mocked(mockContext.extractThreadId).mockReturnValue(BigInt(99999))

      const msg = createMessage('/bind', '999999', '777777')
      await handler.execute(msg, [])

      expect(mockContext.stateManager.setBindingState).toHaveBeenCalledWith(
        '777777',
        '999999',
        BigInt(99999),
        'group',
      )
    })
  })
})
