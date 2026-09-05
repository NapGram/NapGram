import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { MessageUtils } from '../MessageUtils.js'

const envKitEnv = {
  ENABLE_AUTO_RECALL: true,
  TG_MEDIA_TTL_SECONDS: undefined as number | undefined,
  DATA_DIR: '/tmp',
  CACHE_DIR: '/tmp/cache',
  WEB_ENDPOINT: 'http://napgram-dev:8080',
  ADMIN_QQ: undefined as number | string | null | undefined,
  ADMIN_TG: undefined as number | string | null | undefined,
}

mock.module('@napgram/env-kit', () => ({
  env: envKitEnv,
  getSystemOwners: () => ({ qq: envKitEnv.ADMIN_QQ, tg: envKitEnv.ADMIN_TG }),
  normalizeUserIdentity: (value: unknown) => String(value ?? '').trim().replace(/^(?:tg|qq):u:/i, ''),
  isConfiguredIdentity: (value: unknown) => value !== undefined && value !== null && String(value).trim() !== '',
  matchesUserIdentity: (userId: string, identity: unknown) => {
    const normalize = (value: unknown) => String(value ?? '').trim().replace(/^(?:tg|qq):u:/i, '')
    return String(userId ?? '') !== '' && normalize(userId) === normalize(identity)
  },
  matchesAnyIdentity: (userId: string, identities: unknown[]) => {
    const normalize = (value: unknown) => String(value ?? '').trim().replace(/^(?:tg|qq):u:/i, '')
    return String(userId ?? '') !== '' && identities.some(identity => normalize(userId) === normalize(identity))
  },
}))

mock.module('@napgram/logger-kit', () => ({
  getLogger: mock(() => ({ debug: mock(), info: mock(), warn: mock(), error: mock(), trace: mock() })),
}))

