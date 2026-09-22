/* eslint-disable */
import { describe, expect, it, mock } from 'bun:test'

// env mock 对象可写，便于切换 SYSTEM_MESSAGE_RECALL_SECONDS
const envMock: any = {
  env: { SYSTEM_MESSAGE_RECALL_SECONDS: 60 },
  flags: {},
}
mock.module('../../../capabilities/env.js', () => envMock)

const { CommandsFeature } = await import('../CommandsFeature.js')

function createFeature() {
  const feature: any = Object.create(CommandsFeature.prototype)
  feature.tgBot = {
    sendText: mock().mockResolvedValue({ id: 321 }),
    getChat: mock().mockResolvedValue({ deleteMessages: mock().mockResolvedValue(undefined) }),
  }
  feature.qqClient = {
    recallMessage: mock().mockResolvedValue(undefined),
  }
  feature.commandContext = {
    extractThreadId: mock().mockReturnValue(undefined),
    replyQQ: mock().mockResolvedValue({ messageId: '' }),
  }
  return feature
}

describe('system message auto recall', () => {
  it('schedules recall for TG work mode prompt with the sent message id', async () => {
    const feature = createFeature()
    const scheduleSpy = mock()
    feature.scheduleSystemMessageRecall = scheduleSpy

    await feature.replyWorkModeMessage({ platform: 'telegram', chat: { id: '123' }, sender: {} } as any, 'prompt')

    expect(feature.tgBot.sendText).toHaveBeenCalled()
    expect(scheduleSpy).toHaveBeenCalledWith('telegram', '123', 321)
  })

  it('schedules recall for QQ work mode prompt with the receipt message id', async () => {
    const feature = createFeature()
    const scheduleSpy = mock()
    feature.scheduleSystemMessageRecall = scheduleSpy
    feature.commandContext.replyQQ.mockResolvedValue({ messageId: '555' })

    await feature.replyWorkModeMessage({ platform: 'qq', chat: { id: 'room1' }, sender: {} } as any, 'prompt')

    expect(feature.commandContext.replyQQ).toHaveBeenCalled()
    expect(scheduleSpy).toHaveBeenCalledWith('qq', 'room1', '555')
  })

  it('skips scheduling when receipt has no message id', async () => {
    const feature = createFeature()
    const scheduleSpy = mock()
    feature.scheduleSystemMessageRecall = scheduleSpy

    await feature.replyWorkModeMessage({ platform: 'qq', chat: { id: 'room1' }, sender: {} } as any, 'prompt')

    expect(scheduleSpy).toHaveBeenCalledWith('qq', 'room1', '')
  })

  it('skips scheduling when ttl is 0', async () => {
    const feature = createFeature()
    const scheduleSpy = mock()
    feature.scheduleSystemMessageRecall = scheduleSpy
    envMock.env.SYSTEM_MESSAGE_RECALL_SECONDS = 0

    await feature.replyWorkModeMessage({ platform: 'telegram', chat: { id: '123' }, sender: {} } as any, 'prompt')

    expect(scheduleSpy).toHaveBeenCalled()

    envMock.env.SYSTEM_MESSAGE_RECALL_SECONDS = 60
  })

  it('deletes the TG system message via getChat().deleteMessages', async () => {
    const feature = createFeature()

    await feature.recallSystemMessage('telegram', 123, '321')

    expect(feature.tgBot.getChat).toHaveBeenCalledWith(123)
    const chat = await feature.tgBot.getChat.mock.results[0].value
    expect(chat.deleteMessages).toHaveBeenCalledWith([321])
  })

  it('recalls the QQ system message via qqClient.recallMessage', async () => {
    const feature = createFeature()

    await feature.recallSystemMessage('qq', 'room1', '555')

    expect(feature.qqClient.recallMessage).toHaveBeenCalledWith('555')
  })

  it('swallows recall failures on both platforms', async () => {
    const feature = createFeature()
    feature.tgBot.getChat = mock().mockRejectedValue(new Error('boom'))
    feature.qqClient.recallMessage = mock().mockRejectedValue(new Error('boom'))

    await feature.recallSystemMessage('telegram', 123, '321')
    await feature.recallSystemMessage('qq', 'room1', '555')

    expect(true).toBe(true)
  })
})
