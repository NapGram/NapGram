import type { MessageEvent } from '@naplink/naplink'
import type { NapLink } from '@naplink/naplink'
import type { LoggerLike } from './deps.js'
import type { RecallEvent } from './message.js'
import { getQQClientDependencies } from './deps.js'
import { normalizeMediaIds } from './napcatReceipt.js'

function getMessageConverter() {
  return getQQClientDependencies().messageConverter
}

/**
 * Dependencies the event bridge needs from the owning adapter.
 */
export interface NapCatEventBridgeDeps {
  client: NapLink
  logger: LoggerLike
  /** Emit a normalized event on the adapter's EventEmitter surface. */
  emit: (event: string, ...args: any[]) => void
  /** Refresh cached self info (uin/nickname) after (re)connect. */
  refreshSelfInfo: () => void
}

/**
 * Wire NapLink client events to the adapter's normalized event surface.
 *
 * Extracted from NapCatAdapter so the adapter body stays focused on the
 * request/response API surface; the translation of raw NapCat notices into
 * NapGram's unified events lives here.
 */
export function setupNapCatEvents(deps: NapCatEventBridgeDeps): void {
  const { client, logger, emit, refreshSelfInfo } = deps

  client.on('connect', () => {
    emit('online')
    refreshSelfInfo()
  })

  client.on('disconnect', () => {
    emit('offline')
  })

  client.on('connection:lost', (data: any) => {
    const timestamp = typeof data?.timestamp === 'number' ? data.timestamp : Date.now()
    const attempts = typeof data?.attempts === 'number' ? data.attempts : undefined
    const reason = attempts ? `Reconnect attempts exceeded (${attempts})` : 'Connection lost'
    emit('connection:lost', { timestamp, reason })
  })

  client.on('connection:restored', (data: any) => {
    const timestamp = typeof data?.timestamp === 'number' ? data.timestamp : Date.now()
    emit('connection:restored', { timestamp })
  })

  client.on('message', async (data: MessageEvent) => {
    try {
      const messageConverter = getMessageConverter()
      normalizeMediaIds(data.message)
      await client.hydrateMessage(data.message)
      const unifiedMsg = messageConverter.fromNapCat(data)
      emit('message', unifiedMsg)
    }
    catch (err) {
      logger.error('Failed to handle message event:', err)
    }
  })

  client.on('notice.group_recall', (data: any) => {
    emit('recall', {
      messageId: String(data.message_id),
      chatId: String(data.group_id),
      chatType: 'group',
      operatorId: String(data.operator_id),
      timestamp: data.time * 1000,
    } as RecallEvent)
  })

  client.on('notice.friend_recall', (data: any) => {
    emit('recall', {
      messageId: String(data.message_id),
      chatId: String(data.user_id),
      chatType: 'private',
      operatorId: String(data.user_id),
      timestamp: data.time * 1000,
    } as RecallEvent)
  })

  client.on('notice.group_increase', (data: any) => {
    emit('group.increase', String(data.group_id), {
      id: String(data.user_id),
      name: '',
    })
  })

  client.on('notice.group_decrease', (data: any) => {
    emit('group.decrease', String(data.group_id), String(data.user_id))
  })

  client.on('notice.friend_add', (data: any) => {
    emit('friend.increase', {
      id: String(data.user_id),
      name: '',
    })
  })

  const emitFriendDecrease = (data: any) => {
    emit('friend.decrease', String(data.user_id))
  }
  client.on('notice.friend_decrease', emitFriendDecrease)
  client.on('notice.friend_delete', emitFriendDecrease)
  client.on('notice.friend_del', emitFriendDecrease)

  const emitInputStatus = (data: any) => {
    const chatType = data.group_id !== undefined && data.group_id !== null ? 'group' : 'private'
    const chatId = String(chatType === 'group' ? data.group_id : data.user_id)
    emit('input.status', {
      chatId,
      chatType,
      userId: String(data.user_id ?? data.sender_id ?? ''),
      typing: Boolean(data.status_text || data.status === 1 || data.typing === true || data.input_status === 1),
      raw: data,
    })
  }
  client.on('notice.notify.input_status', emitInputStatus)
  client.on('notice.input_status', emitInputStatus)

  client.on('notice.notify.poke', (data: any) => {
    emit('poke', String(data.group_id || data.user_id), String(data.user_id), String(data.target_id))
  })

  client.on('request.friend', (data: any) => {
    emit('request.friend', {
      flag: data.flag,
      userId: String(data.user_id),
      comment: data.comment || '',
      timestamp: data.time * 1000,
    })
  })

  client.on('request.group', (data: any) => {
    emit('request.group', {
      flag: data.flag,
      groupId: String(data.group_id),
      userId: String(data.user_id),
      subType: data.sub_type,
      comment: data.comment || '',
      timestamp: data.time * 1000,
    })
  })

  client.on('notice.notify.gray_tip', (data: any) => {
    emit('gray_tip', {
      groupId: String(data.group_id),
      content: data.content,
      busiId: String(data.busi_id),
      messageId: String(data.message_id),
      timestamp: Date.now(),
    })
  })
}
