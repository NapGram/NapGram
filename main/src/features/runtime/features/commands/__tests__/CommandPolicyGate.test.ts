/* eslint-disable */
import { describe, expect, it, mock } from 'bun:test'

const envMock: any = {
  env: { COMMAND_POLICY: 'slash', SYSTEM_MESSAGE_RECALL_SECONDS: 0 },
  flags: {},
}
mock.module('../../../capabilities/env.js', () => envMock)

const { CommandsFeature, evaluateCommandGate, COMMAND_POLICY_ALWAYS_ALLOWED } = await import('../CommandsFeature.js')

function createFeature(pair?: any) {
  const feature: any = Object.create(CommandsFeature.prototype)
  feature.tgBot = { sendText: mock().mockResolvedValue({ id: 1 }), me: { username: 'mybot', id: 999 }, getChat: mock() }
  feature.qqClient = { uin: '10000', recallMessage: mock() }
  feature.commandContext = { extractThreadId: mock().mockReturnValue(undefined), replyQQ: mock().mockResolvedValue({ messageId: '1' }) }
  feature.instance = {
    id: 1,
    forwardPairs: pair
      ? { findByQQ: () => pair, findByTG: () => pair, add: mock().mockResolvedValue({ ...pair }) }
      : undefined,
  }
  return feature
}

