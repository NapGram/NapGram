/* eslint-disable eslint-comments/no-unlimited-disable */
/* eslint-disable */
/* eslint-disable prefer-arrow-callback -- class mocks must use function expressions to be constructable via `new` */
import { beforeEach, describe, expect, it, mock, spyOn } from 'bun:test'
import * as actualForwardPairChatType from '../utils/ForwardPairChatType.js'

// Mock dependencies
mock.module('../services/CommandRegistry', () => {
  return {
    CommandRegistry: mock(function CommandRegistryMock() {
      return {
        register: mock(),
        unregister: mock(),
        getCommand: mock(),
        get: mock(),
        clear: mock(),
        getAll: mock().mockReturnValue(new Map()),
        getUniqueCommandCount: mock().mockReturnValue(0),
        prefix: '/',
      }
    }),
  }
})

mock.module('../services/CommandAccessChecker', () => {
  return {
    CommandAccessChecker: mock(function CommandAccessCheckerMock() {
      return {
        check: mock().mockReturnValue(true),
        isAdmin: mock().mockReturnValue(true),
      }
    }),
  }
})

mock.module('../services/InteractiveStateManager', () => {
  return {
    InteractiveStateManager: mock(function InteractiveStateManagerMock() {
      return {
        get: mock(),
        set: mock(),
        delete: mock(),
        getBindingState: mock(),
        isTimeout: mock(),
        deleteBindingState: mock(),
      }
    }),
  }
})

mock.module('../handlers/CommandContext', () => {
  return {
    CommandContext: mock(function CommandContextMock() {
      return {
        extractThreadId: mock().mockReturnValue(undefined),
        replyTG: mock().mockResolvedValue({}),
        replyQQ: mock().mockResolvedValue({}),
        replenish: mock().mockImplementation((msg: any) => msg),
      }
    }),
  }
})

// Mock all handlers
const mockHandler = { execute: mock() }
mock.module('../handlers/InfoCommandHandler', () => ({
  InfoCommandHandler: mock(function InfoCommandHandlerMock() {
    return mockHandler
  }),
}))
mock.module('../handlers/HelpCommandHandler', () => ({
  HelpCommandHandler: mock(function HelpCommandHandlerMock() {
    return mockHandler
  }),
}))
mock.module('../handlers/StatusCommandHandler', () => ({
  StatusCommandHandler: mock(function StatusCommandHandlerMock() {
    return mockHandler
  }),
}))
mock.module('../handlers/BindCommandHandler', () => ({
  BindCommandHandler: mock(function BindCommandHandlerMock() {
    return mockHandler
  }),
}))
mock.module('../handlers/UnbindCommandHandler', () => ({
  UnbindCommandHandler: mock(function UnbindCommandHandlerMock() {
    return mockHandler
  }),
}))
mock.module('../handlers/RecallCommandHandler', () => ({
  RecallCommandHandler: mock(function RecallCommandHandlerMock() {
    return mockHandler
  }),
}))
mock.module('../handlers/ForwardControlCommandHandler', () => ({
  ForwardControlCommandHandler: mock(function ForwardControlCommandHandlerMock() {
    return mockHandler
  }),
}))

mock.module('@napgram/message-kit', () => {
  return {
    messageConverter: {
      fromTelegram: mock().mockReturnValue({
        metadata: {},
        sender: { userId: 'tg:u:456', userName: 'User', name: 'User' },
        text: '/help',
        content: [{ type: 'text', data: { text: '/help' } }],
      }),
      fromQQ: mock().mockReturnValue({}),
      toNapCat: mock().mockReturnValue([]),
    },
  }
})

mock.module('@napgram/plugin-kit', () => ({
  getEventPublisher: mock().mockReturnValue({
    publishMessage: mock(),
    eventBus: {},
    publishFriendRequest: mock(),
    publishGroupRequest: mock(),
    publishNotice: mock(),
    publishInstanceStatus: mock(),
  }),
}))

mock.module('../services/ThreadIdExtractor', () => ({
  ThreadIdExtractor: mock(function ThreadIdExtractorMock() {
    return {
      extractFromRaw: mock().mockReturnValue(undefined),
    }
  }),
}))

mock.module('../utils/ForwardPairChatType.js', async () => {
  return {
    ...actualForwardPairChatType,
    findPairByTGWithChatType: mock().mockResolvedValue(undefined),
    findPairByQQWithChatType: mock().mockResolvedValue(undefined),
    addForwardPairWithChatType: mock().mockResolvedValue(undefined),
  }
})

mock.module('@napgram/plugin-kit', async () => ({
    getGlobalRuntime: mock().mockReturnValue({
      getLastReport: mock().mockReturnValue({ loadedPlugins: [] }),
    }),
    getEventPublisher: mock().mockReturnValue({
      publishMessage: mock(),
      eventBus: {},
      publishFriendRequest: mock(),
      publishGroupRequest: mock(),
      publishNotice: mock(),
      publishInstanceStatus: mock(),
    }),
}))

const { mockLogger } = (() => ({
  mockLogger: {
    info: mock(),
    debug: mock(),
    warn: mock(),
    error: mock(),
  },
}))()

mock.module('@napgram/logger-kit', async () => ({
    getLogger: mock(() => mockLogger),
}))

