import { describe, expect, it, vi, beforeEach } from 'vitest'

// Mock shared-runtime
vi.mock('../shared-runtime.js', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
    query: {
      adminSession: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    },
  },
  schema: {
    accessToken: {
      token: 'token',
      isActive: 'isActive',
      expiresAt: 'expiresAt',
      id: 'id',
      lastUsedAt: 'lastUsedAt',
    },
    adminSession: {
      token: 'token',
      expiresAt: 'expiresAt',
      userId: 'userId',
    },
  },
  eq: vi.fn((a: any, b: any) => ({ a, b, type: 'eq' })),
  and: vi.fn(),
  or: vi.fn(),
  gt: vi.fn(),
  lt: vi.fn(),
  isNull: vi.fn(),
}))

describe('TokenManager', () => {
  describe('generateToken', () => {
    it('should generate a 64 character hex string', async () => {
      const { TokenManager } = await import('../TokenManager.js')
      const token = TokenManager.generateToken()

      expect(typeof token).toBe('string')
      expect(token).toHaveLength(64)
      expect(token).toMatch(/^[0-9a-f]+$/)
    })

    it('should generate unique tokens', async () => {
      const { TokenManager } = await import('../TokenManager.js')
      const token1 = TokenManager.generateToken()
      const token2 = TokenManager.generateToken()

      expect(token1).not.toBe(token2)
    })
  })

  describe('getEnvAdminToken', () => {
    it('should return undefined when ADMIN_TOKEN is not set', async () => {
      const { TokenManager } = await import('../TokenManager.js')
      delete process.env.ADMIN_TOKEN

      expect(TokenManager.getEnvAdminToken()).toBeUndefined()
    })

    it('should return ADMIN_TOKEN when set', async () => {
      const { TokenManager } = await import('../TokenManager.js')
      process.env.ADMIN_TOKEN = 'test-token-123'

      expect(TokenManager.getEnvAdminToken()).toBe('test-token-123')

      delete process.env.ADMIN_TOKEN
    })
  })
})

describe('PasswordUtil', () => {
  describe('hashPassword', () => {
    it('should return salt:hash format', async () => {
      const { PasswordUtil } = await import('../TokenManager.js')
      const hash = PasswordUtil.hashPassword('mypassword')

      expect(hash).toContain(':')
      const [salt, hashValue] = hash.split(':')
      expect(salt).toHaveLength(32)
      expect(hashValue).toHaveLength(128)
    })

    it('should generate different hashes for same password', async () => {
      const { PasswordUtil } = await import('../TokenManager.js')
      const hash1 = PasswordUtil.hashPassword('mypassword')
      const hash2 = PasswordUtil.hashPassword('mypassword')

      expect(hash1).not.toBe(hash2)
    })
  })

  describe('verifyPassword', () => {
    it('should return true for correct password', async () => {
      const { PasswordUtil } = await import('../TokenManager.js')
      const hash = PasswordUtil.hashPassword('mypassword')

      expect(PasswordUtil.verifyPassword('mypassword', hash)).toBe(true)
    })

    it('should return false for incorrect password', async () => {
      const { PasswordUtil } = await import('../TokenManager.js')
      const hash = PasswordUtil.hashPassword('mypassword')

      expect(PasswordUtil.verifyPassword('wrongpassword', hash)).toBe(false)
    })

    it('should handle empty password', async () => {
      const { PasswordUtil } = await import('../TokenManager.js')
      const hash = PasswordUtil.hashPassword('')

      expect(PasswordUtil.verifyPassword('', hash)).toBe(true)
      expect(PasswordUtil.verifyPassword('notempty', hash)).toBe(false)
    })
  })
})
