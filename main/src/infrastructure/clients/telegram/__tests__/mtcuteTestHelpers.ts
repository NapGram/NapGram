import type { Chat } from '@mtcute/core'
import { Message } from '@mtcute/core'
import { createStub } from '@mtcute/test'

export function createMockChat(id: number, title = `Test Chat ${id}`): Chat {
  return createStub('channel', {
    id,
    title,
  }) as unknown as Chat
}

export function createMockMessage(
  id: number,
  options: {
    chatId?: number
    media?: unknown
  } = {},
) {
  const payload: Record<string, unknown> = { id }

  if (options.chatId !== undefined) {
    payload.chat = createMockChat(options.chatId)
  }

  if (options.media !== undefined) {
    payload.media = options.media
  }

  const MessageCtor = Message as any
  return new MessageCtor(payload as any)
}
