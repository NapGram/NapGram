export function normalizeTelegramChatId(chatId: string | number | bigint): string | number {
  if (typeof chatId === 'bigint')
    return Number(chatId)

  if (typeof chatId === 'string' && /^-?\d+$/.test(chatId))
    return Number(chatId)

  return chatId
}

export function normalizeTelegramMessageId(value: unknown): number | undefined {
  if (value === undefined || value === null)
    return undefined

  const normalized = Number(value)
  if (!Number.isFinite(normalized) || normalized <= 0)
    return undefined

  return normalized
}

export function buildTelegramTextSendParams(replyTo?: unknown): { linkPreview: { disable: true }, replyTo?: number } {
  const params: { linkPreview: { disable: true }, replyTo?: number } = {
    linkPreview: { disable: true },
  }

  return applyTelegramReplyTo(params, replyTo)
}

export function applyTelegramReplyTo<T extends object>(params: T, replyTo?: unknown): T & { replyTo?: number } {
  const target = params as T & { replyTo?: number }
  const normalizedReplyTo = normalizeTelegramMessageId(replyTo)
  if (normalizedReplyTo)
    target.replyTo = normalizedReplyTo
  else
    delete target.replyTo

  return target
}
