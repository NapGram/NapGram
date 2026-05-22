import { beforeEach, describe, expect, it, vi } from 'vitest'
import ForwardFeature from '../ForwardFeature.js'
import { MessageUtils } from '../utils/MessageUtils.js'

const loggerMocks = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}))

vi.mock('../../../../shared-types.js', () => ({
  getLogger: vi.fn(() => loggerMocks),
}))

vi.mock('../utils/MessageUtils.js', () => ({
  MessageUtils: {
    replyTG: vi.fn().mockResolvedValue(undefined),
  },
}))

describe('ForwardFeature - Notice Events', () => {
  let qqClientListeners: Record<string, Function[]> = {}

  const qqClient = {
    on: vi.fn((event: string, callback: Function) => {
      if (!qqClientListeners[event]) {
        qqClientListeners[event] = []
      }
      qqClientListeners[event].push(callback)
    }),
    removeListener: vi.fn((event: string, callback: Function) => {
      if (qqClientListeners[event]) {
        qqClientListeners[event] = qqClientListeners[event].filter(cb => cb !== callback)
      }
    }),
    getFriendInfo: vi.fn(),
    getGroupInfo: vi.fn(),
    uin: 12345,
  } as any

  const tgBot = {
    addNewMessageEventHandler: vi.fn(),
    removeNewMessageEventHandler: vi.fn(),
  } as any

  const instance = {
    id: 7,
    owner: 99999,
    workMode: 'personal',
    forwardPairs: {
      reload: vi.fn(),
      findByQQ: vi.fn(),
      findByTG: vi.fn(),
    },
  } as any

  beforeEach(() => {
    vi.clearAllMocks()
    qqClientListeners = {}
  })

  it('notifies the owner when a new QQ friend is added', async () => {
    qqClient.getFriendInfo.mockResolvedValue({ id: '10001', name: 'Alice' })

    const feature = new ForwardFeature(instance, tgBot, qqClient)

    // Trigger the friend.increase callback
    const callbacks = qqClientListeners['friend.increase'] || []
    expect(callbacks.length).toBe(1)

    await callbacks[0]({ id: '10001', name: 'Alice' })

    expect(MessageUtils.replyTG).toHaveBeenCalledWith(
      tgBot,
      99999,
      expect.stringContaining('发现新 QQ 好友：\nQQ: 10001\n昵称: Alice')
    )
    expect(MessageUtils.replyTG).toHaveBeenCalledWith(
      tgBot,
      99999,
      expect.stringContaining('/bindfriend 10001')
    )

    feature.destroy()
  })

  it('notifies the owner when the robot joins a new QQ group', async () => {
    qqClient.getGroupInfo.mockResolvedValue({ id: '20002', name: 'My Group' })

    const feature = new ForwardFeature(instance, tgBot, qqClient)

    // Trigger the group.increase callback with robot's own UIN
    const callbacks = qqClientListeners['group.increase'] || []
    expect(callbacks.length).toBe(1)

    await callbacks[0]('20002', { id: '12345' })

    expect(MessageUtils.replyTG).toHaveBeenCalledWith(
      tgBot,
      99999,
      expect.stringContaining('发现新 QQ 群：\n群号: 20002\n群名: My Group')
    )
    expect(MessageUtils.replyTG).toHaveBeenCalledWith(
      tgBot,
      99999,
      expect.stringContaining('/bindgroup 20002')
    )

    feature.destroy()
  })

  it('ignores group increase events from other users', async () => {
    const feature = new ForwardFeature(instance, tgBot, qqClient)

    const callbacks = qqClientListeners['group.increase'] || []
    expect(callbacks.length).toBe(1)

    await callbacks[0]('20002', { id: '67890' })

    expect(MessageUtils.replyTG).not.toHaveBeenCalled()

    feature.destroy()
  })
})
