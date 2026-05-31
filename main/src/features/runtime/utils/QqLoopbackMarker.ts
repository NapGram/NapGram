import type { UnifiedMessage } from '@napgram/message-kit'

function parseMarkerPayload(value: unknown): any {
  if (!value)
    return undefined
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    }
    catch {
      return undefined
    }
  }
  if (typeof value === 'object')
    return value
  return undefined
}

function hasSkipFlag(payload: any): boolean {
  if (!payload || typeof payload !== 'object')
    return false
  if (payload.q2tgSkip === true)
    return true
  if (payload.data && hasSkipFlag(parseMarkerPayload(payload.data)))
    return true
  return false
}

function getRawSegments(msg: UnifiedMessage): any[] {
  const raw = (msg.metadata as any)?.raw
  const candidates = [
    raw?.message,
    raw?.raw?.message,
    raw?.data?.message,
  ]

  return candidates.find(Array.isArray) || []
}

export function hasQ2tgSkipMarker(msg: UnifiedMessage): boolean {
  for (const segment of getRawSegments(msg)) {
    const type = String(segment?.type || '')
    if (type !== 'mirai' && type !== 'json')
      continue

    const data = segment?.data
    const payload = parseMarkerPayload(
      typeof data === 'string'
        ? data
        : data?.data ?? data,
    )

    if (hasSkipFlag(payload))
      return true
  }

  return false
}
