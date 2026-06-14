import { beforeEach, describe, expect, it, vi } from 'vitest'
import { bridgeQQEvents } from '../QQEventBridge.js'

describe('qQEventBridge', () => {
  let qqClient: any
  let eventPublisher: any
  let log: any
  let instance: any

  beforeEach(() => {
    qqClient = {
      on: vi.fn(),
      handleFriendRequest: vi.fn(),
      handleGroupRequest: vi.fn(),
    }
    eventPublisher = {
      publishFriendRequest: vi.fn(),
      publishGroupRequest: vi.fn(),
      publishNotice: vi.fn(),
    }
    log = { debug: vi.fn() }
    instance = {
      hasConfiguredWorkMode: vi.fn().mockReturnValue(true),
    }
  })

  it('should ignore events if work mode is not configured', () => {
    instance.hasConfiguredWorkMode.mockReturnValue(false)
    bridgeQQEvents(1, qqClient, eventPublisher, log, instance)

    // Call request.friend
    const onFriend = qqClient.on.mock.calls.find((c: any) => c[0] === 'request.friend')[1]
    onFriend({ flag: '123' })
    expect(eventPublisher.publishFriendRequest).not.toHaveBeenCalled()

    // Call request.group
    const onGroup = qqClient.on.mock.calls.find((c: any) => c[0] === 'request.group')[1]
    onGroup({ flag: '123' })
    expect(eventPublisher.publishGroupRequest).not.toHaveBeenCalled()

    // Call group.increase
    const onGroupInc = qqClient.on.mock.calls.find((c: any) => c[0] === 'group.increase')[1]
    onGroupInc('123', {})
    expect(eventPublisher.publishNotice).not.toHaveBeenCalled()

    // Call group.decrease
    const onGroupDec = qqClient.on.mock.calls.find((c: any) => c[0] === 'group.decrease')[1]
    onGroupDec('123', '456')
    expect(eventPublisher.publishNotice).not.toHaveBeenCalled()

    // Call friend.increase
    const onFriendInc = qqClient.on.mock.calls.find((c: any) => c[0] === 'friend.increase')[1]
    onFriendInc({})
    expect(eventPublisher.publishNotice).not.toHaveBeenCalled()

    // Call recall
    const onRecall = qqClient.on.mock.calls.find((c: any) => c[0] === 'recall')[1]
    onRecall({})
    expect(eventPublisher.publishNotice).not.toHaveBeenCalled()

    // Call poke
    const onPoke = qqClient.on.mock.calls.find((c: any) => c[0] === 'poke')[1]
    onPoke('123', '456', '789')
    expect(eventPublisher.publishNotice).not.toHaveBeenCalled()
  })

  it('should handle request.friend', async () => {
    bridgeQQEvents(1, qqClient, eventPublisher, log, instance)
    const onFriend = qqClient.on.mock.calls.find((c: any) => c[0] === 'request.friend')[1]

    // Missing flag
    onFriend({})
    expect(eventPublisher.publishFriendRequest).not.toHaveBeenCalled()

    onFriend({ flag: '123', userId: '456', comment: 'hello', timestamp: 123456 })
    expect(eventPublisher.publishFriendRequest).toHaveBeenCalled()
    const call = eventPublisher.publishFriendRequest.mock.calls[0][0]

    await call.approve()
    expect(qqClient.handleFriendRequest).toHaveBeenCalledWith('123', true)

    await call.reject('no')
    expect(qqClient.handleFriendRequest).toHaveBeenCalledWith('123', false, 'no')
  })

  it('should throw if qqClient missing handleFriendRequest', async () => {
    delete qqClient.handleFriendRequest
    bridgeQQEvents(1, qqClient, eventPublisher, log, instance)
    const onFriend = qqClient.on.mock.calls.find((c: any) => c[0] === 'request.friend')[1]
    onFriend({ flag: '123' })
    const call = eventPublisher.publishFriendRequest.mock.calls[0][0]

    await expect(call.approve()).rejects.toThrow()
    await expect(call.reject()).rejects.toThrow()
  })

  it('should handle request.group', async () => {
    bridgeQQEvents(1, qqClient, eventPublisher, log, instance)
    const onGroup = qqClient.on.mock.calls.find((c: any) => c[0] === 'request.group')[1]

    // Missing flag
    onGroup({})
    expect(eventPublisher.publishGroupRequest).not.toHaveBeenCalled()

    onGroup({ flag: '123', groupId: '789', userId: '456', subType: 'invite' })
    expect(eventPublisher.publishGroupRequest).toHaveBeenCalled()
    const call = eventPublisher.publishGroupRequest.mock.calls[0][0]

    await call.approve()
    expect(qqClient.handleGroupRequest).toHaveBeenCalledWith('123', 'invite', true)

    await call.reject('no')
    expect(qqClient.handleGroupRequest).toHaveBeenCalledWith('123', 'invite', false, 'no')
  })

  it('should throw if qqClient missing handleGroupRequest', async () => {
    delete qqClient.handleGroupRequest
    bridgeQQEvents(1, qqClient, eventPublisher, log, instance)
    const onGroup = qqClient.on.mock.calls.find((c: any) => c[0] === 'request.group')[1]
    onGroup({ flag: '123' })
    const call = eventPublisher.publishGroupRequest.mock.calls[0][0]

    await expect(call.approve()).rejects.toThrow()
    await expect(call.reject()).rejects.toThrow()
  })

  it('should handle group.increase and group.decrease', () => {
    bridgeQQEvents(1, qqClient, eventPublisher, log, instance)

    const onGroupInc = qqClient.on.mock.calls.find((c: any) => c[0] === 'group.increase')[1]
    onGroupInc('123', { id: '456' })
    expect(eventPublisher.publishNotice).toHaveBeenCalledWith(expect.objectContaining({ noticeType: 'group-member-increase' }))

    const onGroupDec = qqClient.on.mock.calls.find((c: any) => c[0] === 'group.decrease')[1]
    onGroupDec('123', '456')
    expect(eventPublisher.publishNotice).toHaveBeenCalledWith(expect.objectContaining({ noticeType: 'group-member-decrease' }))
  })

  it('should handle friend.increase', () => {
    bridgeQQEvents(1, qqClient, eventPublisher, log, instance)
    const onFriendInc = qqClient.on.mock.calls.find((c: any) => c[0] === 'friend.increase')[1]
    onFriendInc({ id: '456' })
    expect(eventPublisher.publishNotice).toHaveBeenCalledWith(expect.objectContaining({ noticeType: 'friend-add' }))
  })

  it('should handle recall', () => {
    bridgeQQEvents(1, qqClient, eventPublisher, log, instance)
    const onRecall = qqClient.on.mock.calls.find((c: any) => c[0] === 'recall')[1]

    // Friend recall
    onRecall({ chatId: '123', operatorId: '123' })
    expect(eventPublisher.publishNotice).toHaveBeenCalledWith(expect.objectContaining({ noticeType: 'friend-recall' }))

    // Group recall
    eventPublisher.publishNotice.mockClear()
    onRecall({ chatId: '123', operatorId: '456' })
    expect(eventPublisher.publishNotice).toHaveBeenCalledWith(expect.objectContaining({ noticeType: 'group-recall' }))
  })

  it('should handle poke', () => {
    bridgeQQEvents(1, qqClient, eventPublisher, log, instance)
    const onPoke = qqClient.on.mock.calls.find((c: any) => c[0] === 'poke')[1]
    onPoke('123', '456', '789')
    expect(eventPublisher.publishNotice).toHaveBeenCalledWith(expect.objectContaining({ noticeType: 'other', raw: expect.objectContaining({ type: 'poke' }) }))
  })
})
