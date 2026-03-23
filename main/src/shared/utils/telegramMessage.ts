export function getTelegramMessageId(raw: any): number | undefined {
  if (!raw)
    return undefined

  const candidates = [
    raw.id,
    raw.messageId,
    raw.msgId,
  ]

  for (const candidate of candidates) {
    if (typeof candidate === 'number' && candidate > 0)
      return candidate
  }

  return undefined
}

export function getTelegramReply(raw: any): any | undefined {
  if (!raw)
    return undefined

  if (raw.replyToMessage)
    return raw.replyToMessage

  if (raw.replyTo && typeof raw.replyTo === 'object')
    return raw.replyTo

  return undefined
}

export function getTelegramReplySenderId(raw: any): string | undefined {
  const reply = getTelegramReply(raw)
  if (!reply?.senderId)
    return undefined

  return String(reply.senderId)
}

export function getTelegramReplyMessageId(raw: any): bigint | undefined {
  if (!raw)
    return undefined

  const candidates = [
    raw?.replyTo?.replyToMsgId,
    raw?.replyTo?.id,
    raw?.replyTo?.replyToTopId,
    raw?.replyToMessage?.id,
  ]

  for (const candidate of candidates) {
    if ((typeof candidate === 'number' || typeof candidate === 'bigint') && Number(candidate) > 0)
      return BigInt(candidate)
  }

  return undefined
}

export function getTelegramThreadId(raw: any): bigint | undefined {
  if (!raw)
    return undefined

  const replyTo = raw.replyTo
  const candidates = [
    replyTo?.replyToTopId,
    raw.replyToTopId,
    replyTo?.forumTopicId,
    replyTo?.topicId,
    replyTo?.replyToTopicId,
    replyTo?.replyToMsgId,
    raw.replyToMsgId,
    raw.topicId,
    raw.forumTopicId,
    raw.threadId,
    raw.replyToThreadId,
    raw.replyToTopMsgId,
    raw.messageThreadId,
  ]

  if (raw.raw) {
    const tlReplyTo = raw.raw.replyTo
    candidates.push(
      tlReplyTo?.replyToTopId,
      tlReplyTo?.replyToMsgId,
      tlReplyTo?.forumTopicId,
      tlReplyTo?.topicId,
      raw.raw.replyToTopId,
      raw.raw.topicId,
      raw.raw.messageThreadId,
    )
  }

  for (const candidate of candidates) {
    if ((typeof candidate === 'number' || typeof candidate === 'bigint') && Number(candidate) > 0)
      return BigInt(candidate)
  }

  return undefined
}

export function hasTelegramReply(raw: any, options: { excludeForumTopicContext?: boolean } = {}): boolean {
  if (!raw)
    return false

  if (raw.replyToMessage?.id) {
    if (options.excludeForumTopicContext && raw.replyToMessage.isForumTopic) {
      return false
    }

    if (!options.excludeForumTopicContext || raw.replyToMessage.sender || raw.replyToMessage.chat) {
      return true
    }
  }

  return Boolean(raw.replyTo?.replyToMsgId)
}
