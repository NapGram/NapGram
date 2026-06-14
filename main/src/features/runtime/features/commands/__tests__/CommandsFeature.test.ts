/* eslint-disable prefer-arrow-callback -- class mocks must use function expressions to be constructable via `new` */
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock dependencies
vi.mock('../services/CommandRegistry', () => {
  return {
    CommandRegistry: vi.fn(function CommandRegistryMock() {
      return {
        register: vi.fn(),
        unregister: vi.fn(),
        getCommand: vi.fn(),
        get: vi.fn(),
        clear: vi.fn(),
        getAll: vi.fn().mockReturnValue(new Map()),
        getUniqueCommandCount: vi.fn().mockReturnValue(0),
        prefix: '/',
      }
    }),
  }
})

vi.mock('../services/CommandAccessChecker', () => {
  return {
    CommandAccessChecker: vi.fn(function CommandAccessCheckerMock() {
      return {
        check: vi.fn().mockReturnValue(true),
        isAdmin: vi.fn().mockReturnValue(true),
      }
    }),
  }
})

vi.mock('../services/InteractiveStateManager', () => {
  return {
    InteractiveStateManager: vi.fn(function InteractiveStateManagerMock() {
      return {
        get: vi.fn(),
        set: vi.fn(),
        delete: vi.fn(),
        getBindingState: vi.fn(),
        isTimeout: vi.fn(),
        deleteBindingState: vi.fn(),
      }
    }),
  }
})

vi.mock('../handlers/CommandContext', () => {
  return {
    CommandContext: vi.fn(function CommandContextMock() {
      return {
        extractThreadId: vi.fn().mockReturnValue(undefined),
        replyTG: vi.fn().mockResolvedValue({}),
        replyQQ: vi.fn().mockResolvedValue({}),
        replenish: vi.fn().mockImplementation((msg: any) => msg),
      }
    }),
  }
})

// Mock all handlers
const mockHandler = { execute: vi.fn() }
vi.mock('../handlers/InfoCommandHandler', () => ({
  InfoCommandHandler: vi.fn(function InfoCommandHandlerMock() {
    return mockHandler
  }),
}))
vi.mock('../handlers/HelpCommandHandler', () => ({
  HelpCommandHandler: vi.fn(function HelpCommandHandlerMock() {
    return mockHandler
  }),
}))
vi.mock('../handlers/StatusCommandHandler', () => ({
  StatusCommandHandler: vi.fn(function StatusCommandHandlerMock() {
    return mockHandler
  }),
}))
vi.mock('../handlers/BindCommandHandler', () => ({
  BindCommandHandler: vi.fn(function BindCommandHandlerMock() {
    return mockHandler
  }),
}))
vi.mock('../handlers/UnbindCommandHandler', () => ({
  UnbindCommandHandler: vi.fn(function UnbindCommandHandlerMock() {
    return mockHandler
  }),
}))
vi.mock('../handlers/RecallCommandHandler', () => ({
  RecallCommandHandler: vi.fn(function RecallCommandHandlerMock() {
    return mockHandler
  }),
}))
vi.mock('../handlers/ForwardControlCommandHandler', () => ({
  ForwardControlCommandHandler: vi.fn(function ForwardControlCommandHandlerMock() {
    return mockHandler
  }),
}))

vi.mock('@napgram/message-kit', () => {
  return {
    messageConverter: {
      fromTelegram: vi.fn().mockReturnValue({
        metadata: {},
        sender: { userId: 'tg:u:456', userName: 'User', name: 'User' },
        text: '/help',
        content: [{ type: 'text', data: { text: '/help' } }],
      }),
      fromQQ: vi.fn().mockReturnValue({}),
    },
  }
})

vi.mock('@napgram/plugin-kit', () => ({
  getEventPublisher: vi.fn().mockReturnValue({
    publishMessage: vi.fn(),
    eventBus: {},
    publishFriendRequest: vi.fn(),
    publishGroupRequest: vi.fn(),
    publishNotice: vi.fn(),
    publishInstanceStatus: vi.fn(),
  }),
}))

vi.mock('../services/ThreadIdExtractor', () => ({
  ThreadIdExtractor: vi.fn(function ThreadIdExtractorMock() {
    return {
      extractFromRaw: vi.fn().mockReturnValue(undefined),
    }
  }),
}))