describe('command policy gate', () => {
  it('evaluateCommandGate: slash never blocks', () => {
    expect(evaluateCommandGate('slash', 'ban', false)).toBe(false)
    expect(evaluateCommandGate('slash', 'ban', true)).toBe(false)
  })

  it('evaluateCommandGate: off blocks everything except recovery commands', () => {
    expect(evaluateCommandGate('off', 'ban', true)).toBe(true)
    expect(evaluateCommandGate('off', 'start', false)).toBe(false)
    expect(evaluateCommandGate('off', 'cmdpolicy', false)).toBe(false)
    expect(evaluateCommandGate('off', 'workmode', false)).toBe(false)
    expect(evaluateCommandGate('off', 'help', false)).toBe(false)
  })

  it('evaluateCommandGate: mention requires self mention', () => {
    expect(evaluateCommandGate('mention', 'ban', false)).toBe(true)
    expect(evaluateCommandGate('mention', 'ban', true)).toBe(false)
    expect(evaluateCommandGate('mention', 'start', false)).toBe(false)
  })

  it('evaluateCommandGate: unknown/null policy falls back to slash semantics', () => {
    expect(evaluateCommandGate(null, 'ban', false)).toBe(false)
    expect(evaluateCommandGate(undefined, 'ban', false)).toBe(false)
    expect(evaluateCommandGate('garbage', 'ban', false)).toBe(false)
  })

  it('resolves pair policy over env default', async () => {
    const feature = createFeature({ commandPolicy: 'mention' })
    const policy = await feature.resolveCommandPolicy({ platform: 'qq', chatId: '555', msg: { chat: { type: 'group' }, content: [] } as any })
    expect(policy).toBe('mention')
  })

  it('falls back to env when pair has no policy', async () => {
    envMock.env.COMMAND_POLICY = 'off'
    const feature = createFeature({ commandPolicy: null })
    const policy = await feature.resolveCommandPolicy({ platform: 'qq', chatId: '555', msg: { chat: { type: 'group' }, content: [] } as any })
    expect(policy).toBe('off')
    envMock.env.COMMAND_POLICY = 'slash'
  })

  it('falls back to env when forward map unavailable', async () => {
    envMock.env.COMMAND_POLICY = 'mention'
    const feature = createFeature()
    const policy = await feature.resolveCommandPolicy({ platform: 'qq', chatId: '555', msg: { chat: { type: 'group' }, content: [] } as any })
    expect(policy).toBe('mention')
    envMock.env.COMMAND_POLICY = 'slash'
  })

  it('detects QQ self at-segment by uin', () => {
    const feature = createFeature()
    expect(feature.isSelfMentioned({
      platform: 'qq',
      msg: { chat: { type: 'group' }, content: [{ type: 'at', data: { userId: '10000' } }] } as any,
    })).toBe(true)
    expect(feature.isSelfMentioned({
      platform: 'qq',
      msg: { chat: { type: 'group' }, content: [{ type: 'at', data: { userId: '20000' } }] } as any,
    })).toBe(false)
    expect(feature.isSelfMentioned({ platform: 'qq', msg: { chat: { type: 'group' }, content: [] } as any })).toBe(false)
  })

  it('detects TG self mention via entities', () => {
    const feature = createFeature()
    expect(feature.isSelfMentioned({
      platform: 'tg',
      tgMsg: { entities: [{ kind: 'mention', text: '@mybot' }] } as any,
      parts: ['/ban', '@mybot'],
    })).toBe(true)
    expect(feature.isSelfMentioned({
      platform: 'tg',
      tgMsg: { entities: [{ kind: 'mention', text: '@otherbot' }] } as any,
      parts: ['/ban', '@otherbot'],
    })).toBe(false)
  })

  it('blockCommandByPolicy blocks QQ /ban when off, allows start', async () => {
    const feature = createFeature({ commandPolicy: 'off' })
    expect(await feature.blockCommandByPolicy('ban', { platform: 'qq', chatId: '555', msg: { chat: { type: 'group' }, content: [] } as any })).toBe(true)
    expect(await feature.blockCommandByPolicy('start', { platform: 'qq', chatId: '555', msg: { chat: { type: 'group' }, content: [] } as any })).toBe(false)
  })

  it('blockCommandByPolicy mention mode requires QQ at', async () => {
    const feature = createFeature({ commandPolicy: 'mention' })
    const noAt = { chat: { type: 'group' }, content: [{ type: 'text', data: { text: '/ban' } }] } as any
    const withAt = { chat: { type: 'group' }, content: [{ type: 'at', data: { userId: '10000' } }] } as any
    expect(await feature.blockCommandByPolicy('ban', { platform: 'qq', chatId: '555', msg: noAt })).toBe(true)
    expect(await feature.blockCommandByPolicy('ban', { platform: 'qq', chatId: '555', msg: withAt })).toBe(false)
  })

  it('handleCommandPolicyCommand writes policy via forwardMap.add', async () => {
    const pair = { qqRoomId: 555n, qqChatType: 'group', tgChatId: -100123n, tgThreadId: null }
    const add = mock().mockResolvedValue({ ...pair, commandPolicy: 'mention' })
    const feature: any = Object.create(CommandsFeature.prototype)
    feature.tgBot = { sendText: mock().mockResolvedValue({ id: 1 }), me: { username: 'mybot' }, getChat: mock() }
    feature.qqClient = { uin: '10000', recallMessage: mock() }
    feature.commandContext = { extractThreadId: mock().mockReturnValue(undefined), replyQQ: mock().mockResolvedValue({ messageId: '1' }) }
    feature.instance = { id: 1, forwardPairs: { findByQQ: () => pair, findByTG: () => pair, add } }
    const sent: string[] = []
    feature.replyWorkModeMessage = mock(async (_msg: any, text: string) => { sent.push(text) })

    await feature.handleCommandPolicyCommand({ platform: 'qq', chat: { id: '555', type: 'group' }, sender: {} } as any, ['mention'])
    expect(add).toHaveBeenCalledWith(expect.objectContaining({ commandPolicy: 'mention', qqRoomId: '555', tgChatId: -100123n }))
    expect(sent[0]).toContain('mention')
  })

  it('handleCommandPolicyCommand rejects invalid values with usage', async () => {
    const feature = createFeature({ commandPolicy: 'slash' })
    const sent: string[] = []
    feature.replyWorkModeMessage = mock(async (_msg: any, text: string) => { sent.push(text) })
    await feature.handleCommandPolicyCommand({ platform: 'qq', chat: { id: '555', type: 'group' }, sender: {} } as any, ['bogus'])
    expect(sent[0]).toContain('用法')
  })
})

describe('COMMAND_POLICY_ALWAYS_ALLOWED', () => {
  it('contains recovery commands', () => {
    for (const name of ['start', 'workmode', 'cmdpolicy', 'help'])
      expect(COMMAND_POLICY_ALWAYS_ALLOWED.has(name)).toBe(true)
  })
})
