import type { UnifiedMessage } from '@napgram/message-kit'
import type { IQQClient } from '../../../../runtime-types.js'
import type { CommandContext } from '../CommandContext.js'
import { db, schema } from '@napgram/db-kit'
import { beforeEach, describe, expect, it, mock } from 'bun:test'

import { ForwardControlCommandHandler } from '../ForwardControlCommandHandler.js'

mock.module('@napgram/db-kit', async () => ({
  db: {
    update: mock(() => ({
      set: mock(() => ({
        where: mock().mockResolvedValue({}),
      })),
    })),
  },
  schema: {
    forwardPair: { id: 'id' },
  },
  eq: mock(),
}))

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

// Mock QQ Client
function createMockQQClient(): IQQClient {
  return {
    uin: 123456,
    nickname: 'TestBot',
    clientType: 'napcat',
    isOnline: mock().mockResolvedValue(true),
    sendMessage: mock(),
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
        findByQQ: mock(),
        find: mock(),
        add: mock(),
        remove: mock(),
      },
    } as any,
    replyTG: mock().mockResolvedValue(undefined),
    extractThreadId: mock().mockReturnValue(undefined),
  } as any
}

// Helper to create UnifiedMessage
function createMessage(text: string, senderId: string = '999999', chatId: string = '777777', platform: 'telegram' | 'qq' = 'telegram'): UnifiedMessage {
  return {
    id: '12345',
    platform,
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

describe('forwardControlCommandHandler', () => {
  let handler: ForwardControlCommandHandler
  let mockQQClient: IQQClient
  let mockTgBot: any
  let mockContext: CommandContext
  let mockPair: any

  beforeEach(() => {
    mockQQClient = createMockQQClient()
    mockTgBot = createMockTgBot()
    mockContext = createMockContext(mockQQClient, mockTgBot)
    handler = new ForwardControlCommandHandler(mockContext)

    // Reset mock pair
    mockPair = {
      id: 1,
      qqRoomId: '888888',
      tgChatId: '777777',
      forwardMode: null,
    }

    mockContext.instance.forwardPairs.findByTG = mock().mockReturnValue(mockPair)
    db.update.mockClear()
  })

  describe('platform Filtering', () => {
    it('should only process commands from Telegram platform', async () => {
      const msg = createMessage('/forwardoff', '999999', '777777', 'qq')
      await handler.execute(msg, [], 'forwardoff')

      expect(mockContext.replyTG).not.toHaveBeenCalled()
      expect(db.update).not.toHaveBeenCalled()
    })
  })

  describe('no Binding Scenario', () => {
    it('should show error when chat is not bound', async () => {
      mockContext.instance.forwardPairs.findByTG = mock().mockReturnValue(null)

      const msg = createMessage('/forwardoff', '999999', '777777')
      await handler.execute(msg, [], 'forwardoff')

      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '777777',
        expect.stringContaining('未绑定任何 QQ 聊天'),
        undefined,
      )
      expect(db.update).not.toHaveBeenCalled()
    })
  })

  describe('/forwardoff command', () => {
    it('should set forward mode to off', async () => {
      const msg = createMessage('/forwardoff', '999999', '777777')
      await handler.execute(msg, [], 'forwardoff')

      expect(db.update).toHaveBeenCalledWith(schema.forwardPair)
    })

    it('should update pair in memory', async () => {
      const msg = createMessage('/forwardoff', '999999', '777777')
      await handler.execute(msg, [], 'forwardoff')

      expect(mockPair.forwardMode).toBe('00')
    })

    it('should send success message', async () => {
      const msg = createMessage('/forwardoff', '999999', '777777')
      await handler.execute(msg, [], 'forwardoff')

      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '777777',
        expect.stringContaining('已暂停双向转发'),
        undefined,
      )
    })
  })

  describe('/forwardon command', () => {
    it('should set forward mode to null (normal)', async () => {
      mockPair.forwardMode = '00'

      const msg = createMessage('/forwardon', '999999', '777777')
      await handler.execute(msg, [], 'forwardon')

      expect(db.update).toHaveBeenCalledWith(schema.forwardPair)
    })

    it('should send success message', async () => {
      const msg = createMessage('/forwardon', '999999', '777777')
      await handler.execute(msg, [], 'forwardon')

      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '777777',
        expect.stringContaining('已恢复双向转发'),
        undefined,
      )
    })
  })

  describe('/disable_qq_forward command', () => {
    it('should set forward mode to 01', async () => {
      const msg = createMessage('/disable_qq_forward', '999999', '777777')
      await handler.execute(msg, [], 'disable_qq_forward')

      expect(db.update).toHaveBeenCalledWith(schema.forwardPair)
    })

    it('should send success message', async () => {
      const msg = createMessage('/disable_qq_forward', '999999', '777777')
      await handler.execute(msg, [], 'disable_qq_forward')

      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '777777',
        expect.stringContaining('已停止 QQ → TG 的转发'),
        undefined,
      )
    })
  })

  describe('/enable_qq_forward command', () => {
    it('should set forward mode to null (normal)', async () => {
      mockPair.forwardMode = '01'

      const msg = createMessage('/enable_qq_forward', '999999', '777777')
      await handler.execute(msg, [], 'enable_qq_forward')

      expect(db.update).toHaveBeenCalledWith(schema.forwardPair)
    })

    it('should send success message', async () => {
      const msg = createMessage('/enable_qq_forward', '999999', '777777')
      await handler.execute(msg, [], 'enable_qq_forward')

      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '777777',
        expect.stringContaining('已恢复 QQ → TG 的转发'),
        undefined,
      )
    })
  })

  describe('/disable_tg_forward command', () => {
    it('should set forward mode to 10', async () => {
      const msg = createMessage('/disable_tg_forward', '999999', '777777')
      await handler.execute(msg, [], 'disable_tg_forward')

      expect(db.update).toHaveBeenCalledWith(schema.forwardPair)
    })

    it('should send success message', async () => {
      const msg = createMessage('/disable_tg_forward', '999999', '777777')
      await handler.execute(msg, [], 'disable_tg_forward')

      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '777777',
        expect.stringContaining('已停止 TG → QQ 的转发'),
        undefined,
      )
    })
  })

  describe('/enable_tg_forward command', () => {
    it('should set forward mode to null (normal)', async () => {
      mockPair.forwardMode = '10'

      const msg = createMessage('/enable_tg_forward', '999999', '777777')
      await handler.execute(msg, [], 'enable_tg_forward')

      expect(db.update).toHaveBeenCalledWith(schema.forwardPair)
    })

    it('should send success message', async () => {
      const msg = createMessage('/enable_tg_forward', '999999', '777777')
      await handler.execute(msg, [], 'enable_tg_forward')

      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '777777',
        expect.stringContaining('已恢复 TG → QQ 的转发'),
        undefined,
      )
    })
  })

  describe('unknown Command', () => {
    it('should reject unknown command', async () => {
      const msg = createMessage('/unknown', '999999', '777777')
      await handler.execute(msg, [], 'unknown')

      expect(db.update).not.toHaveBeenCalled()
      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '777777',
        expect.stringContaining('未知命令'),
        undefined,
      )
    })
  })

  describe('binding Information Display', () => {
    it('should include binding info in success message', async () => {
      const msg = createMessage('/forwardoff', '999999', '777777')
      await handler.execute(msg, [], 'forwardoff')

      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '777777',
        expect.stringContaining('QQ 群 888888'),
        undefined,
      )
    })

    it('should include thread ID in binding info when present', async () => {
      mockPair.tgThreadId = 12345
      mockContext.extractThreadId.mockReturnValue(BigInt(12345))

      const msg = createMessage('/forwardoff', '999999', '777777')
      await handler.execute(msg, [], 'forwardoff')

      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '777777',
        expect.stringContaining('话题 12345'),
        BigInt(12345),
      )
    })
  })

  describe('error Handling', () => {
    it('should handle database update failure', async () => {
      db.update.mockReturnValue({
        set: mock(() => ({
          where: mock().mockRejectedValue(new Error('DB Error')),
        })),
      } as any)

      const msg = createMessage('/forwardoff', '999999', '777777')
      await handler.execute(msg, [], 'forwardoff')

      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '777777',
        expect.stringContaining('更新转发模式失败'),
        undefined,
      )
    })

    it('should not update memory on database failure', async () => {
      const originalMode = mockPair.forwardMode
      db.update.mockReturnValue({
        set: mock(() => ({
          where: mock().mockRejectedValue(new Error('DB Error')),
        })),
      } as any)

      const msg = createMessage('/forwardoff', '999999', '777777')
      await handler.execute(msg, [], 'forwardoff')

      // Memory should not be updated if DB update fails
      expect(mockPair.forwardMode).toBe(originalMode)
    })
  })

  describe('thread Support', () => {
    it('should use extracted thread ID', async () => {
      mockContext.extractThreadId.mockReturnValue(BigInt(99999))

      const msg = createMessage('/forwardoff', '999999', '777777')
      await handler.execute(msg, [], 'forwardoff')

      expect(mockContext.instance.forwardPairs.findByTG).toHaveBeenCalledWith(
        '777777',
        BigInt(99999),
        true,
      )
    })

    it('should reply to correct thread', async () => {
      mockContext.extractThreadId.mockReturnValue(BigInt(54321))

      const msg = createMessage('/forwardoff', '999999', '777777')
      await handler.execute(msg, [], 'forwardoff')

      expect(mockContext.replyTG).toHaveBeenCalledWith(
        '777777',
        expect.any(String),
        BigInt(54321),
      )
    })
  })
})
