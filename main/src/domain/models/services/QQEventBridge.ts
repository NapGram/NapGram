import type { AppLogger } from '@napgram/logger-kit'
import type { IQQClient } from '../../../infrastructure/clients/qq'

interface EventPublisher {
  publishFriendRequest: (event: any) => void
  publishGroupRequest: (event: any) => void
  publishNotice: (event: any) => void
}

interface WorkModeAware {
  hasConfiguredWorkMode: () => boolean
}

/**
 * QQ 客户端事件 → 插件 EventBus 桥接器。
 * 将 NapCat SDK 的原始事件规范化后转发给 NapGram 插件系统。
 * 仅在实例已配置工作模式时才转发事件。
 */
export function bridgeQQEvents(
  instanceId: number,
  qqClient: IQQClient,
  eventPublisher: EventPublisher,
  log: AppLogger,
  instance?: WorkModeAware,
): void {
  (qqClient as any).on('request.friend', async (e: any) => {
    if (instance && !instance.hasConfiguredWorkMode())
      return
    const requestId = String(e?.flag ?? '')
    if (!requestId)
      return
    const userId = String(e?.userId ?? '')
    const userName = String(e?.userName || userId || 'Unknown')
    eventPublisher.publishFriendRequest({
      instanceId,
      platform: 'qq',
      requestId,
      userId,
      userName,
      comment: typeof e?.comment === 'string' ? e.comment : undefined,
      timestamp: typeof e?.timestamp === 'number' ? e.timestamp : Date.now(),
      approve: async () => {
        if (typeof (qqClient as any).handleFriendRequest !== 'function') {
          throw new TypeError('QQ client does not support handleFriendRequest()')
        }
        await (qqClient as any).handleFriendRequest(requestId, true)
      },
      reject: async (reason?: string) => {
        if (typeof (qqClient as any).handleFriendRequest !== 'function') {
          throw new TypeError('QQ client does not support handleFriendRequest()')
        }
        await (qqClient as any).handleFriendRequest(requestId, false, reason)
      },
    })
  });

  (qqClient as any).on('request.group', async (e: any) => {
    if (instance && !instance.hasConfiguredWorkMode())
      return
    const requestId = String(e?.flag ?? '')
    if (!requestId)
      return
    const groupId = String(e?.groupId ?? '')
    const userId = String(e?.userId ?? '')
    const userName = String(e?.userName || userId || 'Unknown')
    const subType = (e?.subType === 'invite' ? 'invite' : 'add') as 'add' | 'invite'
    eventPublisher.publishGroupRequest({
      instanceId,
      platform: 'qq',
      requestId,
      groupId,
      userId,
      userName,
      comment: typeof e?.comment === 'string' ? e.comment : undefined,
      subType,
      timestamp: typeof e?.timestamp === 'number' ? e.timestamp : Date.now(),
      approve: async () => {
        if (typeof (qqClient as any).handleGroupRequest !== 'function') {
          throw new TypeError('QQ client does not support handleGroupRequest()')
        }
        await (qqClient as any).handleGroupRequest(requestId, subType, true)
      },
      reject: async (reason?: string) => {
        if (typeof (qqClient as any).handleGroupRequest !== 'function') {
          throw new TypeError('QQ client does not support handleGroupRequest()')
        }
        await (qqClient as any).handleGroupRequest(requestId, subType, false, reason)
      },
    })
  })

  qqClient.on('group.increase', (groupId: string, member: any) => {
    if (instance && !instance.hasConfiguredWorkMode())
      return
    eventPublisher.publishNotice({
      instanceId,
      platform: 'qq',
      noticeType: 'group-member-increase',
      groupId: String(groupId),
      userId: String(member?.id ?? ''),
      timestamp: Date.now(),
      raw: { groupId, member },
    })
  })

  qqClient.on('group.decrease', (groupId: string, uin: string) => {
    if (instance && !instance.hasConfiguredWorkMode())
      return
    eventPublisher.publishNotice({
      instanceId,
      platform: 'qq',
      noticeType: 'group-member-decrease',
      groupId: String(groupId),
      userId: String(uin),
      timestamp: Date.now(),
      raw: { groupId, uin },
    })
  })

  qqClient.on('friend.increase', (friend: any) => {
    if (instance && !instance.hasConfiguredWorkMode())
      return
    eventPublisher.publishNotice({
      instanceId,
      platform: 'qq',
      noticeType: 'friend-add',
      userId: String(friend?.id ?? ''),
      timestamp: Date.now(),
      raw: friend,
    })
  })

  qqClient.on('recall', (evt: any) => {
    if (instance && !instance.hasConfiguredWorkMode())
      return
    const chatId = String(evt?.chatId ?? '')
    const operatorId = String(evt?.operatorId ?? '')
    const noticeType = chatId && operatorId && chatId === operatorId ? 'friend-recall' : 'group-recall'
    eventPublisher.publishNotice({
      instanceId,
      platform: 'qq',
      noticeType,
      groupId: noticeType === 'group-recall' ? chatId : undefined,
      userId: noticeType === 'friend-recall' ? chatId : undefined,
      operatorId: operatorId || undefined,
      timestamp: typeof evt?.timestamp === 'number' ? evt.timestamp : Date.now(),
      raw: evt,
    })
  })

  qqClient.on('poke', (chatId: string, operatorId: string, targetId: string) => {
    if (instance && !instance.hasConfiguredWorkMode())
      return
    eventPublisher.publishNotice({
      instanceId,
      platform: 'qq',
      noticeType: 'other',
      groupId: String(chatId),
      userId: String(targetId),
      operatorId: String(operatorId),
      timestamp: Date.now(),
      raw: { type: 'poke', chatId, operatorId, targetId },
    })
  })

  log.debug('QQ event bridge initialized')
}
