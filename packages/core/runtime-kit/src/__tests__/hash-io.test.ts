import { describe, expect, it } from 'bun:test'
import { createHashWithRuntime, hashWithRuntime } from '../hash-io.js'

describe('runtime hash capability', () => {
  it('hashes text with Bun CryptoHasher', () => {
    expect(hashWithRuntime('md5', 'hello', 'hex')).toBe('5d41402abc4b2a76b9719d911017c592')
    expect(hashWithRuntime('sha256', 'hello', 'base64')).toBe('LPJNul+wow4m6DsqxbninhsWHlwfp0JecwQzYpOLmCQ=')
  })

  it('hashes binary input and returns bytes', () => {
    const result = hashWithRuntime('md5', new TextEncoder().encode('hello'), 'buffer')
    expect(result).toBeInstanceOf(Uint8Array)
    const hex = Array.from(result as Uint8Array, byte => byte.toString(16).padStart(2, '0')).join('')
    expect(hex).toBe('5d41402abc4b2a76b9719d911017c592')
  })

  it('supports incremental hashing for streamed input', () => {
    const hasher = createHashWithRuntime('sha256')
    hasher.update('hel')
    hasher.update(new TextEncoder().encode('lo'))
    expect(hasher.digest('hex')).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824')
  })
})
