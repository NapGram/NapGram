import { describe, expect, it, vi } from 'vitest'
import * as message from '../index'

vi.mock('@napgram/message-kit', () => ({
  MessageConverter: class MessageConverter {},
  messageConverter: { mocked: true },
}))

describe('message index', () => {
  it('re-exports converter API', () => {
    expect(typeof message.MessageConverter).toBe('function')
    expect(message.messageConverter).toBeTruthy()
    expect((message as any).__coverage_anchor__).toBe(true)
  })
})
