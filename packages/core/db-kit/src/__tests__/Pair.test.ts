import { describe, expect, it, vi, beforeEach } from 'vitest'

// Mock dependencies
const mockThenable = { then: vi.fn().mockResolvedValue(undefined) }
vi.mock('../db.js', () => ({
  default: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue(mockThenable) }) }),
    set: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
  },
  db: {},
  schema: { avatarCache: {}, forwardPair: {} },
  eq: vi.fn(),
}))

vi.mock('@napgram/env-kit', () => ({
  flags: {
    NAME_LOCKED: 131072,
  },
  env: {
    LOG_LEVEL: 'info',
  },
}))

vi.mock('@napgram/logger-kit', () => ({
  getLogger: vi.fn().mockReturnValue({
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

describe('Pair', () => {
  describe('static methods', () => {
    it('getByApiKey should return undefined for non-existent key', async () => {
      const { Pair } = await import('../models/Pair.js')
      expect(Pair.getByApiKey('nonexistent')).toBeUndefined()
    })

    it('getByDbId should return undefined for non-existent id', async () => {
      const { Pair } = await import('../models/Pair.js')
      expect(Pair.getByDbId(999)).toBeUndefined()
    })
  })

  describe('constructor', () => {
    it('should register pair in static maps', async () => {
      const { Pair } = await import('../models/Pair.js')

      const mockQq = { uin: 12345 } as any
      const mockTg = { id: '-100123' } as any
      const mockTgUser = { id: '456' } as any
      const mockQqClient = {} as any

      const pair = new Pair(mockQq, mockTg, mockTgUser, 1, 0, 'testkey', mockQqClient)

      expect(Pair.getByApiKey('testkey')).toBe(pair)
      expect(Pair.getByDbId(1)).toBe(pair)
    })
  })

  describe('qqRoomId', () => {
    it('should return uin for friend', async () => {
      const { Pair } = await import('../models/Pair.js')

      const mockQq = { uin: 12345 } as any
      const mockTg = { id: '-100123' } as any
      const mockTgUser = { id: '456' } as any
      const mockQqClient = {} as any

      const pair = new Pair(mockQq, mockTg, mockTgUser, 1, 0, 'key', mockQqClient)
      expect(pair.qqRoomId).toBe(12345)
    })

    it('should return negative gid for group', async () => {
      const { Pair } = await import('../models/Pair.js')

      const mockQq = { gid: 789 } as any
      const mockTg = { id: '-100123' } as any
      const mockTgUser = { id: '456' } as any
      const mockQqClient = {} as any

      const pair = new Pair(mockQq, mockTg, mockTgUser, 1, 0, 'key', mockQqClient)
      expect(pair.qqRoomId).toBe(-789)
    })
  })

  describe('tgId', () => {
    it('should return numeric tg id', async () => {
      const { Pair } = await import('../models/Pair.js')

      const mockQq = { uin: 12345 } as any
      const mockTg = { id: '-100123' } as any
      const mockTgUser = { id: '456' } as any
      const mockQqClient = {} as any

      const pair = new Pair(mockQq, mockTg, mockTgUser, 1, 0, 'key', mockQqClient)
      expect(pair.tgId).toBe(-100123)
    })
  })

  describe('flags', () => {
    it('should get and set flags', async () => {
      const { Pair } = await import('../models/Pair.js')

      const mockQq = { uin: 12345 } as any
      const mockTg = { id: '-100123' } as any
      const mockTgUser = { id: '456' } as any
      const mockQqClient = {} as any

      const pair = new Pair(mockQq, mockTg, mockTgUser, 1, 0, 'key', mockQqClient)
      expect(pair.flags).toBe(0)

      pair.flags = 42
      expect(pair.flags).toBe(42)
    })
  })
})
