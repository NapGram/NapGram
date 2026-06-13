import type { PluginLogger } from './interfaces-api.js'
import type {
  PluginInstancePersonalModeDiagnostics,
  PluginInstanceResolver,
  PluginInstancesResolver,
  PluginQqClientLike,
  PluginQqMessageContent,
  PluginQqMessageLike,
  PluginQqSendReceipt,
  PluginRuntimeInstance,
  PluginTgBotLike,
  PluginTgChatLike,
  PluginUserBotStatus,
} from '@napgram/runtime-kit'

export interface EventSubscription {
  unsubscribe: () => void
}

export interface MessageEvent {
  eventId: string
  instanceId: number
  platform: 'qq' | 'tg'
  channelId: string
  channelRef?: string
  channelType: 'group' | 'private' | 'channel'
  threadId?: number
  qq?: any
  tg?: any
  instance?: any
  sender: {
    userId: string
    userName: string
    userNick?: string
    isAdmin?: boolean
    isOwner?: boolean
  }
  message: {
    id: string
    ref?: string
    text: string
    segments: MessageSegment[]
    timestamp: number
    quote?: {
      id: string
      userId: string
      text: string
    }
  }
  raw: any
  logger?: PluginLogger
  reply: (content: string | MessageSegment[]) => Promise<SendMessageResult>
  send: (content: string | MessageSegment[]) => Promise<SendMessageResult>
  recall: () => Promise<void>
}

export interface SendMessageResult {
  messageId: string
  timestamp: number
}

export interface FriendRequestEvent {
  eventId: string
  instanceId: number
  platform: 'qq' | 'tg'
  requestId: string
  userId: string
  userName: string
  comment?: string
  timestamp: number
  approve: () => Promise<void>
  reject: (reason?: string) => Promise<void>
}

export interface GroupRequestEvent {
  eventId: string
  instanceId: number
  platform: 'qq' | 'tg'
  requestId: string
  groupId: string
  userId: string
  userName: string
  comment?: string
  subType?: 'add' | 'invite'
  timestamp: number
  approve: () => Promise<void>
  reject: (reason?: string) => Promise<void>
}

export interface NoticeEvent {
  eventId: string
  instanceId: number
  platform: 'qq' | 'tg'
  noticeType: NoticeType
  groupId?: string
  userId?: string
  operatorId?: string
  duration?: number
  timestamp: number
  raw: any
}

export type NoticeType
  = | 'group-member-increase'
  | 'group-member-decrease'
  | 'group-admin'
  | 'group-ban'
  | 'group-recall'
  | 'friend-add'
  | 'friend-recall'
  | 'connection-lost'
  | 'connection-restored'
  | 'other'

export interface InstanceStatusEvent {
  instanceId: number
  status: InstanceStatus
  error?: Error
  timestamp: number
}

export type InstanceStatus = 'starting' | 'running' | 'stopping' | 'stopped' | 'error'

export interface PluginReloadEvent {
  pluginId: string
  timestamp: number
}

export type MessageSegment
  = | TextSegment
  | AtSegment
  | ReplySegment
  | ImageSegment
  | VideoSegment
  | AudioSegment
  | FileSegment
  | ForwardSegment
  | FaceSegment
  | RawSegment

export interface TextSegment {
  type: 'text'
  data: {
    text: string
  }
}

export interface AtSegment {
  type: 'at'
  data: {
    userId: string
    userName?: string
  }
}

export interface ReplySegment {
  type: 'reply'
  data: {
    messageId: string
    senderId?: string
    userId?: string
  }
}

export interface ImageSegment {
  type: 'image'
  data: {
    url?: string
    file?: string
    base64?: string
  }
}

export interface VideoSegment {
  type: 'video'
  data: {
    url?: string
    file?: string
  }
}

export interface AudioSegment {
  type: 'audio'
  data: {
    url?: string
    file?: string
  }
}

export interface FaceSegment {
  type: 'face'
  data: {
    id: string
    text?: string
  }
}

export interface FileSegment {
  type: 'file'
  data: {
    url?: string
    file?: string
    name?: string
  }
}

export interface ForwardSegment {
  type: 'forward'
  data: {
    messages: ForwardMessage[]
  }
}

export interface ForwardMessage {
  userId: string
  userName: string
  segments: MessageSegment[]
}

export interface RawSegment {
  type: 'raw'
  data: {
    platform: 'qq' | 'tg'
    content: any
  }
}

export type {
  PluginInstancePersonalModeDiagnostics,
  PluginInstanceResolver,
  PluginInstancesResolver,
  PluginQqClientLike,
  PluginQqMessageContent,
  PluginQqMessageLike,
  PluginQqSendReceipt,
  PluginRuntimeInstance,
  PluginTgBotLike,
  PluginTgChatLike,
  PluginUserBotStatus,
}

export type MessageEventHandler = (event: MessageEvent) => void | Promise<void>
export type FriendRequestEventHandler = (event: FriendRequestEvent) => void | Promise<void>
export type GroupRequestEventHandler = (event: GroupRequestEvent) => void | Promise<void>
export type NoticeEventHandler = (event: NoticeEvent) => void | Promise<void>
export type InstanceStatusEventHandler = (event: InstanceStatusEvent) => void | Promise<void>
export type PluginReloadEventHandler = (event: PluginReloadEvent) => void | Promise<void>
