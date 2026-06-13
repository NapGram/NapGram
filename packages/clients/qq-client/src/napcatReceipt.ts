import type { MessageReceipt } from './message.js'

/**
 * Pure helpers for parsing NapCat API results into normalized receipts and for
 * normalizing media identifiers. Extracted from NapCatAdapter to keep the
 * adapter focused on protocol wiring.
 */

export function pickFirstDefined(...values: any[]) {
  return values.find(value => value !== undefined && value !== null && value !== '')
}

export function unwrapApiResult(result: any) {
  return result?.data && typeof result.data === 'object'
    ? result.data
    : result
}

/**
 * Normalize media identifiers in-place: NapCat sometimes returns `file_id`/`file`
 * prefixed with a leading slash for short ids; strip it unless the value looks
 * like a local absolute path (contains further slashes).
 */
export function normalizeMediaIds(message: any) {
  const segments = Array.isArray(message) ? message : []
  for (const segment of segments) {
    const data = segment?.data
    if (!data || typeof data !== 'object')
      continue

    for (const key of ['file_id', 'file'] as const) {
      const value = (data as any)[key]
      if (typeof value !== 'string')
        continue
      if (!value.startsWith('/'))
        continue

      const rest = value.slice(1)
      if (rest.includes('/'))
        continue // likely a local absolute path

      ;(data as any)[key] = rest
    }
  }
}

/**
 * Build a normalized {@link MessageReceipt} from a raw send result and an optional
 * enriched message fetched afterwards.
 */
export function buildReceipt(result: any, fetchedRaw?: any): MessageReceipt {
  const rawResult = unwrapApiResult(result) || {}
  const rawMessage = fetchedRaw || {}
  const raw = fetchedRaw ? { ...rawResult, ...rawMessage, send: rawResult, fetched: rawMessage } : rawResult
  const messageId = String(pickFirstDefined(rawResult.message_id, rawResult.messageId, rawResult.id, rawMessage.message_id, rawMessage.messageId, rawMessage.id) ?? '')
  const seq = Number(pickFirstDefined(rawResult.seq, rawResult.message_seq, rawMessage.seq, rawMessage.message_seq, rawResult.message_id, rawResult.messageId, rawResult.id, rawMessage.message_id, rawMessage.messageId, rawMessage.id, 0))
  const time = Number(pickFirstDefined(rawResult.time, rawMessage.time, 0))
  const pktnum = Number(pickFirstDefined(rawResult.pktnum, rawResult.pktNum, rawMessage.pktnum, rawMessage.pktNum, 0))
  const senderId = pickFirstDefined(rawResult.sender_id, rawResult.user_id, rawMessage.sender_id, rawMessage.user_id, rawMessage.sender?.user_id)

  return {
    messageId,
    timestamp: Date.now(),
    success: true,
    seq,
    rand: pickFirstDefined(rawResult.rand, rawMessage.rand),
    time: time || undefined,
    pktnum: pktnum || undefined,
    senderId: senderId !== undefined ? String(senderId) : undefined,
    raw,
  }
}
