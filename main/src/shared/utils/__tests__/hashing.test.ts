import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { md5, md5Hex, md5B64, sha256Hex, sha256B64 } from '../hashing'

describe('hashing utilities', () => {
  describe('md5()', () => {
    it('returns a Buffer digest for a string input', () => {
      const result = md5('hello')
      expect(result).toBeInstanceOf(Buffer)
      expect(result.toString('hex')).toBe('5d41402abc4b2a76b9719d911017c592')
    })

    it('returns correct digest for empty string', () => {
      const result = md5('')
      expect(result.toString('hex')).toBe('d41d8cd98f00b204e9800998ecf8427e')
    })

    it('returns correct digest for unicode input', () => {
      const result = md5('你好世界')
      expect(result.toString('hex')).toBe('65396ee4aad0b4f17aacd1c6112ee364')
    })

    it('returns correct digest for binary-like Buffer input', () => {
      const buf = Buffer.from([0x00, 0x01, 0x02, 0xff])
      const result = md5(buf)
      expect(result.toString('hex')).toBe('0416dab819887333af831f8c765ac2ae')
    })

    it('produces deterministic output (same input → same output)', () => {
      const first = md5('deterministic')
      const second = md5('deterministic')
      expect(first).toEqual(second)
    })
  })

  describe('md5Hex()', () => {
    it('returns hex string for known input', () => {
      expect(md5Hex('hello')).toBe('5d41402abc4b2a76b9719d911017c592')
    })

    it('returns correct hex for empty string', () => {
      expect(md5Hex('')).toBe('d41d8cd98f00b204e9800998ecf8427e')
    })

    it('returns correct hex for unicode input', () => {
      expect(md5Hex('你好世界')).toBe('65396ee4aad0b4f17aacd1c6112ee364')
    })

    it('returns correct hex for binary-like Buffer input', () => {
      const buf = Buffer.from([0x00, 0x01, 0x02, 0xff])
      expect(md5Hex(buf)).toBe('0416dab819887333af831f8c765ac2ae')
    })

    it('produces deterministic output', () => {
      expect(md5Hex('test')).toBe(md5Hex('test'))
    })
  })

  describe('md5B64()', () => {
    it('returns base64 string for known input', () => {
      expect(md5B64('hello')).toBe('XUFAKrxLKna5cZ2REBfFkg==')
    })

    it('returns correct base64 for empty string', () => {
      expect(md5B64('')).toBe('1B2M2Y8AsgTpgAmY7PhCfg==')
    })

    it('returns correct base64 for unicode input', () => {
      expect(md5B64('你好世界')).toBe('ZTlu5KrQtPF6rNHGES7jZA==')
    })

    it('produces deterministic output', () => {
      expect(md5B64('test')).toBe(md5B64('test'))
    })
  })

  describe('sha256Hex()', () => {
    it('returns hex string for known input', () => {
      expect(sha256Hex('hello')).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824')
    })

    it('returns correct hex for empty string', () => {
      expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    })

    it('returns correct hex for unicode input', () => {
      expect(sha256Hex('你好世界')).toBe('beca6335b20ff57ccc47403ef4d9e0b8fccb4442b3151c2e7d50050673d43172')
    })

    it('returns correct hex for binary-like Buffer input', () => {
      const buf = Buffer.from([0x00, 0x01, 0x02, 0xff])
      expect(sha256Hex(buf)).toBe('3d1f57c984978ef98a18378c8166c1cb8ede02c03eeb6aee7e2f121dfeee3e56')
    })

    it('produces deterministic output', () => {
      expect(sha256Hex('test')).toBe(sha256Hex('test'))
    })
  })

  describe('sha256B64()', () => {
    it('returns base64 string for known input', () => {
      expect(sha256B64('hello')).toBe('LPJNul+wow4m6DsqxbninhsWHlwfp0JecwQzYpOLmCQ=')
    })

    it('returns correct base64 for empty string', () => {
      expect(sha256B64('')).toBe('47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=')
    })

    it('returns correct base64 for unicode input', () => {
      expect(sha256B64('你好世界')).toBe('vspjNbIP9XzMR0A+9NnguPzLREKzFRwufVAFBnPUMXI=')
    })

    it('produces deterministic output', () => {
      expect(sha256B64('test')).toBe(sha256B64('test'))
    })
  })
})

/**
 * Property 2: Hash Determinism
 * Validates: Requirements 6.3
 *
 * For any input string s, calling a hash function twice with the same input
 * SHALL produce identical output.
 */
describe('Property 2: Hash Determinism', () => {
  it('md5() produces identical output for the same arbitrary string', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const first = md5(s)
        const second = md5(s)
        expect(first).toEqual(second)
      }),
    )
  })

  it('md5() produces identical output for the same arbitrary unicode string', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[\u0000-\uffff]{0,20}$/), (s) => {
        const first = md5(s)
        const second = md5(s)
        expect(first).toEqual(second)
      }),
    )
  })

  it('md5Hex() produces identical output for the same arbitrary string', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        expect(md5Hex(s)).toBe(md5Hex(s))
      }),
    )
  })

  it('md5Hex() produces identical output for the same arbitrary unicode string', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[\u0000-\uffff]{0,20}$/), (s) => {
        expect(md5Hex(s)).toBe(md5Hex(s))
      }),
    )
  })

  it('md5B64() produces identical output for the same arbitrary string', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        expect(md5B64(s)).toBe(md5B64(s))
      }),
    )
  })

  it('md5B64() produces identical output for the same arbitrary unicode string', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[\u0000-\uffff]{0,20}$/), (s) => {
        expect(md5B64(s)).toBe(md5B64(s))
      }),
    )
  })

  it('sha256Hex() produces identical output for the same arbitrary string', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        expect(sha256Hex(s)).toBe(sha256Hex(s))
      }),
    )
  })

  it('sha256Hex() produces identical output for the same arbitrary unicode string', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[\u0000-\uffff]{0,20}$/), (s) => {
        expect(sha256Hex(s)).toBe(sha256Hex(s))
      }),
    )
  })

  it('sha256B64() produces identical output for the same arbitrary string', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        expect(sha256B64(s)).toBe(sha256B64(s))
      }),
    )
  })

  it('sha256B64() produces identical output for the same arbitrary unicode string', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[\u0000-\uffff]{0,20}$/), (s) => {
        expect(sha256B64(s)).toBe(sha256B64(s))
      }),
    )
  })
})
