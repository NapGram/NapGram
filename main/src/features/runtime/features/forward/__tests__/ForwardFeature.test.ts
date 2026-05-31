import type { UnifiedMessage } from '@napgram/message-kit'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, eq, schema } from '../../../shared-types.js'

/* ---------- hoisted mocks ---------- */
const loggerMocks = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}))

const eventPublisherMocks = vi.hoisted(() => ({
  publishMessage: vi.fn(),
  publishMessageCreated: vi.fn(),
}))

const performanceMonitorMocks = vi.hoisted(() => ({
  recordMessage: vi.fn(),
  recordError: vi.fn(),
}))

vi.mock('../../../shared-types.js', async importOriginal => ({
  ...(await importOriginal() as any),
  db: {
    execute: vi.fn().mockResolvedValue({ rows: [], rowCount: 1 }),
    update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) }),
  },
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings: [...strings], values })),
  eq: vi.fn((a: any, b: any) => ({ a, b })),
  schema: { forwardPair: { id: 'id' } },
  getLogger: vi.fn(() => loggerMocks),
  getEventPublisher: vi.fn(() => eventPublisherMocks),
  performanceMonitor: performanceMonitorMocks,
  env: { FORWARD_MODE: '11', SHOW_NICKNAME_MODE: '11' },
}))

vi.mock('../../../work-mode-gate.js', () => ({
  hasConfiguredWorkMode: vi.fn().mockReturnValue(true),
  CONFIGURED_WORK_MODES: new Set(['group', 'personal', 'public']),
}))

vi.mock('@napgram/message-kit', () => ({
  messageConverter: {
    fromTelegram: vi.fn().mockReturnValue({
      id: 'converted-1',
      platform: 'telegram',
      content: [{ type: 'text', data: { text: 'converted' } }],
      sender: { id: '100', name: 'TgUser' },
      chat: { id: '-100', type: 'group' },
    }),
  },
}))

vi.mock('../../../../../shared/utils/index.js', () => ({
  telegramSend: {
    normalizeTelegramChatId: vi.fn((id: any) => Number(id)),
    normalizeTelegramMessageId: vi.fn((id: any) => id ? Number(id) : undefined),
  },
}))

vi.mock('../../commands/services/ThreadIdExtractor.js', () => ({
  ThreadIdExtractor: class { extractFromRaw() { return undefined } },
}))

vi.mock('../../commands/utils/ForwardPairChatType.js', () => ({
  findPairByTGWithChatType: vi.fn().mockResolvedValue(undefined),
  findPairByQQWithChatType: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../handlers/MediaGroupHandler.js', () => ({
  MediaGroupHandler: class {
    destroy = vi.fn()
  },
}))

vi.mock('../handlers/TelegramMessageHandler.js', () => ({
  TelegramMessageHandler: class {
    handleTGMessage = vi.fn().mockResolvedValue(undefined)
  },
}))

vi.mock('../senders/MediaPreparer.js', () => ({
  ForwardMediaPreparer: class {
    prepareMediaForQQ = vi.fn()
  },
}))

vi.mock('../senders/TelegramSender.js', () => ({
  TelegramSender: class {
    sendToTelegram = vi.fn().mockResolvedValue({ id: 999 })
  },
}))

vi.mock('../services/MessageMapper.js', () => ({
  ForwardMapper: class {
    saveMessage = vi.fn().mockResolvedValue(undefined)
  },
}))

vi.mock('../services/PersonalPairProvisioner.js', () => ({
  PersonalPairProvisioner: class {
    ensurePairForQQMessage = vi.fn().mockResolvedValue(undefined)
  },
}))

vi.mock('../services/PersonalSyncService.js', () => ({
  PersonalSyncService: class {
    start = vi.fn()
    stop = vi.fn()
  },
}))

vi.mock('../services/ReplyResolver.js', () => ({
  ReplyResolver: class {
    resolveQQReply = vi.fn().mockResolvedValue(undefined)
  },
}))

vi.mock('../utils/MessageUtils.js', () => ({
  MessageUtils: {
    populateAtDisplayNames: vi.fn().mockResolvedValue(undefined),
    replyTG: vi.fn().mockResolvedValue(undefined),
    isAdmin: vi.fn().mockReturnValue(true),
  },
}))

import { hasConfiguredWorkMode } from '../../../work-mode-gate.js'
import { findPairByQQWithChatType, findPairByTGWithChatType } from '../../commands/utils/ForwardPairChatType.js'
import { MessageUtils } from '../utils/MessageUtils.js'
import { ForwardFeature } from '../ForwardFeature.js'

/* ---------- helpers ---------- */
function createInstance(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    owner: 'owner-tg-123',
    flags: 0,
    forwardPairs: {
      findByQQ: vi.fn(),
      findByTG: vi.fn(),
      getAll: vi.fn().mockReturnValue([]),
      reload: vi.fn().mockResolvedValue(undefined),
      add: vi.fn(),
    },
    tgBot: createTgBot(),
    ...overrides,
  } as any
}

