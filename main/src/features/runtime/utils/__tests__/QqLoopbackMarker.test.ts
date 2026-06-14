import { describe, expect, it } from 'vitest'
import { hasQ2tgSkipMarker } from '../QqLoopbackMarker.js'

describe('qqLoopbackMarker', () => {
  it('returns false when segment type is unknown', () => {
    const msg = {
      metadata: {
        raw: {
          message: [{ type: 'text', data: 'hello' }],
        },
      },
    } as any
    expect(hasQ2tgSkipMarker(msg)).toBe(false)
  })

  it('handles json payload missing or invalid', () => {
    const msg = {
      metadata: {
        raw: {
          message: [
            { type: 'json', data: null },
            { type: 'mirai', data: '{invalidjson' },
          ],
        },
      },
    } as any
    expect(hasQ2tgSkipMarker(msg)).toBe(false)
  })

  it('handles nested payload skip flag in json', () => {
    const msg = {
      metadata: {
        raw: {
          message: [{
            type: 'json',
            data: { data: '{"q2tgSkip":true}' },
          }],
        },
      },
    } as any
    expect(hasQ2tgSkipMarker(msg)).toBe(true)
  })

  it('returns false for object payload without skip flag', () => {
    const msg = {
      metadata: {
        raw: {
          message: [{
            type: 'json',
            data: { some: 'value' },
          }],
        },
      },
    } as any
    expect(hasQ2tgSkipMarker(msg)).toBe(false)
  })
})