vi.mock('@napgram/plugin-kit', async (importOriginal: () => Promise<any>) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getGlobalRuntime: vi.fn().mockReturnValue({
      getLastReport: vi.fn().mockReturnValue({ loadedPlugins: [] }),
    }),
    getEventPublisher: vi.fn().mockReturnValue({
      publishMessage: vi.fn(),
      eventBus: {},
      publishFriendRequest: vi.fn(),
      publishGroupRequest: vi.fn(),
      publishNotice: vi.fn(),
      publishInstanceStatus: vi.fn(),
    }),
  }
})

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('@napgram/logger-kit', async importOriginal => ({
  ...(await importOriginal() as any),
  getLogger: vi.fn(() => mockLogger),
}))

describe('commandsFeature', () => {
  let CommandsFeature: any
  let commandsFeature: any
  let mockInstance: any
  let mockTgBot: any
  let mockQqClient: any

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules() // Important to reload modules

    // Import module under test dynamically
    const mod = await import('../CommandsFeature.js')
    CommandsFeature = mod.CommandsFeature

    mockInstance = {
      id: 1,
      workMode: 'group',
      forwardPairs: {
        reload: vi.fn().mockResolvedValue(undefined),
        getPairs: vi.fn().mockReturnValue([]),
        findByTG: vi.fn(),
        findByQQ: vi.fn(),
        add: vi.fn(),
      },
      config: {
        adminUsers: ['123'],
      },
    }
    mockTgBot = {
      addNewMessageEventHandler: vi.fn(),
      removeNewMessageEventHandler: vi.fn(),
      me: { id: 999, username: 'bot' },
      client: {
        getMessages: vi.fn(),
      },
      getChat: vi.fn(),
    }
    mockQqClient = {
      on: vi.fn(),
      off: vi.fn(),
      recallMessage: vi.fn(),
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
      ; (commandsFeature as any).loadPluginCommands = vi.fn().mockResolvedValue(new Set())
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
    vi.mocked(ThreadIdExtractor).mockImplementationOnce(function ThreadIdExtractorMock() {
      return {
        extractFromRaw: vi.fn().mockReturnValue(456),
        extract: vi.fn().mockReturnValue(456n),
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
      const mockCmd = { name: 'help', handler: vi.fn(), adminOnly: false }

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
      const mockCmd = { name: 'help', handler: vi.fn().mockRejectedValue(new Error('boom')), adminOnly: false }

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
      const mockCmd = { name: 'help', handler: vi.fn(), adminOnly: false }
      registry.get.mockReturnValue(mockCmd)
      registry.prefix = '/'

      let capturedEvent: any
      const publishMessage = vi.fn((event: any) => {
        capturedEvent = event
      })

      const { getEventPublisher } = await import('@napgram/plugin-kit')
      vi.mocked(getEventPublisher).mockReturnValue({
        publishMessage,
        eventBus: {},
        publishFriendRequest: vi.fn(),
        publishGroupRequest: vi.fn(),
        publishNotice: vi.fn(),
        publishInstanceStatus: vi.fn(),
      } as any)

      const sendMessage = vi.fn().mockResolvedValue({ id: 321 })
      const deleteMessages = vi.fn().mockResolvedValue(undefined)
      mockTgBot.getChat.mockResolvedValue({ sendMessage, deleteMessages })

      const { ThreadIdExtractor } = await import('../services/ThreadIdExtractor.js')
      vi.mocked(ThreadIdExtractor).mockImplementationOnce(function ThreadIdExtractorMock() {
        return {
          extractFromRaw: vi.fn().mockReturnValue(888),
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

      expect(sendMessage).toHaveBeenCalledWith('@hi', expect.objectContaining({ replyTo: 99999 }))
      expect(sendMessage).toHaveBeenCalledWith('plain', expect.objectContaining({ replyTo: 888 }))
      expect(deleteMessages).toHaveBeenCalledWith([99999])
    })

    it('swallows publishMessage failures', async () => {
      const registry = (commandsFeature as any).registry
      const handler = mockTgBot.addNewMessageEventHandler.mock.calls[0][0]
      const mockCmd = { name: 'help', handler: vi.fn(), adminOnly: false }
      registry.get.mockReturnValue(mockCmd)
      registry.prefix = '/'

      const publishMessage = vi.fn(() => {
        throw new Error('boom')
      })

      const { getEventPublisher } = await import('@napgram/plugin-kit')
      vi.mocked(getEventPublisher).mockReturnValue({
        publishMessage,
        eventBus: {},
        publishFriendRequest: vi.fn(),
        publishGroupRequest: vi.fn(),
        publishNotice: vi.fn(),
        publishInstanceStatus: vi.fn(),
      } as any)

      const result = await handler({
        id: 99999,
        text: '/help',
        chat: { id: 123 },
        sender: { id: 456, displayName: 'User', isBot: false },
      })

      expect(result).toBe(true)
    })

    it('denies admin command for non-admin', async () => {
      const registry = (commandsFeature as any).registry
      const checker = (commandsFeature as any).permissionChecker
      const handler = mockTgBot.addNewMessageEventHandler.mock.calls[0][0]
      const mockCmd = { name: 'bind', handler: vi.fn(), adminOnly: true }
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
      const mockCmd = { name: 'help', handler: vi.fn(), adminOnly: false }
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
      const forwardPairs = mockInstance.forwardPairs

      stateManager.getBindingState.mockReturnValue({ threadId: 9, userId: '456', timestamp: Date.now() })
      stateManager.isTimeout.mockReturnValue(false)
      forwardPairs.findByTG.mockReturnValue({ qqRoomId: '999' })

      const result = await handler({
        text: '123456',
        chat: { id: 123 },
        sender: { id: 456, isBot: false },
      })

      expect(result).toBe(true)
      expect(stateManager.deleteBindingState).toHaveBeenCalledWith('123', '456')
    })
  })

  describe('qQ command handling', () => {
    it('recalls QQ /rm command message after handling', async () => {
      const command = { name: 'rm', handler: vi.fn().mockResolvedValue(undefined) }
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
      const command = { name: 'rm', handler: vi.fn().mockResolvedValue(undefined) }
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

    it('logs and swallows errors from QQ command handlers', async () => {
      const registry = (commandsFeature as any).registry
      registry.prefix = '/'
      registry.get.mockReturnValue({
        name: 'help',
        handler: vi.fn().mockRejectedValue(new Error('boom')),
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
      const startUserBot = vi.fn().mockResolvedValue(undefined)
      const instance = { ...mockInstance, startUserBot } as any
      const feature = new CommandsFeature(instance, mockTgBot as any, mockQqClient as any)
      await (feature as any).applyWorkMode('personal')
      expect(instance.workMode).toBe('personal')
      expect(startUserBot).toHaveBeenCalled()
    })

    it('applies group work mode and stops user bot', async () => {
      const stopUserBot = vi.fn().mockResolvedValue(undefined)
      const instance = { ...mockInstance, stopUserBot } as any
      const feature = new CommandsFeature(instance, mockTgBot as any, mockQqClient as any)
      await (feature as any).applyWorkMode('group')
      expect(instance.workMode).toBe('group')
      expect(stopUserBot).toHaveBeenCalled()
    })

    it('uses setWorkMode function if available', async () => {
      const setWorkMode = vi.fn().mockResolvedValue(undefined)
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
      const spy = vi.spyOn(commandsFeature as any, 'replyTG').mockResolvedValue(undefined)
      await (commandsFeature as any).handleWorkModeCommand(msg, ['personal'])
      expect(spy).toHaveBeenCalledWith(111, expect.stringContaining('个人模式'), undefined)
    })

    it('rejects work mode command if not admin', async () => {
      const msg = { platform: 'telegram', chat: { id: 111 }, sender: { id: 'non-admin' } } as any
      vi.mocked((commandsFeature as any).permissionChecker.isAdmin).mockReturnValueOnce(false)
      const spy = vi.spyOn(commandsFeature as any, 'replyTG').mockResolvedValue(undefined)
      await (commandsFeature as any).handleWorkModeCommand(msg, ['group'])
      expect(spy).toHaveBeenCalledWith(111, expect.stringContaining('没有权限'), undefined)
    })

    it('blocks until work mode configured', async () => {
      const spy = vi.spyOn(commandsFeature as any, 'isWorkModeConfigured').mockReturnValue(false)
      const msg = { platform: 'qq', chat: { id: '222' }, sender: { id: 'user' } } as any
      const blocked = await (commandsFeature as any).blockUntilWorkModeConfigured(msg, 'help')
      expect(blocked).toBe(true)
      expect((commandsFeature as any).commandContext.replyQQ).toHaveBeenCalled()
    })
  })

  describe('permissions and audit', () => {
    it('checks permissions via plugin service if available', async () => {
      const checkCommandPermission = vi.fn().mockResolvedValue({ allowed: true })
      ;(commandsFeature as any).permissionPlugin = { permissionService: { checkCommandPermission } }
      const res = await (commandsFeature as any).checkPermission('user1', { name: 'test', permission: { level: 2 } })
      expect(res.allowed).toBe(true)
      expect(checkCommandPermission).toHaveBeenCalledWith('user1', 'test', 2, false, 1)
    })

    it('falls back to local checker on plugin error', async () => {
      const checkCommandPermission = vi.fn().mockRejectedValue(new Error('fail'))
      ;(commandsFeature as any).permissionPlugin = { permissionService: { checkCommandPermission } }
      const res = await (commandsFeature as any).checkPermission('user1', { name: 'test', permission: { level: 1 } })
      expect(res.allowed).toBe(true) // local isAdmin returns true in setup
    })

    it('logs audit via plugin service', async () => {
      const logAudit = vi.fn().mockResolvedValue(undefined)
      ;(commandsFeature as any).permissionPlugin = { permissionService: { logAudit } }
      await (commandsFeature as any).logAudit({ eventType: 'test', userId: 'u1', commandName: 'cmd' })
      expect(logAudit).toHaveBeenCalled()
    })
  })

  describe('handleAddQQTargetCommand', () => {
    it('creates telegram group for new friend', async () => {
      const inst = { ...mockInstance, workMode: 'personal', forwardPairs: { findByQQ: vi.fn(), findByTG: vi.fn() } } as any
      const feat = new CommandsFeature(inst, mockTgBot as any, mockQqClient as any)
      const msg = { platform: 'telegram', chat: { id: 111 }, sender: { id: 'admin' } } as any
      
      const provisionerMock = { ensurePairForQQTarget: vi.fn().mockResolvedValue({ tgChatId: '-999' }) }
      ;(feat as any).personalPairProvisioner = provisionerMock
      
      const spy = vi.spyOn(feat as any, 'replyTG').mockResolvedValue(undefined)
      await (feat as any).handleAddQQTargetCommand(msg, ['10001'], 'private')
      expect(provisionerMock.ensurePairForQQTarget).toHaveBeenCalledWith('10001', 'private')
      expect(spy).toHaveBeenCalledWith(111, expect.stringContaining('-999'), undefined)
    })
  })

  describe('loadPluginCommands', () => {
    it('loads commands from runtime if available', async () => {
      const mockHandler = vi.fn()
      const mockGetGlobalRuntime = vi.fn().mockReturnValue({
        getLastReport: () => ({
          loadedPlugins: [{
            id: 'test-plugin',
            context: {
              getCommands: () => new Map([
                ['mycmd', { name: 'mycmd', aliases: ['mc'], handler: mockHandler }]
              ])
            }
          }]
        })
      })
      vi.doMock('@napgram/plugin-kit', () => ({ getGlobalRuntime: mockGetGlobalRuntime }))
      
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
        id: 'msg-1'
      } as any

      // Mock registry to return a command
      const mockCmd = { name: 'help', permission: { level: 3 }, handler: vi.fn() }
      ;(commandsFeature as any).registry.get = vi.fn().mockReturnValue(mockCmd)
      // Bypass work mode block
      vi.spyOn(commandsFeature as any, 'blockUntilWorkModeConfigured').mockResolvedValue(false)
      // Allow permission
      vi.spyOn(commandsFeature as any, 'checkPermission').mockResolvedValue({ allowed: true })
      
      await (commandsFeature as any).handleQqMessage(msg)
      expect(mockCmd.handler).toHaveBeenCalled()
    })

    it('handleQQMessage ignores non-command messages', async () => {
      const msg = {
        platform: 'qq',
        content: [{ type: 'text', data: { text: 'hello' } }]
      } as any
      await (commandsFeature as any).handleQqMessage(msg)
    })

    it('handleQQMessage ignores commands aimed at other bots via @suffix', async () => {
      const msg = {
        platform: 'qq',
        content: [{ type: 'text', data: { text: '/help@otherbot' } }]
      } as any
      ;(commandsFeature as any).instance.botUsername = 'mybot'
      await (commandsFeature as any).handleQqMessage(msg)
    })

    it('handleQQMessage ignores commands aimed at other bots via args', async () => {
      const msg = {
        platform: 'qq',
        content: [{ type: 'text', data: { text: '/help @otherbot' } }]
      } as any
      ;(commandsFeature as any).instance.botUsername = 'mybot'
      await (commandsFeature as any).handleQqMessage(msg)
    })

    it('handleQQMessage denies access when permission fails', async () => {
      const msg = {
        platform: 'qq',
        chat: { id: '20002' },
        sender: { id: '10001' },
        content: [{ type: 'text', data: { text: '/admin' } }]
      } as any
      const mockCmd = { name: 'admin', permission: { level: 1 }, handler: vi.fn() }
      ;(commandsFeature as any).registry.get = vi.fn().mockReturnValue(mockCmd)
      vi.spyOn(commandsFeature as any, 'blockUntilWorkModeConfigured').mockResolvedValue(false)
      vi.spyOn(commandsFeature as any, 'checkPermission').mockResolvedValue({ allowed: false, reason: 'not admin' })
      vi.spyOn(commandsFeature as any, 'logAudit').mockResolvedValue(undefined)
      
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
      const mockCmd = { name: 'help', handler: vi.fn() }
      ;(commandsFeature as any).registry.get = vi.fn().mockReturnValue(mockCmd)
      vi.spyOn(commandsFeature as any, 'checkPermission').mockResolvedValue({ allowed: true })
      
      const result = await (commandsFeature as any).handleTgMessage(tgMsg)
      expect(result).toBe(true)
      expect(mockCmd.handler).toHaveBeenCalled()
    })

    it('handleTgMessage denies access', async () => {
      const tgMsg = { text: '/admin', chat: { id: 111 }, sender: { id: 222 } } as any
      const mockCmd = { name: 'admin', handler: vi.fn() }
      ;(commandsFeature as any).registry.get = vi.fn().mockReturnValue(mockCmd)
      vi.spyOn(commandsFeature as any, 'checkPermission').mockResolvedValue({ allowed: false })
      const spyReply = vi.spyOn(commandsFeature as any, 'replyTG').mockResolvedValue(undefined)

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
      const mockCmd = { name: 'workmode', handler: vi.fn() }
      ;(commandsFeature as any).registry.get = vi.fn().mockReturnValue(mockCmd)
      vi.spyOn(commandsFeature as any, 'isWorkModeConfigured').mockReturnValue(true)
      vi.spyOn(commandsFeature as any, 'handleWorkModeCommand').mockResolvedValue(undefined)

      const result = await (commandsFeature as any).handleTgMessage(tgMsg)
      expect(result).toBe(true)
    })

    it('handleTgMessage blocks when work mode not configured', async () => {
      const tgMsg = { text: '/help', chat: { id: 111 }, sender: { id: 222, isBot: false } } as any
      const mockCmd = { name: 'help', handler: vi.fn() }
      ;(commandsFeature as any).registry.get = vi.fn().mockReturnValue(mockCmd)
      vi.spyOn(commandsFeature as any, 'blockUntilWorkModeConfigured').mockResolvedValue(true)

      const result = await (commandsFeature as any).handleTgMessage(tgMsg)
      expect(result).toBe(true)
      expect(mockCmd.handler).not.toHaveBeenCalled()
    })

    it('handleTgMessage handles stale binding state when work mode not configured', async () => {
      const handler = mockTgBot.addNewMessageEventHandler.mock.calls[0][0]
      const stateManager = (commandsFeature as any).stateManager
      vi.spyOn(commandsFeature as any, 'isWorkModeConfigured').mockReturnValue(false)
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
      const mockCmd = { name: 'help', handler: vi.fn(), adminOnly: false }
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
      const mockCmd = { name: 'workmode', handler: vi.fn() }
      registry.get.mockReturnValue(mockCmd)
      // Mock handleWorkModeCommand on the instance since it's the method being called
      const spy = vi.spyOn(commandsFeature as any, 'handleWorkModeCommand').mockResolvedValue(undefined)

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
      const mockCmd = { name: 'help', handler: vi.fn() }
      registry.get.mockReturnValue(mockCmd)
      vi.spyOn(commandsFeature as any, 'blockUntilWorkModeConfigured').mockResolvedValue(true)

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
      const customLogger = { info: vi.fn(), debug: vi.fn() }
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
      const forwardPairs = mockInstance.forwardPairs
      forwardPairs.findByTG = vi.fn().mockReturnValue({ qqChatType: 'private' })
      const result = await (commandsFeature as any).isFriendPairCommand({
        platform: 'telegram',
        chat: { id: '111' },
        metadata: {},
      })
      expect(result).toBe(true)
    })
  })

  describe('replyTG', () => {
    it('sends message via tgBot.getChat', async () => {
      const sendMessage = vi.fn().mockResolvedValue({ id: 321 })
      mockTgBot.getChat.mockResolvedValue({ sendMessage })

      await (commandsFeature as any).replyTG(123, 'test message')

      expect(mockTgBot.getChat).toHaveBeenCalled()
      expect(sendMessage).toHaveBeenCalled()
    })

    it('handles replyTG error gracefully', async () => {
      mockTgBot.getChat.mockRejectedValue(new Error('chat not found'))
      // Should not throw
      await (commandsFeature as any).replyTG(123, 'test')
    })
  })
})
}
)