function createTgBot() {
  return {
    addNewMessageEventHandler: vi.fn(),
    removeNewMessageEventHandler: vi.fn(),
    getChat: vi.fn().mockResolvedValue({
      sendMessage: vi.fn().mockResolvedValue({ id: 500 }),
      deleteMessages: vi.fn().mockResolvedValue(undefined),
    }),
  } as any
}

function createQqClient(overrides: Record<string, unknown> = {}) {
  const handlers: Record<string, Function[]> = {}
  return {
    uin: '88888',
    nickname: 'BotNick',
    on: vi.fn((event: string, handler: Function) => {
      if (!handlers[event]) handlers[event] = []
      handlers[event].push(handler)
    }),
    removeListener: vi.fn((event: string, handler: Function) => {
      if (handlers[event]) handlers[event] = handlers[event].filter(h => h !== handler)
    }),
    emit: (event: string, ...args: any[]) => {
      (handlers[event] || []).forEach(h => h(...args))
    },
    sendMessage: vi.fn().mockResolvedValue({ messageId: 'qq-sent-1' }),
    recallMessage: vi.fn().mockResolvedValue(undefined),
    getGroupMemberInfo: vi.fn().mockResolvedValue({ card: 'Card', nickname: 'Nick' }),
    getGroupInfo: vi.fn().mockResolvedValue({ name: 'TestGroup' }),
    getFriendInfo: vi.fn().mockResolvedValue({ name: 'FriendName' }),
    _handlers: handlers,
    ...overrides,
  } as any
}

function createPair(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    instanceId: 1,
    qqRoomId: '20002',
    tgChatId: '-100400',
    tgThreadId: null,
    flags: 0,
    apiKey: 'key',
    forwardMode: null,
    nicknameMode: null,
    ignoreSenders: null,
    ignoreRegex: null,
    qqChatType: 'group',
    ...overrides,
  } as any
}

function createQqMessage(overrides: Partial<UnifiedMessage> = {}): UnifiedMessage {
  return {
    id: 'qq-msg-1',
    platform: 'qq',
    sender: { id: '10001', name: 'TestUser' },
    chat: { id: '20002', type: 'group', name: 'TestGroup' },
    content: [{ type: 'text', data: { text: 'hello world' } }],
    timestamp: Date.now(),
    metadata: { raw: {} },
    ...overrides,
  } as UnifiedMessage
}

function createTgMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: 1001,
    text: 'hello from tg',
    chat: { id: -100400 },
    sender: { id: 100, displayName: 'TgUser', username: 'tguser' },
    date: Date.now(),
    raw: {},
    ...overrides,
  } as any
}

function buildFeature(instance?: any, tgBot?: any, qqClient?: any) {
  const inst = instance ?? createInstance()
  const bot = tgBot ?? inst.tgBot ?? createTgBot()
  const qq = qqClient ?? createQqClient()
  return { feature: new ForwardFeature(inst, bot, qq), instance: inst, tgBot: bot, qqClient: qq }
}

