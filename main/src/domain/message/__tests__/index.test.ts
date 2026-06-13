import { describe, expect, it, vi } from 'vitest'
import * as message from '@napgram/message-kit'

vi.mock('@napgram/message-kit', () => ({
  MessageConverter: class MessageConverter {},
  messageConverter: { mocked: true },
}))

describe('message index', () => {
  it('re-exports converter API', () => {
    expect(typeof message.MessageConverter).toBe('function')
    expect(message.messageConverter).toBeTruthy()
  })
})
