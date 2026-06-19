import { describe, expect, it, vi, beforeEach } from 'vitest'

describe('admin-identity', () => {
  describe('normalizeUserIdentity', () => {
    it('should return empty string for undefined', async () => {
      const { normalizeUserIdentity } = await import('../admin-identity.js')
      expect(normalizeUserIdentity(undefined)).toBe('')
    })

    it('should return empty string for null', async () => {
      const { normalizeUserIdentity } = await import('../admin-identity.js')
      expect(normalizeUserIdentity(null)).toBe('')
    })

    it('should trim whitespace', async () => {
      const { normalizeUserIdentity } = await import('../admin-identity.js')
      expect(normalizeUserIdentity('  12345  ')).toBe('12345')
    })

    it('should strip tg:u: prefix', async () => {
      const { normalizeUserIdentity } = await import('../admin-identity.js')
      expect(normalizeUserIdentity('tg:u:12345')).toBe('12345')
    })

    it('should strip qq:u: prefix case-insensitively', async () => {
      const { normalizeUserIdentity } = await import('../admin-identity.js')
      expect(normalizeUserIdentity('QQ:U:12345')).toBe('12345')
      expect(normalizeUserIdentity('qq:u:12345')).toBe('12345')
    })

    it('should handle numeric input', async () => {
      const { normalizeUserIdentity } = await import('../admin-identity.js')
      expect(normalizeUserIdentity(12345)).toBe('12345')
    })
  })

  describe('isConfiguredIdentity', () => {
    it('should return false for undefined', async () => {
      const { isConfiguredIdentity } = await import('../admin-identity.js')
      expect(isConfiguredIdentity(undefined)).toBe(false)
    })

    it('should return false for null', async () => {
      const { isConfiguredIdentity } = await import('../admin-identity.js')
      expect(isConfiguredIdentity(null)).toBe(false)
    })

    it('should return false for empty string', async () => {
      const { isConfiguredIdentity } = await import('../admin-identity.js')
      expect(isConfiguredIdentity('')).toBe(false)
    })

    it('should return false for whitespace-only string', async () => {
      const { isConfiguredIdentity } = await import('../admin-identity.js')
      expect(isConfiguredIdentity('   ')).toBe(false)
    })

    it('should return true for valid string', async () => {
      const { isConfiguredIdentity } = await import('../admin-identity.js')
      expect(isConfiguredIdentity('12345')).toBe(true)
    })

    it('should return true for valid number', async () => {
      const { isConfiguredIdentity } = await import('../admin-identity.js')
      expect(isConfiguredIdentity(12345)).toBe(true)
    })
  })

  describe('matchesUserIdentity', () => {
    it('should return false if identity is not configured', async () => {
      const { matchesUserIdentity } = await import('../admin-identity.js')
      expect(matchesUserIdentity('12345', undefined)).toBe(false)
      expect(matchesUserIdentity('12345', null)).toBe(false)
      expect(matchesUserIdentity('12345', '')).toBe(false)
    })

    it('should match exact identities', async () => {
      const { matchesUserIdentity } = await import('../admin-identity.js')
      expect(matchesUserIdentity('12345', '12345')).toBe(true)
      expect(matchesUserIdentity('12345', '99999')).toBe(false)
    })

    it('should match after prefix stripping', async () => {
      const { matchesUserIdentity } = await import('../admin-identity.js')
      expect(matchesUserIdentity('12345', 'tg:u:12345')).toBe(true)
      expect(matchesUserIdentity('tg:u:12345', '12345')).toBe(true)
    })

    it('should match case-insensitively for prefixes', async () => {
      const { matchesUserIdentity } = await import('../admin-identity.js')
      expect(matchesUserIdentity('12345', 'TG:U:12345')).toBe(true)
      expect(matchesUserIdentity('QQ:U:12345', 'qq:u:12345')).toBe(true)
    })
  })

  describe('matchesAnyIdentity', () => {
    it('should return false for empty array', async () => {
      const { matchesAnyIdentity } = await import('../admin-identity.js')
      expect(matchesAnyIdentity('12345', [])).toBe(false)
    })

    it('should return false if no match', async () => {
      const { matchesAnyIdentity } = await import('../admin-identity.js')
      expect(matchesAnyIdentity('12345', ['99999', '88888'])).toBe(false)
    })

    it('should return true if any match', async () => {
      const { matchesAnyIdentity } = await import('../admin-identity.js')
      expect(matchesAnyIdentity('12345', ['99999', '12345', '88888'])).toBe(true)
    })

    it('should handle mixed valid and invalid identities', async () => {
      const { matchesAnyIdentity } = await import('../admin-identity.js')
      expect(matchesAnyIdentity('12345', [undefined, null, '', '12345'])).toBe(true)
    })
  })

  describe('getSystemOwners', () => {
    it('should return owners from env', async () => {
      const { getSystemOwners } = await import('../admin-identity.js')
      const owners = getSystemOwners()
      expect(owners).toHaveProperty('qq')
      expect(owners).toHaveProperty('tg')
    })
  })
})
