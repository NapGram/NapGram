import { describe, expect, it } from 'vitest'
import {
  applyTelegramReplyTo,
  buildTelegramTextSendParams,
  normalizeTelegramChatId,
  normalizeTelegramMessageId,
} from '../telegramSend'

describe('telegramSend utils', () => {
  it('normalizes telegram chat ids', () => {
    expect(normalizeTelegramChatId(-100123n)).toBe(-100123)
    expect(normalizeTelegramChatId('-100456')).toBe(-100456)
    expect(normalizeTelegramChatId('username')).toBe('username')
    expect(normalizeTelegramChatId(123)).toBe(123)
  })

  it('normalizes positive telegram message ids', () => {
    expect(normalizeTelegramMessageId(1)).toBe(1)
    expect(normalizeTelegramMessageId(2n)).toBe(2)
    expect(normalizeTelegramMessageId('3')).toBe(3)
    expect(normalizeTelegramMessageId(0)).toBeUndefined()
    expect(normalizeTelegramMessageId('abc')).toBeUndefined()
  })

  it('builds common text send params', () => {
    expect(buildTelegramTextSendParams()).toEqual({
      linkPreview: { disable: true },
    })
    expect(buildTelegramTextSendParams(42n)).toEqual({
      linkPreview: { disable: true },
      replyTo: 42,
    })
  })

  it('applies replyTo only for positive ids', () => {
    expect(applyTelegramReplyTo({ foo: 'bar' } as any, 12n)).toEqual({
      foo: 'bar',
      replyTo: 12,
    })
    expect(applyTelegramReplyTo({ replyTo: 5 }, 0)).toEqual({})
  })
})
