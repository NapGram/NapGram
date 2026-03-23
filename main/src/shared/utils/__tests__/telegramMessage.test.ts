import { describe, expect, it } from 'vitest'
import {
  getTelegramMessageId,
  getTelegramReply,
  getTelegramReplyMessageId,
  getTelegramReplySenderId,
  getTelegramThreadId,
  hasTelegramReply,
} from '../telegramMessage'

describe('telegramMessage utils', () => {
  it('extracts telegram message id from supported fields', () => {
    expect(getTelegramMessageId({ id: 1 })).toBe(1)
    expect(getTelegramMessageId({ messageId: 2 })).toBe(2)
    expect(getTelegramMessageId({ msgId: 3 })).toBe(3)
    expect(getTelegramMessageId({})).toBeUndefined()
  })

  it('extracts reply object and sender id', () => {
    expect(getTelegramReply({ replyToMessage: { id: 1, senderId: 42 } })).toEqual({ id: 1, senderId: 42 })
    expect(getTelegramReply({ replyTo: { replyToMsgId: 7, senderId: 9 } })).toEqual({ replyToMsgId: 7, senderId: 9 })
    expect(getTelegramReplySenderId({ replyToMessage: { senderId: 123 } })).toBe('123')
    expect(getTelegramReplySenderId({})).toBeUndefined()
  })

  it('extracts reply and thread ids from mtcute-shaped raw messages', () => {
    expect(getTelegramReplyMessageId({ replyTo: { replyToMsgId: 99 } })).toBe(99n)
    expect(getTelegramReplyMessageId({ replyToMessage: { id: 100 } })).toBe(100n)
    expect(getTelegramThreadId({ replyTo: { replyToTopId: 200 } })).toBe(200n)
    expect(getTelegramThreadId({ topicId: 201 })).toBe(201n)
    expect(getTelegramThreadId({ raw: { replyTo: { topicId: 202 } } })).toBe(202n)
  })

  it('detects reply semantics and can exclude forum topic context', () => {
    expect(hasTelegramReply({ replyTo: { replyToMsgId: 1 } })).toBe(true)
    expect(hasTelegramReply({ replyToMessage: { id: 2, sender: { id: 1 } } })).toBe(true)
    expect(hasTelegramReply({ replyToMessage: { id: 3, isForumTopic: true } })).toBe(true)
    expect(hasTelegramReply({ replyToMessage: { id: 3, isForumTopic: true } }, { excludeForumTopicContext: true })).toBe(false)
  })
})
