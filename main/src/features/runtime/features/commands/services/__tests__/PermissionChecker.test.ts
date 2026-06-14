import { beforeEach, describe, expect, it, vi } from 'vitest'
import { env } from '@napgram/env-kit'

import { CommandAccessChecker } from '../CommandAccessChecker.js'

const envKitMocks = vi.hoisted(() => {
  const env = {
    ENABLE_AUTO_RECALL: true,
    TG_MEDIA_TTL_SECONDS: undefined,
    DATA_DIR: '/tmp',
    CACHE_DIR: '/tmp/cache',
    WEB_ENDPOINT: 'http://napgram-dev:8080',
    ADMIN_QQ: undefined as number | string | null | undefined,
    ADMIN_TG: undefined as number | string | null | undefined,
  }

  return {
    env,
    getSystemOwners: () => ({
      qq: env.ADMIN_QQ,
      tg: env.ADMIN_TG,
    }),
  }
})

vi.mock('@napgram/env-kit', async importOriginal => ({
  ...(await importOriginal() as any),
  env: envKitMocks.env,
  getSystemOwners: envKitMocks.getSystemOwners,
  normalizeUserIdentity: (value: unknown) => String(value ?? '').trim().replace(/^(?:tg|qq):u:/i, ''),
  isConfiguredIdentity: (value: unknown) => value !== undefined && value !== null && String(value).trim() !== '',
  matchesUserIdentity: (userId: string, identity: unknown) => {
    const normalize = (value: unknown) => String(value ?? '').trim().replace(/^(?:tg|qq):u:/i, '')
    return String(userId ?? '') !== '' && normalize(userId) === normalize(identity)
  },
  matchesAnyIdentity: (userId: string, identities: unknown[]) => {
    const normalize = (value: unknown) => String(value ?? '').trim().replace(/^(?:tg|qq):u:/i, '')
    return String(userId ?? '') !== '' && identities.some(identity => normalize(userId) === normalize(identity))
  },
}))

describe('permissionChecker', () => {
  beforeEach(() => {
    env.ADMIN_QQ = undefined
    env.ADMIN_TG = undefined
  })

  describe('isAdmin', () => {
    it('returns true for instance owner', () => {
      const mockInstance = { owner: '1234567890' }
      const checker = new CommandAccessChecker(mockInstance as any)
      expect(checker.isAdmin('1234567890')).toBe(true)
    })

    it('returns false for non-owner user with no env', () => {
      const mockInstance = { owner: '1234567890' }
      const checker = new CommandAccessChecker(mockInstance as any)
      expect(checker.isAdmin('9999999999')).toBe(false)
    })

    it('returns true when userId matches ADMIN_QQ', () => {
      const mockInstance = { owner: '123' }
      const checker = new CommandAccessChecker(mockInstance as any)
      env.ADMIN_QQ = 999
      expect(checker.isAdmin('999')).toBe(true)
    })

    it('returns true when userId matches ADMIN_TG', () => {
      const mockInstance = { owner: '123' }
      const checker = new CommandAccessChecker(mockInstance as any)
      env.ADMIN_TG = 888
      expect(checker.isAdmin('888')).toBe(true)
    })

    it('returns true when userId matches instance owner as number', () => {
      const mockInstance = { owner: 123456 }
      const checker = new CommandAccessChecker(mockInstance as any)
      expect(checker.isAdmin('123456')).toBe(true)
    })

    it('handles different userId formats', () => {
      const mockInstance = { owner: '999' }
      const checker = new CommandAccessChecker(mockInstance as any)
      expect(checker.isAdmin('999')).toBe(true)
      expect(checker.isAdmin('123')).toBe(false)
    })
  })
})
