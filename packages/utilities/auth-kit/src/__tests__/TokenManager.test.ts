import { describe, expect, it, beforeEach, mock } from 'bun:test'

// Mock shared-runtime
mock.module('../shared-runtime.js', () => ({
  db: {
    select: mock().mockReturnThis(),
    from: mock().mockReturnThis(),
    where: mock().mockReturnThis(),
    limit: mock().mockResolvedValue([]),
    insert: mock().mockReturnThis(),
    values: mock().mockResolvedValue(undefined),
    update: mock().mockReturnThis(),
    set: mock().mockReturnThis(),
    delete: mock().mockReturnThis(),
    returning: mock().mockResolvedValue([]),
    query: {
      adminSession: {
        findFirst: mock().mockResolvedValue(null),
      },
      adminUser: {
        findFirst: mock().mockResolvedValue(null),
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
  eq: mock((a: any, b: any) => ({ a, b, type: 'eq' })),
  and: mock(),
  or: mock(),
  gt: mock(),
  lt: mock(),
  isNull: mock(),
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
      delete Bun.env.ADMIN_TOKEN

      expect(TokenManager.getEnvAdminToken()).toBeUndefined()
    })

    it('should return ADMIN_TOKEN when set', async () => {
      const { TokenManager } = await import('../TokenManager.js')
      Bun.env.ADMIN_TOKEN = 'test-token-123'

      expect(TokenManager.getEnvAdminToken()).toBe('test-token-123')

      delete Bun.env.ADMIN_TOKEN
    })
  })
})

describe('PasswordUtil', () => {
  describe('hashPassword', () => {
    it('should return a Bun Argon2id hash', async () => {
      const { PasswordUtil } = await import('../TokenManager.js')
      const hash = await PasswordUtil.hashPassword('mypassword')

      expect(hash).toMatch(/^\$argon2id\$/)
      expect(await Bun.password.verify('mypassword', hash)).toBe(true)
    })

    it('should generate different hashes for same password', async () => {
      const { PasswordUtil } = await import('../TokenManager.js')
      const hash1 = await PasswordUtil.hashPassword('mypassword')
      const hash2 = await PasswordUtil.hashPassword('mypassword')

      expect(hash1).not.toBe(hash2)
    })
  })

  describe('verifyPassword', () => {
    it('should return true for correct password', async () => {
      const { PasswordUtil } = await import('../TokenManager.js')
      const hash = await PasswordUtil.hashPassword('mypassword')

      expect(await PasswordUtil.verifyPassword('mypassword', hash)).toBe(true)
    })

    it('should return false for incorrect password', async () => {
      const { PasswordUtil } = await import('../TokenManager.js')
      const hash = await PasswordUtil.hashPassword('mypassword')

      expect(await PasswordUtil.verifyPassword('wrongpassword', hash)).toBe(false)
    })

    it('should reject empty passwords', async () => {
      const { PasswordUtil } = await import('../TokenManager.js')
      const hash = await PasswordUtil.hashPassword('notempty')

      await expect(PasswordUtil.hashPassword('')).rejects.toThrow('Password must not be empty')
      expect(await PasswordUtil.verifyPassword('', hash)).toBe(false)
    })
  })
})
