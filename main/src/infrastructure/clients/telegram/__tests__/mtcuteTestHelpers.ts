import { MockMessage } from './mtcuteTestMocks'

export function createMockChat(id: number, title = `Test Chat ${id}`): any {
  return { id, title }
}

export function createMockMessage(
  id: number,
  options: { chatId?: number, media?: unknown } = {},
): any {
  const payload: Record<string, unknown> = { id }
  if (options.chatId !== undefined)
    payload.chat = createMockChat(options.chatId)
  if (options.media !== undefined)
    payload.media = options.media
  return new MockMessage(payload)
}
