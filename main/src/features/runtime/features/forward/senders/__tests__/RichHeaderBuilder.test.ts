import { describe, expect, it, vi } from 'vitest'
import { RichHeaderBuilder } from '../RichHeaderBuilder.js'

vi.mock('@napgram/env-kit', async importOriginal => ({
  ...(await importOriginal() as any),
  env: {
    ENABLE_AUTO_RECALL: true,
    TG_MEDIA_TTL_SECONDS: undefined,
    DATA_DIR: '/tmp',
    CACHE_DIR: '/tmp/cache',
    WEB_ENDPOINT: 'http://napgram-dev:8080',
  },
}))

vi.mock('../../../capabilities/hashing.js', () => ({
  md5Hex: vi.fn((value: string) => value),
}))

describe('richHeaderBuilder', () => {
  const builder = new RichHeaderBuilder()

  describe('generateRichHeaderUrl', () => {
    it('generates URL with hash and version', () => {
      const url = builder.generateRichHeaderUrl('api-key-123', 'user-456', 'Test Header')

      expect(url).toContain('/richHeader/api-key-123/user-456')
      expect(url).toContain('hash=')
      expect(url).toContain('v=2')
    })

    it('generates URL without hash when messageHeader is empty', () => {
      const url = builder.generateRichHeaderUrl('api-key', 'user', '')

      expect(url).toContain('/richHeader/api-key/user')
      expect(url).toContain('v=2')
      expect(url).not.toContain('hash=')
    })
  })

  describe('applyRichHeader', () => {
    it('handles newline escape sequences', () => {
      const result = builder.applyRichHeader('Line1\\nLine2\\nLine3')

      expect(result.text).toContain('Line1\nLine2\nLine3')
    })
  })

  describe('buildReplyTo', () => {
    it('returns replyToMsgId when provided', () => {
      const result = builder.buildReplyTo({ tgThreadId: 100 }, 200)

      expect(result).toBe(200)
    })

    it('falls back to tgThreadId when replyToMsgId is not provided', () => {
      const result = builder.buildReplyTo({ tgThreadId: 100 })

      expect(result).toBe(100)
    })

    it('normalizes bigint tgThreadId to number', () => {
      const result = builder.buildReplyTo({ tgThreadId: 363n })

      expect(result).toBe(363)
    })

    it('returns undefined when no IDs are provided', () => {
      const result = builder.buildReplyTo({})

      expect(result).toBeUndefined()
    })

    it('returns undefined when pair is undefined', () => {
      const result = builder.buildReplyTo(undefined, undefined)

      expect(result).toBeUndefined()
    })
  })

  describe('escapeHtml', () => {
    it('escapes HTML special characters', () => {
      const result = builder.escapeHtml('<div class="test">Hello & "Goodbye"</div>')

      expect(result).toContain('&lt;')
      expect(result).toContain('&gt;')
      expect(result).toContain('&amp;')
      expect(result).toContain('&quot;')
    })

    it('escapes single quotes', () => {
      const result = builder.escapeHtml('It\'s a test')

      expect(result).toContain('&#039;')
    })

    it('returns unchanged text when no special characters', () => {
      const result = builder.escapeHtml('Plain text')

      expect(result).toBe('Plain text')
    })
  })
})