describe('messageUtils', () => {
  beforeEach(() => {})

  describe('populateAtDisplayNames', () => {
    it('skips processing for non-group chats', async () => {
      const msg: any = { chat: { type: 'private', id: '123' }, content: [{ type: 'at', data: { userId: '111' } }] }
      const qqClient: any = { getGroupMemberInfo: mock() }
      await MessageUtils.populateAtDisplayNames(msg, qqClient)
      expect(qqClient.getGroupMemberInfo).not.toHaveBeenCalled()
    })

    it('skips non-at content types', async () => {
      const msg: any = { chat: { type: 'group', id: '456' }, content: [{ type: 'text', data: { text: 'hello' } }, { type: 'image', data: {} }] }
      const qqClient: any = { getGroupMemberInfo: mock() }
      await MessageUtils.populateAtDisplayNames(msg, qqClient)
      expect(qqClient.getGroupMemberInfo).not.toHaveBeenCalled()
    })

    it('skips at-all mentions', async () => {
      const msg: any = { chat: { type: 'group', id: '456' }, content: [{ type: 'at', data: { userId: 'all' } }] }
      const qqClient: any = { getGroupMemberInfo: mock() }
      await MessageUtils.populateAtDisplayNames(msg, qqClient)
      expect(qqClient.getGroupMemberInfo).not.toHaveBeenCalled()
    })

    it('skips at mentions with missing userId', async () => {
      const msg: any = { chat: { type: 'group', id: '456' }, content: [{ type: 'at', data: {} }] }
      const qqClient: any = { getGroupMemberInfo: mock() }
      await MessageUtils.populateAtDisplayNames(msg, qqClient)
      expect(qqClient.getGroupMemberInfo).not.toHaveBeenCalled()
    })

    it('uses cached names for repeated mentions', async () => {
      const msg: any = { chat: { type: 'group', id: '789' }, content: [{ type: 'at', data: { userId: '111', userName: 'Alice' } }, { type: 'at', data: { userId: '111' } }] }
      const qqClient: any = { getGroupMemberInfo: mock() }
      await MessageUtils.populateAtDisplayNames(msg, qqClient)
      expect(msg.content[0].data.userName).toBe('Alice')
      expect(msg.content[1].data.userName).toBe('Alice')
      expect(qqClient.getGroupMemberInfo).not.toHaveBeenCalled()
    })

    it('uses provided userName when available', async () => {
      const msg: any = { chat: { type: 'group', id: '789' }, content: [{ type: 'at', data: { userId: '222', userName: 'Bob' } }] }
      const qqClient: any = { getGroupMemberInfo: mock() }
      await MessageUtils.populateAtDisplayNames(msg, qqClient)
      expect(msg.content[0].data.userName).toBe('Bob')
      expect(qqClient.getGroupMemberInfo).not.toHaveBeenCalled()
    })

    it('fetches member info when userName is missing', async () => {
      const msg: any = { chat: { type: 'group', id: '789' }, content: [{ type: 'at', data: { userId: '333' } }] }
      const qqClient: any = { getGroupMemberInfo: mock().mockResolvedValue({ card: 'Charlie Card', nickname: 'Charlie Nick' }) }
      await MessageUtils.populateAtDisplayNames(msg, qqClient)
      expect(qqClient.getGroupMemberInfo).toHaveBeenCalledWith('789', '333')
      expect(msg.content[0].data.userName).toBe('Charlie Card')
    })

    it('uses nickname when card is empty', async () => {
      const msg: any = { chat: { type: 'group', id: '789' }, content: [{ type: 'at', data: { userId: '444' } }] }
      const qqClient: any = { getGroupMemberInfo: mock().mockResolvedValue({ card: '', nickname: 'David' }) }
      await MessageUtils.populateAtDisplayNames(msg, qqClient)
      expect(msg.content[0].data.userName).toBe('David')
    })

    it('falls back to userId when member info is unavailable', async () => {
      const msg: any = { chat: { type: 'group', id: '789' }, content: [{ type: 'at', data: { userId: '555' } }] }
      const qqClient: any = { getGroupMemberInfo: mock().mockResolvedValue({ card: '', nickname: '' }) }
      await MessageUtils.populateAtDisplayNames(msg, qqClient)
      expect(msg.content[0].data.userName).toBe('555')
    })

    it('handles error when fetching member info', async () => {
      const msg: any = { chat: { type: 'group', id: '789' }, content: [{ type: 'at', data: { userId: '666', userName: '666' } }] }
      const qqClient: any = { getGroupMemberInfo: mock().mockRejectedValue(new Error('Network error')) }
      await MessageUtils.populateAtDisplayNames(msg, qqClient)
      expect(msg.content[0].data.userName).toBe('666')
    })

    it('falls back to userId when error occurs and userName is empty', async () => {
      const msg: any = { chat: { type: 'group', id: '789' }, content: [{ type: 'at', data: { userId: '777', userName: '   ' } }] }
      const qqClient: any = { getGroupMemberInfo: mock().mockRejectedValue(new Error('Network error')) }
      await MessageUtils.populateAtDisplayNames(msg, qqClient)
      expect(msg.content[0].data.userName).toBe('777')
    })
  })

  describe('isAdmin', () => {
    const mockInstance: any = { owner: '1234567890' }

    it('returns true for instance owner', () => {
      expect(MessageUtils.isAdmin('1234567890', mockInstance)).toBe(true)
    })

    it('returns true if matches ADMIN_QQ', () => {
      envKitEnv.ADMIN_QQ = '1111'
      expect(MessageUtils.isAdmin('1111', mockInstance)).toBe(true)
      envKitEnv.ADMIN_QQ = null
    })

    it('returns true if matches ADMIN_TG', () => {
      envKitEnv.ADMIN_TG = '2222'
      expect(MessageUtils.isAdmin('2222', mockInstance)).toBe(true)
      envKitEnv.ADMIN_TG = null
    })

    it('returns false for non-admin user', () => {
      expect(MessageUtils.isAdmin('9999999999', mockInstance)).toBeFalsy()
    })
  })

  describe('replyTG', () => {
    it('sends message to Telegram chat', async () => {
      const mockTgBot: any = { sendText: mock().mockResolvedValue({}) }
      await MessageUtils.replyTG(mockTgBot, '123456', 'Test message')
      expect(mockTgBot.sendText).toHaveBeenCalledWith(123456, 'Test message', { linkPreview: { disable: true } })
    })

    it('converts string chat ID to number', async () => {
      const mockTgBot: any = { sendText: mock().mockResolvedValue({}) }
      await MessageUtils.replyTG(mockTgBot, '-100123456789', 'Message')
      expect(mockTgBot.sendText).toHaveBeenCalledWith(-100123456789, 'Message', { linkPreview: { disable: true } })
    })

    it('sends message with replyTo parameter', async () => {
      const mockTgBot: any = { sendText: mock().mockResolvedValue({}) }
      await MessageUtils.replyTG(mockTgBot, 123456, 'Reply message', 789)
      expect(mockTgBot.sendText).toHaveBeenCalledWith(123456, 'Reply message', { linkPreview: { disable: true }, replyTo: 789 })
    })

    it('handles error when sending message', async () => {
      const mockTgBot: any = { sendText: mock().mockRejectedValue(new Error('Chat not found')) }
      await expect(MessageUtils.replyTG(mockTgBot, 'invalid-chat', 'Message')).resolves.toBeUndefined()
    })

    it('keeps non-numeric string chatId as-is', async () => {
      const mockTgBot: any = { sendText: mock().mockResolvedValue({}) }
      await MessageUtils.replyTG(mockTgBot, '@username', 'Message to username')
      expect(mockTgBot.sendText).toHaveBeenCalledWith('@username', 'Message to username', { linkPreview: { disable: true } })
    })
  })
})