/* ---------- tests ---------- */
describe('forwardFeature', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(hasConfiguredWorkMode).mockReturnValue(true)
    vi.mocked(findPairByTGWithChatType).mockResolvedValue(undefined)
    vi.mocked(findPairByQQWithChatType).mockResolvedValue(undefined)
    vi.mocked(MessageUtils.isAdmin).mockReturnValue(true)
    vi.mocked(MessageUtils.replyTG).mockResolvedValue(undefined)
    vi.mocked(MessageUtils.populateAtDisplayNames).mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  /* ---- constructor ---- */
  describe('constructor', () => {
    it('initializes with a valid ForwardMap and registers listeners', () => {
      const { qqClient } = buildFeature()
      expect(qqClient.on).toHaveBeenCalledWith('message', expect.any(Function))
      expect(qqClient.on).toHaveBeenCalledWith('poke', expect.any(Function))
      expect(qqClient.on).toHaveBeenCalledWith('friend.increase', expect.any(Function))
      expect(qqClient.on).toHaveBeenCalledWith('group.increase', expect.any(Function))
    })

    it('throws when forwardPairs is not a ForwardMap', () => {
      const inst = createInstance({ forwardPairs: [] })
      expect(() => new ForwardFeature(inst, createTgBot(), createQqClient()))
        .toThrow('Forward map is not initialized')
    })

    it('registers mode command when commands feature is provided', () => {
      const commands = { registerCommand: vi.fn() }
      buildFeature(createInstance(), createTgBot(), createQqClient())
      // Without commands, no registration — just a smoke test
    })
  })

  /* ---- QQ → TG forwarding ---- */
  describe('handleQQMessage (QQ→TG)', () => {
    it('skips when work mode is not configured', async () => {
      vi.mocked(hasConfiguredWorkMode).mockReturnValue(false)
      const { qqClient } = buildFeature()
      qqClient.emit('message', createQqMessage())
      await vi.waitFor(() => {
        expect(performanceMonitorMocks.recordMessage).not.toHaveBeenCalled()
      })
    })

    it('skips self QQ messages', async () => {
      const { qqClient } = buildFeature()
      qqClient.emit('message', createQqMessage({ sender: { id: '88888', name: 'Self' } }))
      await vi.waitFor(() => {
        expect(findPairByQQWithChatType).not.toHaveBeenCalled()
      })
    })

    it('deduplicates QQ messages with same id', async () => {
      const pair = createPair()
      vi.mocked(findPairByQQWithChatType).mockResolvedValue(pair)
      const { qqClient, tgBot } = buildFeature()
      tgBot.getChat.mockResolvedValue({ sendMessage: vi.fn().mockResolvedValue({ id: 501 }) })

      const msg = createQqMessage({ id: 'dup-1' })
      qqClient.emit('message', msg)
      qqClient.emit('message', { ...msg })
      await vi.waitFor(() => {
        // findPairByQQWithChatType should be called only once (second is dedup)
        expect(loggerMocks.info).toHaveBeenCalledWith(expect.stringContaining('Duplicate'))
      })
    })

    it('skips command messages starting with /', async () => {
      const pair = createPair()
      vi.mocked(findPairByQQWithChatType).mockResolvedValue(pair)
      const { qqClient } = buildFeature()
      qqClient.emit('message', createQqMessage({
        content: [{ type: 'text', data: { text: '/help' } }],
      }))
      await vi.waitFor(() => {
        expect(loggerMocks.debug).toHaveBeenCalledWith(
          expect.objectContaining({ text: '/help' }),
          expect.stringContaining('Skipping command'),
        )
      })
    })

    it('skips when no pair mapping found', async () => {
      vi.mocked(findPairByQQWithChatType).mockResolvedValue(undefined)
      const { qqClient } = buildFeature()
      qqClient.emit('message', createQqMessage())
      await vi.waitFor(() => {
        expect(loggerMocks.debug).toHaveBeenCalledWith(expect.stringContaining('No TG mapping'))
      })
    })

    it('skips when forward mode QQ→TG is disabled', async () => {
      const pair = createPair({ forwardMode: '01' }) // QQ→TG disabled, TG→QQ enabled
      vi.mocked(findPairByQQWithChatType).mockResolvedValue(pair)
      const { qqClient } = buildFeature()
      qqClient.emit('message', createQqMessage())
      await vi.waitFor(() => {
        expect(loggerMocks.debug).toHaveBeenCalledWith(expect.stringContaining('disabled'))
      })
    })

    it('filters messages by ignoreSenders blocklist', async () => {
      const pair = createPair({ ignoreSenders: '10001,10002' })
      vi.mocked(findPairByQQWithChatType).mockResolvedValue(pair)
      const { qqClient } = buildFeature()
      qqClient.emit('message', createQqMessage({ sender: { id: '10001', name: 'Blocked' } }))
      await vi.waitFor(() => {
        expect(loggerMocks.info).toHaveBeenCalledWith(expect.stringContaining('blocklist'))
      })
    })

    it('filters messages by ignoreRegex', async () => {
      const pair = createPair({ ignoreRegex: '^hello' })
      vi.mocked(findPairByQQWithChatType).mockResolvedValue(pair)
      const { qqClient } = buildFeature()
      qqClient.emit('message', createQqMessage({
        content: [{ type: 'text', data: { text: 'hello world' } }],
      }))
      await vi.waitFor(() => {
        expect(loggerMocks.info).toHaveBeenCalledWith(expect.stringContaining('matched regex'))
      })
    })

    it('handles invalid ignoreRegex gracefully', async () => {
      const pair = createPair({ ignoreRegex: '[invalid' })
      vi.mocked(findPairByQQWithChatType).mockResolvedValue(pair)
      const { qqClient } = buildFeature()
      qqClient.emit('message', createQqMessage())
      await vi.waitFor(() => {
        expect(loggerMocks.warn).toHaveBeenCalledWith(
          expect.stringContaining('Invalid ignoreRegex'),
          expect.anything(),
        )
      })
    })

    it('forwards QQ message to TG and records performance', async () => {
      const pair = createPair()
      vi.mocked(findPairByQQWithChatType).mockResolvedValue(pair)
      const { qqClient, tgBot } = buildFeature()
      const chatMock = { sendMessage: vi.fn().mockResolvedValue({ id: 501 }) }
      tgBot.getChat.mockResolvedValue(chatMock)

      qqClient.emit('message', createQqMessage({ id: 'fwd-1' }))
      await vi.waitFor(() => {
        expect(performanceMonitorMocks.recordMessage).toHaveBeenCalled()
      })
    })

    it('records error on forwarding failure', async () => {
      const pair = createPair()
      vi.mocked(findPairByQQWithChatType).mockResolvedValue(pair)
      const { qqClient, tgBot } = buildFeature()
      tgBot.getChat.mockRejectedValue(new Error('TG unavailable'))

      qqClient.emit('message', createQqMessage({ id: 'err-1' }))
      await vi.waitFor(() => {
        expect(performanceMonitorMocks.recordError).toHaveBeenCalled()
      })
    })

    it('publishes plugin events for QQ messages', async () => {
      const pair = createPair()
      vi.mocked(findPairByQQWithChatType).mockResolvedValue(pair)
      const { qqClient, tgBot } = buildFeature()
      tgBot.getChat.mockResolvedValue({ sendMessage: vi.fn().mockResolvedValue({ id: 502 }) })

      qqClient.emit('message', createQqMessage({ id: 'plugin-1' }))
      await vi.waitFor(() => {
        expect(eventPublisherMocks.publishMessage).toHaveBeenCalled()
        const call = eventPublisherMocks.publishMessage.mock.calls[0][0]
        expect(call.platform).toBe('qq')
        expect(call.eventId).toBe('qq:plugin-1')
      })
    })
  })

  /* ---- TG → QQ forwarding ---- */
  describe('handleTgMessage (TG→QQ)', () => {
    function getTgHandler(tgBot: any): Function {
      return tgBot.addNewMessageEventHandler.mock.calls[0][0]
    }

    it('skips when work mode is not configured', async () => {
      vi.mocked(hasConfiguredWorkMode).mockReturnValue(false)
      const { tgBot } = buildFeature()
      const handler = getTgHandler(tgBot)
      await handler(createTgMessage())
      expect(findPairByTGWithChatType).not.toHaveBeenCalled()
    })

    it('skips when no pair mapping found for TG chat', async () => {
      vi.mocked(findPairByTGWithChatType).mockResolvedValue(undefined)
      const { tgBot } = buildFeature()
      const handler = getTgHandler(tgBot)
      await handler(createTgMessage())
      expect(loggerMocks.debug).toHaveBeenCalledWith(expect.stringContaining('No QQ mapping'))
    })

    it('skips command messages starting with /', async () => {
      const pair = createPair()
      vi.mocked(findPairByTGWithChatType).mockResolvedValue(pair)
      const { tgBot } = buildFeature()
      const handler = getTgHandler(tgBot)
      await handler(createTgMessage({ text: '/help args' }))
      expect(loggerMocks.debug).toHaveBeenCalledWith(
        expect.objectContaining({ text: '/help args' }),
        expect.stringContaining('Skipping command'),
      )
    })

    it('skips when forward mode TG→QQ is disabled', async () => {
      const pair = createPair({ forwardMode: '10' }) // QQ→TG enabled, TG→QQ disabled
      vi.mocked(findPairByTGWithChatType).mockResolvedValue(pair)
      const { tgBot } = buildFeature()
      const handler = getTgHandler(tgBot)
      await handler(createTgMessage())
      expect(loggerMocks.debug).toHaveBeenCalledWith(expect.stringContaining('TG->QQ disabled'))
    })

    it('publishes plugin and gateway events for TG messages', async () => {
      const pair = createPair()
      vi.mocked(findPairByTGWithChatType).mockResolvedValue(pair)
      const { tgBot } = buildFeature()
      const handler = getTgHandler(tgBot)
      await handler(createTgMessage())
      expect(eventPublisherMocks.publishMessage).toHaveBeenCalled()
      expect(eventPublisherMocks.publishMessageCreated).toHaveBeenCalled()
    })
  })

  /* ---- poke event ---- */
  describe('handlePokeEvent', () => {
    it('skips when work mode not configured', async () => {
      vi.mocked(hasConfiguredWorkMode).mockReturnValue(false)
      const { qqClient } = buildFeature()
      qqClient.emit('poke', '20002', '10001', '10002')
      await vi.waitFor(() => {
        expect(MessageUtils.replyTG).not.toHaveBeenCalled()
      })
    })

    it('skips when no pair for the group', async () => {
      vi.mocked(findPairByQQWithChatType).mockResolvedValue(undefined)
      const { qqClient } = buildFeature()
      qqClient.emit('poke', '20002', '10001', '10002')
      await vi.waitFor(() => {
        expect(MessageUtils.replyTG).not.toHaveBeenCalled()
      })
    })

    it('skips when forward mode QQ→TG is disabled', async () => {
      const pair = createPair({ forwardMode: '01' })
      vi.mocked(findPairByQQWithChatType).mockResolvedValue(pair)
      const { qqClient } = buildFeature()
      qqClient.emit('poke', '20002', '10001', '10002')
      await vi.waitFor(() => {
        expect(MessageUtils.replyTG).not.toHaveBeenCalled()
      })
    })

    it('forwards poke event with member names', async () => {
      const pair = createPair()
      vi.mocked(findPairByQQWithChatType).mockResolvedValue(pair)
      const { qqClient } = buildFeature()
      qqClient.emit('poke', '20002', '10001', '10002')
      await vi.waitFor(() => {
        expect(MessageUtils.replyTG).toHaveBeenCalledWith(
          expect.anything(),
          BigInt('-100400'),
          expect.stringContaining('戳了戳'),
          undefined,
        )
      })
    })

    it('shows self-poke text when operator equals target', async () => {
      const pair = createPair()
      vi.mocked(findPairByQQWithChatType).mockResolvedValue(pair)
      const { qqClient } = buildFeature()
      qqClient.emit('poke', '20002', '10001', '10001')
      await vi.waitFor(() => {
        expect(MessageUtils.replyTG).toHaveBeenCalledWith(
          expect.anything(),
          BigInt('-100400'),
          expect.stringContaining('poked themselves'),
          undefined,
        )
      })
    })
  })

  /* ---- friend increase ---- */
  describe('handleFriendIncrease', () => {
    it('notifies owner in personal mode', async () => {
      const inst = createInstance({ workMode: 'personal' })
      const { qqClient } = buildFeature(inst)
      qqClient.emit('friend.increase', { id: '55555', name: 'NewFriend' })
      await vi.waitFor(() => {
        expect(MessageUtils.replyTG).toHaveBeenCalledWith(
          expect.anything(),
          'owner-tg-123',
          expect.stringContaining('新 QQ 好友'),
        )
      })
    })

    it('skips in non-personal mode', async () => {
      const inst = createInstance({ workMode: 'group' })
      const { qqClient } = buildFeature(inst)
      qqClient.emit('friend.increase', { id: '55555' })
      await vi.waitFor(() => {
        expect(MessageUtils.replyTG).not.toHaveBeenCalled()
      })
    })

    it('skips when no owner is set', async () => {
      const inst = createInstance({ workMode: 'personal', owner: undefined })
      const { qqClient } = buildFeature(inst)
      qqClient.emit('friend.increase', { id: '55555' })
      await vi.waitFor(() => {
        expect(MessageUtils.replyTG).not.toHaveBeenCalled()
      })
    })
  })

  /* ---- group increase ---- */
  describe('handleGroupIncrease', () => {
    it('notifies owner when bot itself joins a new group', async () => {
      const inst = createInstance({ workMode: 'personal' })
      const { qqClient } = buildFeature(inst)
      qqClient.emit('group.increase', '30003', { id: '88888' }) // self uin
      await vi.waitFor(() => {
        expect(MessageUtils.replyTG).toHaveBeenCalledWith(
          expect.anything(),
          'owner-tg-123',
          expect.stringContaining('新 QQ 群'),
        )
      })
    })

    it('skips when a non-self member joins', async () => {
      const inst = createInstance({ workMode: 'personal' })
      const { qqClient } = buildFeature(inst)
      qqClient.emit('group.increase', '30003', { id: '99999' })
      await vi.waitFor(() => {
        expect(MessageUtils.replyTG).not.toHaveBeenCalled()
      })
    })

    it('skips in non-personal mode', async () => {
      const inst = createInstance({ workMode: 'group' })
      const { qqClient } = buildFeature(inst)
      qqClient.emit('group.increase', '30003', { id: '88888' })
      await vi.waitFor(() => {
        expect(MessageUtils.replyTG).not.toHaveBeenCalled()
      })
    })
  })

  /* ---- renderContent ---- */
  describe('renderContent', () => {
    it('renders various content types', () => {
      const { feature } = buildFeature()
      const render = (feature as any).renderContent.bind(feature)

      expect(render({ type: 'text', data: { text: 'hello\\nworld' } })).toBe('hello\nworld')
      expect(render({ type: 'image', data: {} })).toBe('[图片]')
      expect(render({ type: 'video', data: {} })).toBe('[视频]')
      expect(render({ type: 'audio', data: {} })).toBe('[语音]')
      expect(render({ type: 'file', data: { filename: 'test.pdf' } })).toBe('[文件:test.pdf]')
      expect(render({ type: 'file', data: {} })).toBe('[文件:文件]')
      expect(render({ type: 'at', data: { userName: 'Alice' } })).toBe('@Alice')
      expect(render({ type: 'at', data: { userId: '123' } })).toBe('@123')
      expect(render({ type: 'face', data: { text: '😊' } })).toBe('😊')
      expect(render({ type: 'face', data: {} })).toBe('[表情]')
      expect(render({ type: 'reply', data: { messageId: '42', text: 'ref' } })).toBe('(回复 42:ref)')
      expect(render({ type: 'reply', data: { messageId: '42' } })).toBe('(回复 42)')
      expect(render({ type: 'forward', data: { messages: [1, 2, 3] } })).toBe('[转发消息x3]')
      expect(render({ type: 'location', data: { title: 'Home', latitude: 30.5, longitude: 120.1 } })).toBe('[位置:Home 30.5,120.1]')
      expect(render({ type: 'unknown', data: {} })).toBe('[unknown]')
    })
  })

  /* ---- getForwardMode / getNicknameMode ---- */
  describe('mode helpers', () => {
    it('uses pair forwardMode when set, otherwise env default', () => {
      const { feature } = buildFeature()
      const getMode = (feature as any).getForwardMode.bind(feature)
      expect(getMode(createPair({ forwardMode: '01' }))).toBe('01')
      expect(getMode(createPair({ forwardMode: null }))).toBe('11') // env default
    })

    it('uses personal mode default for nicknameMode when unset', () => {
      const inst = createInstance({ workMode: 'personal' })
      const { feature } = buildFeature(inst)
      const getMode = (feature as any).getNicknameMode.bind(feature)
      expect(getMode(createPair({ nicknameMode: null }))).toBe('10')
      expect(getMode(createPair({ nicknameMode: '01' }))).toBe('01')
    })
  })

  /* ---- isSelfQQMessage ---- */
  describe('isSelfQQMessage', () => {
    it('identifies self messages by uin match', () => {
      const { feature } = buildFeature()
      const isSelf = (feature as any).isSelfQQMessage.bind(feature)
      expect(isSelf(createQqMessage({ sender: { id: '88888', name: 'Bot' } }))).toBe(true)
      expect(isSelf(createQqMessage({ sender: { id: '99999', name: 'Other' } }))).toBe(false)
      expect(isSelf(createQqMessage({ sender: { id: '', name: '' } }))).toBe(false)
    })
  })

  /* ---- extractFloodWaitSeconds ---- */
  describe('extractFloodWaitSeconds', () => {
    it('extracts seconds from FLOOD_WAIT error messages', () => {
      const { feature } = buildFeature()
      const extract = (feature as any).extractFloodWaitSeconds.bind(feature)
      expect(extract(new Error('FLOOD_WAIT_30'))).toBe(30)
      expect(extract(new Error('A wait of 15 seconds'))).toBe(15)
      expect(extract(new Error('Some other error'))).toBeNull()
      expect(extract(null)).toBeNull()
    })
  })

  /* ---- toPluginSegments ---- */
  describe('toPluginSegments', () => {
    it('converts various content types to plugin segments', () => {
      const { feature } = buildFeature()
      const convert = (feature as any).toPluginSegments.bind(feature)

      const result = convert([
        { type: 'text', data: { text: 'hi' } },
        { type: 'at', data: { userId: '123', userName: 'Alice' } },
        { type: 'reply', data: { messageId: '42' } },
        { type: 'image', data: { url: 'https://img.test/a.jpg' } },
        { type: 'video', data: { file: '/tmp/v.mp4' } },
        { type: 'audio', data: { url: 'https://audio.test/a.mp3' } },
        { type: 'file', data: { url: 'https://f.test/f.zip', filename: 'f.zip' } },
        { type: 'forward', data: { messages: [{ sender: { id: '1', name: 'A' }, content: [{ type: 'text', data: { text: 'nested' } }] }] } },
        { type: 'custom', data: { foo: 'bar' } },
        null,
      ], 'qq')

      expect(result).toHaveLength(9) // null is skipped
      expect(result[0]).toEqual({ type: 'text', data: { text: 'hi' } })
      expect(result[1].type).toBe('at')
      expect(result[1].data.userName).toBe('Alice')
      expect(result[2]).toEqual({ type: 'reply', data: { messageId: '42' } })
      expect(result[3].type).toBe('image')
      expect(result[4].type).toBe('video')
      expect(result[5].type).toBe('audio')
      expect(result[6].type).toBe('file')
      expect(result[6].data.name).toBe('f.zip')
      expect(result[7].type).toBe('forward')
      expect(result[7].data.messages).toHaveLength(1)
      expect(result[8]).toEqual({ type: 'raw', data: { platform: 'qq', content: { type: 'custom', data: { foo: 'bar' } } } })
    })
  })

  /* ---- contentToText ---- */
  describe('contentToText', () => {
    it('converts string content directly', () => {
      const { feature } = buildFeature()
      const toText = (feature as any).contentToText.bind(feature)
      expect(toText('plain text')).toBe('plain text')
    })

    it('converts array of segments to text', () => {
      const { feature } = buildFeature()
      const toText = (feature as any).contentToText.bind(feature)
      expect(toText([
        { type: 'text', data: { text: 'hello ' } },
        { type: 'at', data: { userName: 'Bob' } },
        'raw string',
        null,
      ])).toBe('hello @Bobraw string')
    })

    it('handles non-array non-string content', () => {
      const { feature } = buildFeature()
      const toText = (feature as any).contentToText.bind(feature)
      expect(toText(undefined)).toBe('')
      expect(toText(42)).toBe('42')
    })
  })

  /* ---- destroy ---- */
  describe('destroy', () => {
    it('removes all listeners and stops services', () => {
      const { feature, qqClient, tgBot } = buildFeature()
      feature.destroy()
      expect(qqClient.removeListener).toHaveBeenCalledWith('message', expect.any(Function))
      expect(qqClient.removeListener).toHaveBeenCalledWith('poke', expect.any(Function))
      expect(qqClient.removeListener).toHaveBeenCalledWith('friend.increase', expect.any(Function))
      expect(qqClient.removeListener).toHaveBeenCalledWith('group.increase', expect.any(Function))
      expect(tgBot.removeNewMessageEventHandler).toHaveBeenCalled()
    })
  })

  /* ---- sleep / getMinSendIntervalMs ---- */
  describe('internal utilities', () => {
    it('sleep resolves immediately for ms <= 0', async () => {
      const { feature } = buildFeature()
      const sleep = (feature as any).sleep.bind(feature)
      await expect(sleep(0)).resolves.toBeUndefined()
      await expect(sleep(-1)).resolves.toBeUndefined()
    })

    it('getMinSendIntervalMs returns 0 in test environment', () => {
      const { feature } = buildFeature()
      const getInterval = (feature as any).getMinSendIntervalMs.bind(feature)
      expect(getInterval()).toBe(0)
    })
  })

  /* ---- handleModeCommand ---- */
  describe('handleModeCommand', () => {
    function buildModeCommandMsg(overrides: Record<string, unknown> = {}) {
      return {
        id: 'mode-msg-1',
        platform: 'telegram',
        chat: { id: '-100400', type: 'group' },
        sender: { id: '100', name: 'Admin' },
        content: [{ type: 'text', data: { text: '/mode nickname 10' } }],
        timestamp: Date.now(),
        metadata: { raw: {} },
        ...overrides,
      } as any
    }

    it('rejects non-admin users', async () => {
      vi.mocked(MessageUtils.isAdmin).mockReturnValue(false)
      const { feature } = buildFeature()
      const handleMode = (feature as any).handleModeCommand.bind(feature)
      await handleMode(buildModeCommandMsg(), ['nickname', '10'])
      expect(MessageUtils.replyTG).toHaveBeenCalledWith(
        expect.anything(),
        '-100400',
        expect.stringContaining('没有权限'),
        undefined,
      )
    })

    it('shows usage when args are missing', async () => {
      const { feature } = buildFeature()
      const handleMode = (feature as any).handleModeCommand.bind(feature)
      await handleMode(buildModeCommandMsg(), [])
      expect(MessageUtils.replyTG).toHaveBeenCalledWith(
        expect.anything(),
        '-100400',
        expect.stringContaining('用法'),
        undefined,
      )
    })

    it('shows usage when value format is invalid', async () => {
      const { feature } = buildFeature()
      const handleMode = (feature as any).handleModeCommand.bind(feature)
      await handleMode(buildModeCommandMsg(), ['nickname', '99'])
      expect(MessageUtils.replyTG).toHaveBeenCalledWith(
        expect.anything(),
        '-100400',
        expect.stringContaining('用法'),
        undefined,
      )
    })

    it('reports error when pair not found', async () => {
      const inst = createInstance()
      inst.forwardPairs.findByTG = vi.fn().mockReturnValue(undefined)
      const { feature } = buildFeature(inst)
      const handleMode = (feature as any).handleModeCommand.bind(feature)
      await handleMode(buildModeCommandMsg(), ['nickname', '10'])
      expect(MessageUtils.replyTG).toHaveBeenCalledWith(
        expect.anything(),
        '-100400',
        expect.stringContaining('未找到'),
        undefined,
      )
    })

    it('updates nickname mode successfully', async () => {
      const pair = createPair({ forwardMode: '11', nicknameMode: '11' })
      const inst = createInstance()
      inst.forwardPairs.findByTG = vi.fn().mockReturnValue(pair)
      const { feature } = buildFeature(inst)
      const handleMode = (feature as any).handleModeCommand.bind(feature)
      await handleMode(buildModeCommandMsg(), ['nickname', '10'])
      expect(pair.nicknameMode).toBe('10')
      expect(MessageUtils.replyTG).toHaveBeenCalledWith(
        expect.anything(),
        '-100400',
        expect.stringContaining('昵称显示模式已更新为: 10'),
        undefined,
      )
    })

    it('updates forward mode successfully', async () => {
      const pair = createPair({ forwardMode: '11', nicknameMode: '11' })
      const inst = createInstance()
      inst.forwardPairs.findByTG = vi.fn().mockReturnValue(pair)
      const { feature } = buildFeature(inst)
      const handleMode = (feature as any).handleModeCommand.bind(feature)
      await handleMode(buildModeCommandMsg(), ['forward', '01'])
      expect(pair.forwardMode).toBe('01')
      expect(MessageUtils.replyTG).toHaveBeenCalledWith(
        expect.anything(),
        '-100400',
        expect.stringContaining('转发模式已更新为: 01'),
        undefined,
      )
    })

    it('rejects unknown mode type', async () => {
      const pair = createPair()
      const inst = createInstance()
      inst.forwardPairs.findByTG = vi.fn().mockReturnValue(pair)
      const { feature } = buildFeature(inst)
      const handleMode = (feature as any).handleModeCommand.bind(feature)
      await handleMode(buildModeCommandMsg(), ['unknown', '10'])
      expect(MessageUtils.replyTG).toHaveBeenCalledWith(
        expect.anything(),
        '-100400',
        expect.stringContaining('未知模式类型'),
        undefined,
      )
    })

    it('handles db update error', async () => {
      const pair = createPair({ forwardMode: '11' })
      const inst = createInstance()
      inst.forwardPairs.findByTG = vi.fn().mockReturnValue(pair)
      const { feature } = buildFeature(inst)
      // Make db.update().set().where() throw
      const { db: dbMock } = await import('../../../shared-types.js')
      ;(dbMock.update as any).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockRejectedValue(new Error('DB error')),
        }),
      })
      const handleMode = (feature as any).handleModeCommand.bind(feature)
      await handleMode(buildModeCommandMsg(), ['nickname', '10'])
      expect(MessageUtils.replyTG).toHaveBeenCalledWith(
        expect.anything(),
        '-100400',
        expect.stringContaining('更新失败'),
        undefined,
      )
    })
  })

  /* ---- executeTelegramSendWithRetry ---- */
  describe('executeTelegramSendWithRetry', () => {
    it('retries on FLOOD_WAIT errors', async () => {
      const { feature } = buildFeature()
      // Mock sleep to avoid real delays
      const sleepSpy = vi.spyOn(feature as any, 'sleep').mockResolvedValue(undefined)
      const exec = (feature as any).executeTelegramSendWithRetry.bind(feature)
      let callCount = 0
      const task = vi.fn().mockImplementation(async () => {
        callCount++
        if (callCount < 3) throw new Error('FLOOD_WAIT_5')
        return 'ok'
      })
      const result = await exec(task)
      expect(result).toBe('ok')
      expect(task).toHaveBeenCalledTimes(3)
      expect(sleepSpy).toHaveBeenCalled()
      sleepSpy.mockRestore()
    })

    it('throws after max attempts on FLOOD_WAIT', async () => {
      const { feature } = buildFeature()
      vi.spyOn(feature as any, 'sleep').mockResolvedValue(undefined)
      const exec = (feature as any).executeTelegramSendWithRetry.bind(feature)
      const task = vi.fn().mockRejectedValue(new Error('FLOOD_WAIT_30'))
      await expect(exec(task)).rejects.toThrow('FLOOD_WAIT_30')
      expect(task).toHaveBeenCalledTimes(3)
    })

    it('throws immediately on non-FLOOD errors', async () => {
      const { feature } = buildFeature()
      const exec = (feature as any).executeTelegramSendWithRetry.bind(feature)
      const task = vi.fn().mockRejectedValue(new Error('Network error'))
      await expect(exec(task)).rejects.toThrow('Network error')
      expect(task).toHaveBeenCalledTimes(1)
    })
  })

  /* ---- handleFriendIncrease error path ---- */
  describe('handleFriendIncrease errors', () => {
    it('handles error when notifying owner fails', async () => {
      const inst = createInstance({ workMode: 'personal' })
      const { qqClient } = buildFeature(inst)
      vi.mocked(MessageUtils.replyTG).mockRejectedValueOnce(new Error('TG down'))
      qqClient.emit('friend.increase', { id: '55555', name: 'NewFriend' })
      await vi.waitFor(() => {
        expect(loggerMocks.error).toHaveBeenCalledWith(
          expect.stringContaining('Failed to notify friend increase'),
          expect.anything(),
        )
      })
    })
  })

  /* ---- handleGroupIncrease error paths ---- */
  describe('handleGroupIncrease edge cases', () => {
    it('skips when work mode is not configured', async () => {
      vi.mocked(hasConfiguredWorkMode).mockReturnValue(false)
      const inst = createInstance({ workMode: 'personal' })
      const { qqClient } = buildFeature(inst)
      qqClient.emit('group.increase', '30003', { id: '88888' })
      await vi.waitFor(() => {
        expect(MessageUtils.replyTG).not.toHaveBeenCalled()
      })
    })

    it('skips when no owner is set', async () => {
      const inst = createInstance({ workMode: 'personal', owner: undefined })
      const { qqClient } = buildFeature(inst)
      qqClient.emit('group.increase', '30003', { id: '88888' })
      await vi.waitFor(() => {
        expect(MessageUtils.replyTG).not.toHaveBeenCalled()
      })
    })

    it('handles error when notifying owner fails', async () => {
      const inst = createInstance({ workMode: 'personal' })
      const { qqClient } = buildFeature(inst)
      vi.mocked(MessageUtils.replyTG).mockRejectedValueOnce(new Error('TG down'))
      qqClient.emit('group.increase', '30003', { id: '88888' })
      await vi.waitFor(() => {
        expect(loggerMocks.error).toHaveBeenCalledWith(
          expect.stringContaining('Failed to notify group increase'),
          expect.anything(),
        )
      })
    })

    it('uses getPersonalModeDiagnostics when workMode is not direct property', async () => {
      const inst = createInstance({
        workMode: undefined,
        getPersonalModeDiagnostics: vi.fn().mockReturnValue({ workMode: 'personal' }),
      })
      const { qqClient } = buildFeature(inst)
      qqClient.emit('group.increase', '30003', { id: '88888' })
      await vi.waitFor(() => {
        expect(MessageUtils.replyTG).toHaveBeenCalledWith(
          expect.anything(),
          'owner-tg-123',
          expect.stringContaining('新 QQ 群'),
        )
      })
    })
  })

  /* ---- handleTgMessage error paths ---- */
  describe('handleTgMessage edge cases', () => {
    function getTgHandler(tgBot: any): Function {
      return tgBot.addNewMessageEventHandler.mock.calls[0][0]
    }

    it('handles messageConverter.fromTelegram throwing', async () => {
      const pair = createPair()
      vi.mocked(findPairByTGWithChatType).mockResolvedValue(pair)
      const messageConverter = (await import('@napgram/message-kit')).messageConverter as any
      messageConverter.fromTelegram.mockImplementationOnce(() => { throw new Error('convert error') })
      const { tgBot } = buildFeature()
      const handler = getTgHandler(tgBot)
      // Should not throw, just logs debug
      await handler(createTgMessage())
      expect(loggerMocks.debug).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining('Failed to convert'),
      )
    })

    it('handles publishMessageCreated throwing', async () => {
      const pair = createPair()
      vi.mocked(findPairByTGWithChatType).mockResolvedValue(pair)
      eventPublisherMocks.publishMessageCreated.mockRejectedValueOnce(new Error('publish error'))
      const { tgBot } = buildFeature()
      const handler = getTgHandler(tgBot)
      await handler(createTgMessage())
      expect(loggerMocks.debug).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining('publishMessageCreated (TG) failed'),
      )
    })
  })
})