describe('commandsFeature', () => {
  let CommandsFeature: any
  let commandsFeature: any
  let mockInstance: any
  let mockTgBot: any
  let mockQqClient: any

  beforeEach(async () => {
    mock.clearAllMocks()

    // Import module under test dynamically
    const mod = await import('../CommandsFeature.js')
    CommandsFeature = mod.CommandsFeature

    mockInstance = {
      id: 1,
      workMode: 'group',
      forwardPairs: {
        reload: mock().mockResolvedValue(undefined),
        getPairs: mock().mockReturnValue([]),
        findByTG: mock(),
        findByQQ: mock(),
        add: mock(),
      },
      config: {
        adminUsers: ['123'],
      },
    }
    mockTgBot = {
      addNewMessageEventHandler: mock(),
      removeNewMessageEventHandler: mock(),
      me: { id: 999, username: 'bot' },
      client: {
        getMessages: mock(),
      },
      getChat: mock(),
      sendText: mock().mockResolvedValue({ id: 321 }),
    }
    mockQqClient = {
      on: mock(),
      off: mock(),
      recallMessage: mock(),
    }
    commandsFeature = new CommandsFeature(mockInstance, mockTgBot, mockQqClient)
  })

  it('check for initialization errors', async () => {
    await new Promise(resolve => setTimeout(resolve, 500))
    const logger = (await import('@napgram/logger-kit')).getLogger('CommandsFeature')
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('reloads commands', async () => {
    const registry = (commandsFeature as any).registry
      ; (commandsFeature as any).loadPluginCommands = mock().mockResolvedValue(new Set())
    await commandsFeature.reloadCommands()
    expect(registry.clear).toHaveBeenCalled()
    expect(registry.register).toHaveBeenCalled()
  })

  it('extracts mentioned bot usernames from parts and entities', () => {
    const parts = ['@MyBot', 'hello@OtherBot', 'notbot', '@Alice', '', '@']
    const tgMsg: any = {
      entities: [
        { kind: 'mention', text: '@ThirdBot' },
        { kind: 'bot_command', text: '/help@FourthBot' },
        { kind: 'mention', text: '@Alice' },
      ],
    }

    const mentioned = (commandsFeature as any).extractMentionedBotUsernames(tgMsg, parts)

    expect(Array.from(mentioned).sort()).toEqual(['fourthbot', 'mybot', 'otherbot', 'thirdbot'])
  })

  it('extracts thread id from args or raw metadata', async () => {
    const msgWithRaw: any = { metadata: { raw: { replyTo: { replyToTopId: 99 } } } }

    const fromArgs = (commandsFeature as any).extractThreadId(msgWithRaw, ['cmd', '123'])
    expect(fromArgs).toBe(123n)

    const { ThreadIdExtractor } = await import('../services/ThreadIdExtractor.js')
    ThreadIdExtractor.mockImplementationOnce(function ThreadIdExtractorMock() {
      return {
        extractFromRaw: mock().mockReturnValue(456),
        extract: mock().mockReturnValue(456n),
      } as any
    })
    const fromRaw = (commandsFeature as any).extractThreadId(msgWithRaw, ['cmd'])
    expect(fromRaw).toBe(456)

    const noThread = (commandsFeature as any).extractThreadId({ metadata: {} }, ['cmd'])
    expect(noThread).toBeUndefined()
  })

  it('destroys and clears listeners', () => {
    const registry = (commandsFeature as any).registry

    commandsFeature.destroy()

    expect(mockTgBot.removeNewMessageEventHandler).toHaveBeenCalledWith(expect.any(Function))
    expect(mockQqClient.off).toHaveBeenCalledWith('message', expect.any(Function))
    expect(registry.clear).toHaveBeenCalled()
  })

  describe('tG command handling', () => {
    it('sets up TG message listener', () => {
      expect(mockTgBot.addNewMessageEventHandler).toHaveBeenCalledWith(expect.any(Function))
    })

    it('ignores non-command TG messages', async () => {
      const registry = (commandsFeature as any).registry
      const handler = mockTgBot.addNewMessageEventHandler.mock.calls[0][0]
      const result = await handler({ text: 'not a command', chat: { id: 123 }, sender: { id: 456, isBot: false } })
      expect(result).toBe(false)
      expect(registry.get).not.toHaveBeenCalled()
    })

    it('executes command when authorized', async () => {
      const registry = (commandsFeature as any).registry
      const checker = (commandsFeature as any).permissionChecker
      const handler = mockTgBot.addNewMessageEventHandler.mock.calls[0][0]
      const mockCmd = { name: 'help', handler: mock(), adminOnly: false }

      registry.get.mockReturnValue(mockCmd)
      registry.prefix = '/'
      checker.isAdmin.mockReturnValue(true)

      const msg = {
        id: 99999,
        text: '/help',
        chat: { id: 123 },
        sender: { id: 456, displayName: 'User', isBot: false },
      }
      const result = await handler(msg)

      expect(result).toBe(true)
      expect(mockCmd.handler).toHaveBeenCalled()
    })

    it('returns false when command handler throws', async () => {
      const registry = (commandsFeature as any).registry
      const checker = (commandsFeature as any).permissionChecker
      const handler = mockTgBot.addNewMessageEventHandler.mock.calls[0][0]
      const mockCmd = { name: 'help', handler: mock().mockRejectedValue(new Error('boom')), adminOnly: false }

      registry.get.mockReturnValue(mockCmd)
      registry.prefix = '/'
      checker.isAdmin.mockReturnValue(true)

      const msg = {
        id: 99999,
        text: '/help',
        chat: { id: 123 },
        sender: { id: 456, displayName: 'User', isBot: false },
      }
      const result = await handler(msg)

      expect(result).toBe(false)
    })

    it('publishes plugin event helpers for TG commands', async () => {
      const registry = (commandsFeature as any).registry
      const handler = mockTgBot.addNewMessageEventHandler.mock.calls[0][0]
      const mockCmd = { name: 'help', handler: mock(), adminOnly: false }
      registry.get.mockReturnValue(mockCmd)
      registry.prefix = '/'

      let capturedEvent: any
      const publishMessage = mock((event: any) => {
        capturedEvent = event
      })

      const { getEventPublisher } = await import('@napgram/plugin-kit')
      getEventPublisher.mockReturnValue({
        publishMessage,
        eventBus: {},
        publishFriendRequest: mock(),
        publishGroupRequest: mock(),
        publishNotice: mock(),
        publishInstanceStatus: mock(),
      } as any)

      const deleteMessages = mock().mockResolvedValue(undefined)
      mockTgBot.getChat.mockResolvedValue({ deleteMessages })

      const { ThreadIdExtractor } = await import('../services/ThreadIdExtractor.js')
      ThreadIdExtractor.mockImplementationOnce(function ThreadIdExtractorMock() {
        return {
          extractFromRaw: mock().mockReturnValue(888),
        } as any
      })

      const result = await handler({
        id: 99999,
        text: '/help',
        chat: { id: 123 },
        sender: { id: 456, displayName: 'User', isBot: false },
      })

      expect(result).toBe(true)
      expect(publishMessage).toHaveBeenCalled()

      await capturedEvent.reply([
        null,
        { type: 'at', data: {} },
        { type: 'text', data: { text: 'hi' } },
        { type: 'unknown' },
      ])
      await capturedEvent.send('plain')
      await capturedEvent.recall()

      expect(mockTgBot.sendText).toHaveBeenCalledWith(123, '@hi', expect.objectContaining({ replyTo: 99999 }))
      expect(mockTgBot.sendText).toHaveBeenCalledWith(123, 'plain', expect.objectContaining({ replyTo: 888 }))
      expect(deleteMessages).toHaveBeenCalledWith([99999])
    })

    it('swallows publishMessage failures', async () => {
      const registry = (commandsFeature as any).registry
      const handler = mockTgBot.addNewMessageEventHandler.mock.calls[0][0]
      const mockCmd = { name: 'help', handler: mock(), adminOnly: false }
      registry.get.mockReturnValue(mockCmd)
      registry.prefix = '/'

      const publishMessage = mock(() => {
        throw new Error('boom')
      })

      const { getEventPublisher } = await import('@napgram/plugin-kit')
      getEventPublisher.mockReturnValue({
        publishMessage,
        eventBus: {},
        publishFriendRequest: mock(),
        publishGroupRequest: mock(),
        publishNotice: mock(),
        publishInstanceStatus: mock(),
      } as any)

      const result = await handler({
        id: 99999,
        text: '/help',
        chat: { id: 123 },
        sender: { id: 456, displayName: 'User', isBot: false },
      })

      expect(result).toBe(true)
    })

    it('returns early if recall messageId is missing', async () => {
      const registry = (commandsFeature as any).registry
      const handler = mockTgBot.addNewMessageEventHandler.mock.calls[0][0]
      const mockCmd = { name: 'help', handler: mock(), adminOnly: false }
      registry.get.mockReturnValue(mockCmd)
      registry.prefix = '/'

      let capturedEvent: any
      const publishMessage = mock((event: any) => {
        capturedEvent = event
      })

      const { getEventPublisher } = await import('@napgram/plugin-kit')
      getEventPublisher.mockReturnValue({
        publishMessage,
        eventBus: {},
      } as any)

      const deleteMessages = mock()
      mockTgBot.getChat.mockResolvedValue({ deleteMessages })

      await handler({
        id: undefined, // invalid id
        text: '/help',
        chat: { id: 123 },
        sender: { id: 456, displayName: 'User', isBot: false },
      })

      await capturedEvent.recall()
      expect(deleteMessages).not.toHaveBeenCalled()
    })

    it('replenishes replyToMessage when it lacks text and handles contentToText edge cases', async () => {
      const registry = (commandsFeature as any).registry
      const handler = mockTgBot.addNewMessageEventHandler.mock.calls[0][0]
      const mockCmd = { name: 'help', handler: mock(), adminOnly: false }
      registry.get.mockReturnValue(mockCmd)
      registry.prefix = '/'

      mockTgBot.client.getMessages.mockResolvedValue([{ text: 'replenished text' }])

      await handler({
        id: 111,
        text: '/help',
        chat: { id: 123 },
        sender: { id: 456, displayName: 'User', isBot: false },
        replyToMessage: { id: 222 } // lacks text
      })

      expect(mockTgBot.client.getMessages).toHaveBeenCalledWith(123, [222])

      // Trigger contentToText edge cases by dispatching a plugin message back
      let capturedEvent: any
      const publishMessage = mock((event: any) => {
        capturedEvent = event
      })
      const { getEventPublisher } = await import('@napgram/plugin-kit')
      getEventPublisher.mockReturnValue({ publishMessage } as any)

      mockTgBot.getChat.mockResolvedValue({ sendMessage: mock() })

      await handler({
        id: 112,
        text: '/help',
        chat: { id: 123 },
        sender: { id: 456, displayName: 'User', isBot: false },
      })

      await capturedEvent.send(123) // number
      await capturedEvent.send([null, 'string', { type: 'text' }, { type: 'at' }]) // arrays
    })

    it('denies admin command for non-admin', async () => {
      const registry = (commandsFeature as any).registry
      const checker = (commandsFeature as any).permissionChecker
      const handler = mockTgBot.addNewMessageEventHandler.mock.calls[0][0]
      const mockCmd = { name: 'bind', handler: mock(), adminOnly: true }
      registry.get.mockReturnValue(mockCmd)
      checker.isAdmin.mockReturnValue(false)

      const result = await handler({
        text: '/bind 123',
        chat: { id: 123 },
        sender: { id: 789, isBot: false },
      })

      expect(result).toBe(true)
      expect(mockCmd.handler).not.toHaveBeenCalled()
    })

    it('ignores command if explicitly targeting other bot', async () => {
      const handler = mockTgBot.addNewMessageEventHandler.mock.calls[0][0]
      const result = await handler({
        text: '/help@otherbot',
        chat: { id: 123 },
        sender: { id: 456, isBot: false },
        entities: [{ type: 'mention', offset: 5, length: 9 }], // @otherbot
      })
      expect(result).toBe(false)
    })

    it('handles command addressed to me with @bot suffix', async () => {
      const registry = (commandsFeature as any).registry
      const handler = mockTgBot.addNewMessageEventHandler.mock.calls[0][0]
      const mockCmd = { name: 'help', handler: mock(), adminOnly: false }
      registry.get.mockReturnValue(mockCmd)
      registry.prefix = '/'

      const result = await handler({
        text: '/help@bot',
        chat: { id: 123 },
        sender: { id: 456, isBot: false },
      })
      expect(result).toBe(true)
      expect(mockCmd.handler).toHaveBeenCalled()
    })

    it('ignores command if explicitly targeting other bot in args', async () => {
      const handler = mockTgBot.addNewMessageEventHandler.mock.calls[0][0]
      const result = await handler({
        text: '/help foo @otherbot',
        chat: { id: 123 },
        sender: { id: 456, isBot: false },
      })
      expect(result).toBe(false)
    })

    it('handles command addressed to me in args with @bot suffix', async () => {
      const registry = (commandsFeature as any).registry
      const handler = mockTgBot.addNewMessageEventHandler.mock.calls[0][0]
      const mockCmd = { name: 'help', handler: mock(), adminOnly: false }
      registry.get.mockReturnValue(mockCmd)
      registry.prefix = '/'

      const result = await handler({
        text: '/help foo @bot',
        chat: { id: 123 },
        sender: { id: 456, isBot: false },
      })
      expect(result).toBe(true)
      expect(mockCmd.handler).toHaveBeenCalled()
    })

    it('handles replied message fetch error gracefully', async () => {
      const registry = (commandsFeature as any).registry
      const handler = mockTgBot.addNewMessageEventHandler.mock.calls[0][0]
      const mockCmd = { name: 'help', handler: mock(), adminOnly: false }
      registry.get.mockReturnValue(mockCmd)
      registry.prefix = '/'

      mockTgBot.client.getMessages.mockRejectedValueOnce(new Error('Fetch failed'))

      const result = await handler({
        id: 999,
        text: '/help',
        chat: { id: 123 },
        sender: { id: 456, isBot: false },
        replyTo: { messageId: 888 },
      })
      expect(result).toBe(true)
      expect(mockTgBot.client.getMessages).toHaveBeenCalledWith(123, [888])
      expect(mockCmd.handler).toHaveBeenCalled()
    })

    it('ignores bot/self messages', async () => {
      const handler = mockTgBot.addNewMessageEventHandler.mock.calls[0][0]
      const result = await handler({
        text: '/help',
        chat: { id: 123 },
        sender: { id: 999, isBot: true },
      })
      expect(result).toBe(false)
    })

    it('handles interactive binding timeout', async () => {
      const handler = mockTgBot.addNewMessageEventHandler.mock.calls[0][0]
      const stateManager = (commandsFeature as any).stateManager

      stateManager.getBindingState.mockReturnValue({ threadId: 9, userId: '456', timestamp: 0 })
      stateManager.isTimeout.mockReturnValue(true)

      const result = await handler({
        text: '123456',
        chat: { id: 123 },
        sender: { id: 456, isBot: false },
      })

      expect(result).toBe(true)
      expect(stateManager.deleteBindingState).toHaveBeenCalledWith('123', '456')
      expect(stateManager.isTimeout).toHaveBeenCalled()
    })

    it('handles interactive binding with invalid input', async () => {
      const handler = mockTgBot.addNewMessageEventHandler.mock.calls[0][0]
      const stateManager = (commandsFeature as any).stateManager

      stateManager.getBindingState.mockReturnValue({ threadId: 9, userId: '456', timestamp: Date.now() })
      stateManager.isTimeout.mockReturnValue(false)

      const result = await handler({
        text: 'not-a-number',
        chat: { id: 123 },
        sender: { id: 456, isBot: false },
      })

      expect(result).toBe(true)
      expect(stateManager.deleteBindingState).toHaveBeenCalledWith('123', '456')
    })

    it('handles interactive binding conflict', async () => {
      const handler = mockTgBot.addNewMessageEventHandler.mock.calls[0][0]
      const stateManager = (commandsFeature as any).stateManager

      stateManager.getBindingState.mockReturnValue({ threadId: 9, userId: '456', qqTargetId: '123456', qqChatType: 'group' })
      stateManager.isTimeout.mockReturnValue(false)

      const { findPairByTGWithChatType } = await import('../utils/ForwardPairChatType.js')
      findPairByTGWithChatType.mockResolvedValueOnce({ qqRoomId: '999', qqChatType: 'private' } as any)

      const CommandContextModule = await import('../handlers/CommandContext.js')
      const replyTGMock = mock().mockResolvedValue(undefined)
      // replace replyTG on context... wait, interactive bind uses this.replyTG which is CommandsFeature.replyTG
      commandsFeature.replyTG = replyTGMock

      const result = await handler({
        text: '123456',
        chat: { id: 123 },
        sender: { id: 456, isBot: false },
      })

      expect(result).toBe(true)
      expect(stateManager.deleteBindingState).toHaveBeenCalledWith('123', '456')
      expect(replyTGMock).toHaveBeenCalledWith(123, expect.stringContaining('绑定失败'), 9)
    })

    it('handles interactive binding success', async () => {
      const handler = mockTgBot.addNewMessageEventHandler.mock.calls[0][0]
      const stateManager = (commandsFeature as any).stateManager

      stateManager.getBindingState.mockReturnValue({ threadId: 9, userId: '456', qqTargetId: '123456', qqChatType: 'group' })
      stateManager.isTimeout.mockReturnValue(false)

      const { findPairByTGWithChatType, addForwardPairWithChatType } = await import('../utils/ForwardPairChatType.js')
      findPairByTGWithChatType.mockResolvedValueOnce(undefined)
      addForwardPairWithChatType.mockResolvedValueOnce({ qqRoomId: '123456', qqChatType: 'group' } as any)

      const replyTGMock = mock().mockResolvedValue(undefined)
      commandsFeature.replyTG = replyTGMock

      const result = await handler({
        text: '123456',
        chat: { id: 123 },
        sender: { id: 456, isBot: false },
      })

      expect(result).toBe(true)
      expect(stateManager.deleteBindingState).toHaveBeenCalledWith('123', '456')
      expect(addForwardPairWithChatType).toHaveBeenCalled()
      expect(replyTGMock).toHaveBeenCalledWith(123, expect.stringContaining('绑定成功'), 9)
    })

    it('handles interactive binding error during add', async () => {
      const handler = mockTgBot.addNewMessageEventHandler.mock.calls[0][0]
      const stateManager = (commandsFeature as any).stateManager

      stateManager.getBindingState.mockReturnValue({ threadId: 9, userId: '456', qqTargetId: '123456', qqChatType: 'group' })
      stateManager.isTimeout.mockReturnValue(false)

      const { findPairByTGWithChatType, addForwardPairWithChatType } = await import('../utils/ForwardPairChatType.js')
      findPairByTGWithChatType.mockResolvedValueOnce(undefined)
      addForwardPairWithChatType.mockRejectedValueOnce(new Error('DB Error'))

      const replyTGMock = mock().mockResolvedValue(undefined)
      commandsFeature.replyTG = replyTGMock

      const result = await handler({
        text: '123456',
        chat: { id: 123 },
        sender: { id: 456, isBot: false },
      })

      expect(result).toBe(true)
      expect(stateManager.deleteBindingState).toHaveBeenCalledWith('123', '456')
      expect(replyTGMock).toHaveBeenCalledWith(123, expect.stringContaining('错误'), 9)
    })
  })

  describe('qQ command handling', () => {
    it('recalls QQ /rm command message after handling', async () => {
      const command = { name: 'rm', handler: mock().mockResolvedValue(undefined) }
      const registry = (commandsFeature as any).registry
      registry.get.mockReturnValue(command)
      registry.prefix = '/'

      await (commandsFeature as any).handleQqMessage({
        id: 'qq-1',
        platform: 'qq',
        sender: { id: '123', name: 'User' },
        chat: { id: '777', type: 'group' },
        content: [{ type: 'text', data: { text: '/rm' } }],
        timestamp: Date.now(),
      })

      expect(command.handler).toHaveBeenCalled()
      expect(mockQqClient.recallMessage).toHaveBeenCalledWith('qq-1')
    })

    it('logs when QQ recall fails', async () => {
      const command = { name: 'rm', handler: mock().mockResolvedValue(undefined) }
      const registry = (commandsFeature as any).registry
      registry.get.mockReturnValue(command)
      registry.prefix = '/'
      mockQqClient.recallMessage.mockRejectedValue(new Error('fail'))

      await (commandsFeature as any).handleQqMessage({
        id: 'qq-1',
        platform: 'qq',
        sender: { id: '123', name: 'User' },
        chat: { id: '777', type: 'group' },
        content: [{ type: 'text', data: { text: '/rm' } }],
        timestamp: Date.now(),
      })

      expect(mockLogger.warn).toHaveBeenCalledWith(expect.any(Error), 'Failed to recall QQ command message')
    })

    it('ignores QQ messages without text content', async () => {
      const registry = (commandsFeature as any).registry
      registry.prefix = '/'

      await (commandsFeature as any).handleQqMessage({
        id: 'qq-2',
        platform: 'qq',
        sender: { id: '123', name: 'User' },
        chat: { id: '777', type: 'group' },
        content: [{ type: 'image', data: { url: 'u' } }],
        timestamp: Date.now(),
      })

      expect(registry.get).not.toHaveBeenCalled()
    })

    it('ignores QQ messages carrying q2tgSkip loopback marker', async () => {
      const registry = (commandsFeature as any).registry
      registry.prefix = '/'

      await (commandsFeature as any).handleQqMessage({
        id: 'qq-skip',
        platform: 'qq',
        sender: { id: '123', name: 'User' },
        chat: { id: '777', type: 'group' },
        content: [{ type: 'text', data: { text: '/help' } }],
        timestamp: Date.now(),
        metadata: {
          raw: {
            message: [
              { type: 'mirai', data: JSON.stringify({ q2tgSkip: true }) },
            ],
          },
        },
      })

      expect(registry.get).not.toHaveBeenCalled()
    })

    it('ignores unknown QQ command', async () => {
      const registry = (commandsFeature as any).registry
      registry.prefix = '/'
      registry.get.mockReturnValue(undefined)

      await (commandsFeature as any).handleQqMessage({
        id: 'qq-unk',
        platform: 'qq',
        sender: { id: '123', name: 'User' },
        chat: { id: '777', type: 'group' },
        content: [{ type: 'text', data: { text: '/unknown' } }],
        timestamp: Date.now(),
      })

      expect(registry.get).toHaveBeenCalledWith('unknown')
      expect(mockLogger.debug).toHaveBeenCalledWith('Unknown QQ command: unknown')
    })

    it('sendQQCommandReply handles string content', async () => {
      const mockReplyQQ = mock()
      ;(commandsFeature as any).commandContext = { replyQQ: mockReplyQQ }
      const msg = { chat: { id: '777', type: 'group' } } as any
      await (commandsFeature as any).sendQQCommandReply(msg, 'test', mock())
      expect(mockReplyQQ).toHaveBeenCalledWith('777', 'test', expect.anything())
    })

    it('sendQQCommandReply handles empty array content', async () => {
      const mockReplyQQ = mock()
      ;(commandsFeature as any).commandContext = { replyQQ: mockReplyQQ }
      const msg = { chat: { id: '777', type: 'group' } } as any
      await (commandsFeature as any).sendQQCommandReply(msg, [], mock())
      expect(mockReplyQQ).toHaveBeenCalledWith('777', '', expect.anything())
    })

    it('sendQQCommandReply handles fallback forward segment for private chat', async () => {
      const mockReplyQQ = mock()
      ;(commandsFeature as any).commandContext = { replyQQ: mockReplyQQ }
      const msg = { chat: { id: '777', type: 'private' } } as any
      const content = [{ type: 'node', data: { messages: [] } }] // using node or forward doesn't matter, we check fallback
      spyOn(commandsFeature as any, 'isForwardSegment').mockReturnValue(true)
      await (commandsFeature as any).sendQQCommandReply(msg, content, () => 'fallback')
      expect(mockReplyQQ).toHaveBeenCalledWith('777', 'fallback', expect.anything())
    })

    it('sendQQCommandReply handles forward segment for group chat', async () => {
      const mockSendGroupForwardMsg = mock()
      ;(commandsFeature as any).qqClient = { uin: 123, nickname: 'Bot', sendGroupForwardMsg: mockSendGroupForwardMsg }
      const msg = { chat: { id: '777', type: 'group' } } as any
      const content = [{
        type: 'forward',
        data: {
          messages: [{ userId: '456', segments: [{ type: 'text', data: { text: 'test' } }] }]
        }
      }]
      spyOn(commandsFeature as any, 'isForwardSegment').mockReturnValue(true)
      await (commandsFeature as any).sendQQCommandReply(msg, content, () => '')
      expect(mockSendGroupForwardMsg).toHaveBeenCalled()
    })

    it('logs and swallows errors from QQ command handlers', async () => {
      const registry = (commandsFeature as any).registry
      registry.prefix = '/'
      registry.get.mockReturnValue({
        name: 'help',
        handler: mock().mockRejectedValue(new Error('boom')),
      })

      await (commandsFeature as any).handleQqMessage({
        id: 'qq-3',
        platform: 'qq',
        sender: { id: '123', name: 'User' },
        chat: { id: '777', type: 'group' },
        content: [{ type: 'text', data: { text: '/help' } }],
        timestamp: Date.now(),
      })

      expect(registry.get).toHaveBeenCalled()
    })
  })

  describe('convertToMessageEvent', () => {
    it('routes reply and send for QQ messages', async () => {
      const event = (commandsFeature as any).convertToMessageEvent({
        id: '1',
        platform: 'qq',
        sender: { id: '123', name: 'User' },
        chat: { id: '777', type: 'group' },
        content: [{ type: 'text', data: { text: 'hello' } }],
        timestamp: Date.now(),
        metadata: {},
      })

      await event.reply([{ type: 'text', data: { text: 'ok' } }])
      await event.send([{ type: 'text', data: { text: 'send' } }])

      const commandContext = (commandsFeature as any).commandContext
      expect(commandContext.replyQQ).toHaveBeenCalledWith('777', 'ok', 'group')
      expect(commandContext.replyQQ).toHaveBeenCalledWith('777', 'send', 'group')
    })

    it('throws for recall in plugin event', async () => {
      const event = (commandsFeature as any).convertToMessageEvent({
        id: '2',
        platform: 'qq',
        sender: { id: '123', name: 'User' },
        chat: { id: '777', type: 'group' },
        content: [{ type: 'text', data: { text: 'hello' } }],
        timestamp: Date.now(),
        metadata: {},
      })

      await expect(event.recall()).rejects.toThrow('recall() not yet implemented')
    })
  })

  describe('extractMentionedBotUsernames', () => {
    it('identifies bot mentions in parts', () => {
      const mentioned = (commandsFeature as any).extractMentionedBotUsernames({}, ['help@somebot', '@anotherbot', 'text'])
      expect(mentioned.has('somebot')).toBe(true)
      expect(mentioned.has('anotherbot')).toBe(true)
      expect(mentioned.size).toBe(2)
    })

    it('identifies bot mentions in entities', () => {
      const mentioned = (commandsFeature as any).extractMentionedBotUsernames(
        { entities: [{ kind: 'mention', text: '@mybot' }] },
        [],
      )
      expect(mentioned.has('mybot')).toBe(true)
    })
  })

  describe('work mode management', () => {
    it('applies personal work mode and starts user bot', async () => {
      const startUserBot = mock().mockResolvedValue(undefined)
      const instance = { ...mockInstance, startUserBot } as any
      const feature = new CommandsFeature(instance, mockTgBot as any, mockQqClient as any)
      await (feature as any).applyWorkMode('personal')
      expect(instance.workMode).toBe('personal')
      expect(startUserBot).toHaveBeenCalled()
    })

    it('applies group work mode and stops user bot', async () => {
      const stopUserBot = mock().mockResolvedValue(undefined)
      const instance = { ...mockInstance, stopUserBot } as any
      const feature = new CommandsFeature(instance, mockTgBot as any, mockQqClient as any)
      await (feature as any).applyWorkMode('group')
      expect(instance.workMode).toBe('group')
      expect(stopUserBot).toHaveBeenCalled()
    })

    it('uses setWorkMode function if available', async () => {
      const setWorkMode = mock().mockResolvedValue(undefined)
      const instance = { ...mockInstance, setWorkMode } as any
      const feature = new CommandsFeature(instance, mockTgBot as any, mockQqClient as any)
      await (feature as any).applyWorkMode('group')
      expect(setWorkMode).toHaveBeenCalledWith('group')
    })

    it('handles work mode command via TG', async () => {
      const msg = {
        platform: 'telegram',
        chat: { id: 111 },
        sender: { id: 'admin-id' },
      } as any
      const spy = spyOn(commandsFeature as any, 'replyTG').mockResolvedValue(undefined)
      await (commandsFeature as any).handleWorkModeCommand(msg, ['personal'])
      expect(spy).toHaveBeenCalledWith(111, expect.stringContaining('个人模式'), undefined)
    })

    it('rejects work mode command if not admin', async () => {
      const msg = { platform: 'telegram', chat: { id: 111 }, sender: { id: 'non-admin' } } as any
      (commandsFeature as any).permissionChecker.isAdmin.mockReturnValueOnce(false)
      const spy = spyOn(commandsFeature as any, 'replyTG').mockResolvedValue(undefined)
      await (commandsFeature as any).handleWorkModeCommand(msg, ['group'])
      expect(spy).toHaveBeenCalledWith(111, expect.stringContaining('没有权限'), undefined)
    })

    it('blocks until work mode configured', async () => {
      const spy = spyOn(commandsFeature as any, 'isWorkModeConfigured').mockReturnValue(false)
      const msg = { platform: 'qq', chat: { id: '222' }, sender: { id: 'user' } } as any
      const blocked = await (commandsFeature as any).blockUntilWorkModeConfigured(msg, 'help')
      expect(blocked).toBe(true)
      expect((commandsFeature as any).commandContext.replyQQ).toHaveBeenCalled()
    })
  })

  describe('permissions and audit', () => {
    it('checks permissions via plugin service if available', async () => {
      const checkCommandPermission = mock().mockResolvedValue({ allowed: true })
      ;(commandsFeature as any).permissionPlugin = { permissionService: { checkCommandPermission } }
      const res = await (commandsFeature as any).checkPermission('user1', { name: 'test', permission: { level: 2 } })
      expect(res.allowed).toBe(true)
      expect(checkCommandPermission).toHaveBeenCalledWith('user1', 'test', 2, false, 1)
    })

    it('falls back to local checker on plugin error', async () => {
      const checkCommandPermission = mock().mockRejectedValue(new Error('fail'))
      ;(commandsFeature as any).permissionPlugin = { permissionService: { checkCommandPermission } }
      const res = await (commandsFeature as any).checkPermission('user1', { name: 'test', permission: { level: 1 } })
      expect(res.allowed).toBe(true) // local isAdmin returns true in setup
    })

    it('logs audit via plugin service', async () => {
      const logAudit = mock().mockResolvedValue(undefined)
      ;(commandsFeature as any).permissionPlugin = { permissionService: { logAudit } }
      await (commandsFeature as any).logAudit({ eventType: 'test', userId: 'u1', commandName: 'cmd' })
      expect(logAudit).toHaveBeenCalled()
    })
  })

  describe('handleAddQQTargetCommand', () => {
    it('creates telegram group for new friend', async () => {
      const inst = { ...mockInstance, workMode: 'personal', forwardPairs: { findByQQ: mock(), findByTG: mock() } } as any
      const feat = new CommandsFeature(inst, mockTgBot as any, mockQqClient as any)
      const msg = { platform: 'telegram', chat: { id: 111 }, sender: { id: 'admin' } } as any

      const provisionerMock = { ensurePairForQQTarget: mock().mockResolvedValue({ tgChatId: '-999' }) }
      ;(feat as any).personalPairProvisioner = provisionerMock

      const spy = spyOn(feat as any, 'replyTG').mockResolvedValue(undefined)
      await (feat as any).handleAddQQTargetCommand(msg, ['10001'], 'private')
      expect(provisionerMock.ensurePairForQQTarget).toHaveBeenCalledWith('10001', 'private')
      expect(spy).toHaveBeenCalledWith(111, expect.stringContaining('-999'), undefined)
    })
  })

  describe('loadPluginCommands', () => {
    it('loads commands from runtime if available', async () => {
      const mockHandler = mock()
      const mockGetGlobalRuntime = mock().mockReturnValue({
        getLastReport: () => ({
          loadedPlugins: [{
            id: 'test-plugin',
            context: {
              getCommands: () => new Map([
                ['mycmd', { name: 'mycmd', aliases: ['mc'], handler: mockHandler }],
              ]),
            },
          }],
        }),
      })
      mock.module('@napgram/runtime-kit', () => ({ getGlobalRuntime: mockGetGlobalRuntime }))

      const loaded = await (commandsFeature as any).loadPluginCommands()
      expect(loaded.has('mycmd')).toBe(true)
      expect(loaded.has('mc')).toBe(true)
    })
    describe('message routers', () => {
      it('handleQQMessage routes commands and checks permissions', async () => {
        const msg = {
          platform: 'qq',
          chat: { id: '20002', type: 'group' },
          sender: { id: '10001', name: 'User' },
          content: [{ type: 'text', data: { text: '/help' } }],
          metadata: { raw: {} },
          id: 'msg-1',
        } as any

        // Mock registry to return a command
        const mockCmd = { name: 'help', permission: { level: 3 }, handler: mock() }
      ;(commandsFeature as any).registry.get = mock().mockReturnValue(mockCmd)
        // Bypass work mode block
        spyOn(commandsFeature as any, 'blockUntilWorkModeConfigured').mockResolvedValue(false)
        // Allow permission
        spyOn(commandsFeature as any, 'checkPermission').mockResolvedValue({ allowed: true })

        await (commandsFeature as any).handleQqMessage(msg)
        expect(mockCmd.handler).toHaveBeenCalled()
      })

      it('handleQQMessage ignores non-command messages', async () => {
        const msg = {
          platform: 'qq',
          content: [{ type: 'text', data: { text: 'hello' } }],
        } as any
        await (commandsFeature as any).handleQqMessage(msg)
      })

      it('handleQQMessage ignores commands aimed at other bots via @suffix', async () => {
        const msg = {
          platform: 'qq',
          content: [{ type: 'text', data: { text: '/help@otherbot' } }],
        } as any
      ;(commandsFeature as any).instance.botUsername = 'mybot'
        await (commandsFeature as any).handleQqMessage(msg)
      })

      it('handleQQMessage ignores commands aimed at other bots via args', async () => {
        const msg = {
          platform: 'qq',
          content: [{ type: 'text', data: { text: '/help @otherbot' } }],
        } as any
      ;(commandsFeature as any).instance.botUsername = 'mybot'
        await (commandsFeature as any).handleQqMessage(msg)
      })

      it('handleQQMessage denies access when permission fails', async () => {
        const msg = {
          platform: 'qq',
          chat: { id: '20002' },
          sender: { id: '10001' },
          content: [{ type: 'text', data: { text: '/admin' } }],
        } as any
        const mockCmd = { name: 'admin', permission: { level: 1 }, handler: mock() }
      ;(commandsFeature as any).registry.get = mock().mockReturnValue(mockCmd)
        spyOn(commandsFeature as any, 'blockUntilWorkModeConfigured').mockResolvedValue(false)
        spyOn(commandsFeature as any, 'checkPermission').mockResolvedValue({ allowed: false, reason: 'not admin' })
        spyOn(commandsFeature as any, 'logAudit').mockResolvedValue(undefined)

        await (commandsFeature as any).handleQqMessage(msg)
        expect(mockCmd.handler).not.toHaveBeenCalled()
        expect((commandsFeature as any).logAudit).toHaveBeenCalled()
      })

      it('handleTgMessage ignores non-command text', async () => {
        const tgMsg = { text: 'hello', chat: { id: 111 }, sender: { id: 222 } } as any
        const result = await (commandsFeature as any).handleTgMessage(tgMsg)
        expect(result).toBe(false)
      })

      it('handleTgMessage executes command', async () => {
        const tgMsg = { text: '/help', chat: { id: 111 }, sender: { id: 222 } } as any
        const mockCmd = { name: 'help', handler: mock() }
      ;(commandsFeature as any).registry.get = mock().mockReturnValue(mockCmd)
        spyOn(commandsFeature as any, 'checkPermission').mockResolvedValue({ allowed: true })

        const result = await (commandsFeature as any).handleTgMessage(tgMsg)
        expect(result).toBe(true)
        expect(mockCmd.handler).toHaveBeenCalled()
      })

      it('handleTgMessage denies access', async () => {
        const tgMsg = { text: '/admin', chat: { id: 111 }, sender: { id: 222 } } as any
        const mockCmd = { name: 'admin', handler: mock() }
      ;(commandsFeature as any).registry.get = mock().mockReturnValue(mockCmd)
        spyOn(commandsFeature as any, 'checkPermission').mockResolvedValue({ allowed: false })
        const spyReply = spyOn(commandsFeature as any, 'replyTG').mockResolvedValue(undefined)

        const result = await (commandsFeature as any).handleTgMessage(tgMsg)
        expect(result).toBe(true)
        expect(mockCmd.handler).not.toHaveBeenCalled()
        expect(spyReply).toHaveBeenCalled()
      })

      it('handleTgMessage returns false when no chatId', async () => {
        const tgMsg = { text: '/help', chat: {}, sender: { id: 222, isBot: false } } as any
        const result = await (commandsFeature as any).handleTgMessage(tgMsg)
        expect(result).toBe(false)
      })

      it('handleTgMessage handles work mode command', async () => {
        const tgMsg = { text: '/workmode personal', chat: { id: 111 }, sender: { id: 'admin-id', isBot: false } } as any
        const mockCmd = { name: 'workmode', handler: mock() }
      ;(commandsFeature as any).registry.get = mock().mockReturnValue(mockCmd)
        spyOn(commandsFeature as any, 'isWorkModeConfigured').mockReturnValue(true)
        spyOn(commandsFeature as any, 'handleWorkModeCommand').mockResolvedValue(undefined)

        const result = await (commandsFeature as any).handleTgMessage(tgMsg)
        expect(result).toBe(true)
      })

      it('handleTgMessage blocks when work mode not configured', async () => {
        const tgMsg = { text: '/help', chat: { id: 111 }, sender: { id: 222, isBot: false } } as any
        const mockCmd = { name: 'help', handler: mock() }
      ;(commandsFeature as any).registry.get = mock().mockReturnValue(mockCmd)
        spyOn(commandsFeature as any, 'blockUntilWorkModeConfigured').mockResolvedValue(true)

        const result = await (commandsFeature as any).handleTgMessage(tgMsg)
        expect(result).toBe(true)
        expect(mockCmd.handler).not.toHaveBeenCalled()
      })

      it('handleTgMessage handles stale binding state when work mode not configured', async () => {
        const handler = mockTgBot.addNewMessageEventHandler.mock.calls[0][0]
        const stateManager = (commandsFeature as any).stateManager
        spyOn(commandsFeature as any, 'isWorkModeConfigured').mockReturnValue(false)
        stateManager.getBindingState.mockReturnValueOnce({ threadId: 9 })

        const result = await handler({
          text: 'not-a-command',
          chat: { id: 123 },
          sender: { id: 456, isBot: false },
        })

        expect(result).toBe(true)
        expect(stateManager.deleteBindingState).toHaveBeenCalled()
      })

      it('handleTgMessage handles interactive bind success', async () => {
        const handler = mockTgBot.addNewMessageEventHandler.mock.calls[0][0]
        const stateManager = (commandsFeature as any).stateManager
        const forwardPairs = mockInstance.forwardPairs

        stateManager.getBindingState.mockReturnValue({ threadId: undefined, userId: '456', timestamp: Date.now(), qqChatType: 'group' })
        stateManager.isTimeout.mockReturnValue(false)
        forwardPairs.findByTG.mockReturnValue(undefined) // no conflict
        forwardPairs.add.mockResolvedValue({ qqRoomId: '123456', qqChatType: 'group' })

        const result = await handler({
          text: '123456',
          chat: { id: 123 },
          sender: { id: 456, isBot: false },
        })

        expect(result).toBe(true)
        expect(stateManager.deleteBindingState).toHaveBeenCalledWith('123', '456')
      })

      it('handleTgMessage ignores commands targeting other bot via args @mention', async () => {
        const handler = mockTgBot.addNewMessageEventHandler.mock.calls[0][0]
        const result = await handler({
          text: '/help @otherbot',
          chat: { id: 123 },
          sender: { id: 456, isBot: false },
        })
        expect(result).toBe(false)
      })

      it('handleTgMessage removes @self mention from args', async () => {
        const registry = (commandsFeature as any).registry
        const handler = mockTgBot.addNewMessageEventHandler.mock.calls[0][0]
        const mockCmd = { name: 'help', handler: mock(), adminOnly: false }
        registry.get.mockReturnValue(mockCmd)
        registry.prefix = '/'

        const result = await handler({
          text: '/help @bot',
          chat: { id: 123 },
          sender: { id: 456, isBot: false },
        })
        expect(result).toBe(true)
        expect(mockCmd.handler).toHaveBeenCalled()
      })
    })

    describe('handleQqMessage work mode and permission paths', () => {
      it('handles work mode command via QQ', async () => {
        const registry = (commandsFeature as any).registry
        registry.prefix = '/'
        // 'workmode' is in WORK_MODE_COMMANDS set, so isWorkModeCommand returns true
        const mockCmd = { name: 'workmode', handler: mock() }
        registry.get.mockReturnValue(mockCmd)
        // Mock handleWorkModeCommand on the instance since it's the method being called
        const spy = spyOn(commandsFeature as any, 'handleWorkModeCommand').mockResolvedValue(undefined)

        await (commandsFeature as any).handleQqMessage({
          id: 'qq-wm',
          platform: 'qq',
          sender: { id: '123', name: 'User' },
          chat: { id: '777', type: 'group' },
          content: [{ type: 'text', data: { text: '/workmode personal' } }],
          timestamp: Date.now(),
        })

        expect(spy).toHaveBeenCalled()
        expect(mockCmd.handler).not.toHaveBeenCalled() // work mode commands don't call the handler directly
      })

      it('blocks QQ command when work mode not configured', async () => {
        const registry = (commandsFeature as any).registry
        registry.prefix = '/'
        const mockCmd = { name: 'help', handler: mock() }
        registry.get.mockReturnValue(mockCmd)
        spyOn(commandsFeature as any, 'blockUntilWorkModeConfigured').mockResolvedValue(true)

        await (commandsFeature as any).handleQqMessage({
          id: 'qq-blk',
          platform: 'qq',
          sender: { id: '123', name: 'User' },
          chat: { id: '777', type: 'group' },
          content: [{ type: 'text', data: { text: '/help' } }],
          timestamp: Date.now(),
        })

        expect(mockCmd.handler).not.toHaveBeenCalled()
      })
    })

    describe('convertToMessageEvent TG path', () => {
      it('routes reply and send for TG messages', async () => {
        const commandContext = (commandsFeature as any).commandContext
        commandContext.replyTG.mockResolvedValue(undefined)

        const event = (commandsFeature as any).convertToMessageEvent({
          id: 'tg-1',
          platform: 'telegram',
          sender: { id: '456', name: 'TgUser' },
          chat: { id: '111', type: 'group' },
          content: [{ type: 'text', data: { text: 'hello' } }],
          timestamp: Date.now(),
          metadata: {},
        })

        await event.reply('reply text')
        await event.send('send text')

        expect(commandContext.replyTG).toHaveBeenCalledWith('111', 'reply text', undefined)
        expect(commandContext.replyTG).toHaveBeenCalledWith('111', 'send text', undefined)
      })

      it('converts segments to text for TG reply', async () => {
        const commandContext = (commandsFeature as any).commandContext
        commandContext.replyTG.mockResolvedValue(undefined)

        const event = (commandsFeature as any).convertToMessageEvent({
          id: 'tg-2',
          platform: 'telegram',
          sender: { id: '456', name: 'TgUser' },
          chat: { id: '111', type: 'group' },
          content: [{ type: 'text', data: { text: 'hello' } }],
          timestamp: Date.now(),
          metadata: {},
        })

        await event.reply([
          { type: 'text', data: { text: 'hi ' } },
          { type: 'at', data: { userName: 'Alice' } },
          null,
          { type: 'image', data: {} },
          { type: 'video', data: {} },
          { type: 'audio', data: {} },
          { type: 'file', data: { name: 'test.pdf' } },
          'raw string',
        ])

        expect(commandContext.replyTG).toHaveBeenCalledWith('111', expect.any(String), undefined)
      })

      it('uses logger from plugin if provided', () => {
        const customLogger = { info: mock(), debug: mock() }
        const event = (commandsFeature as any).convertToMessageEvent(
          {
            id: 'tg-3',
            platform: 'telegram',
            sender: { id: '456', name: 'TgUser' },
            chat: { id: '111', type: 'group' },
            content: [{ type: 'text', data: { text: 'hello' } }],
            timestamp: Date.now(),
            metadata: {},
          },
          customLogger,
        )
        expect(event.logger).toBe(customLogger)
      })
    })

    describe('pluginSegmentsToContents', () => {
      it('converts various segment types', () => {
        const convert = (commandsFeature as any).pluginSegmentsToContents.bind(commandsFeature)
        const result = convert([
          { type: 'text', data: { text: 'hi' } },
          { type: 'at', data: { userId: '123', userName: 'Alice' } },
          { type: 'reply', data: { messageId: '42' } },
          { type: 'image', data: { url: 'img.jpg' } },
          { type: 'video', data: { url: 'v.mp4' } },
          { type: 'audio', data: { url: 'a.mp3' } },
          { type: 'file', data: { url: 'f.zip', name: 'f.zip' } },
          { type: 'unknown' },
          null,
        ])
        expect(result).toHaveLength(8) // null is skipped
        expect(result[0]).toEqual({ type: 'text', data: { text: 'hi' } })
        expect(result[7]).toEqual({ type: 'text', data: { text: '' } }) // default
      })

      it('returns empty array for non-array input', () => {
        const convert = (commandsFeature as any).pluginSegmentsToContents.bind(commandsFeature)
        expect(convert(null)).toEqual([])
        expect(convert(undefined)).toEqual([])
      })
    })

    describe('resolveForwardUin', () => {
      it('extracts numeric id from string', () => {
        const resolve = (commandsFeature as any).resolveForwardUin.bind(commandsFeature)
        expect(resolve('12345', 0)).toBe(12345)
        expect(resolve('qq:u:67890', 0)).toBe(67890)
        expect(resolve(undefined, 999)).toBe(999)
        expect(resolve('', 999)).toBe(999)
      })
    })

    describe('isFriendPairCommand', () => {
      it('returns false for non-telegram platform', async () => {
        const result = await (commandsFeature as any).isFriendPairCommand({
          platform: 'qq',
          chat: { id: '777' },
        })
        expect(result).toBe(false)
      })

      it('returns true for telegram with private pair', async () => {
        const { findPairByTGWithChatType } = await import('../utils/ForwardPairChatType.js')
        findPairByTGWithChatType.mockResolvedValueOnce({ qqChatType: 'private' } as any)
        
        const result = await (commandsFeature as any).isFriendPairCommand({
          platform: 'telegram',
          chat: { id: '111' },
          metadata: {},
        })
        expect(result).toBe(true)
      })
    })

    describe('replyTG', () => {
      it('sends message directly to a Telegram peer', async () => {

        await (commandsFeature as any).replyTG(123, 'test message')

        expect(mockTgBot.getChat).not.toHaveBeenCalled()
        expect(mockTgBot.sendText).toHaveBeenCalledWith(123, expect.anything(), {
          linkPreview: { disable: true },
        })
      })

      it('handles replyTG error gracefully', async () => {
        mockTgBot.sendText.mockRejectedValue(new Error('chat not found'))
        // Should not throw
        await (commandsFeature as any).replyTG(123, 'test')
      })
    })
  })
})
