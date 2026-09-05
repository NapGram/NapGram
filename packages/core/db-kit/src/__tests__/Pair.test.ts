import { describe, expect, it, beforeEach, mock } from 'bun:test'

// Mock dependencies
const mockThenable = { then: mock().mockResolvedValue(undefined) }
mock.module('../db.js', () => ({
  default: {
    select: mock().mockReturnThis(),
    from: mock().mockReturnThis(),
    where: mock().mockReturnThis(),
    update: mock().mockReturnValue({ set: mock().mockReturnValue({ where: mock().mockReturnValue(mockThenable) }) }),
    set: mock().mockReturnThis(),
    insert: mock().mockReturnThis(),
    values: mock().mockReturnThis(),
    returning: mock().mockResolvedValue([]),
  },
  db: {},
  schema: { avatarCache: {}, forwardPair: {} },
  eq: mock(),
}))

mock.module('@napgram/env-kit', () => ({
  flags: {
    NAME_LOCKED: 131072,
  },
  env: {
    LOG_LEVEL: 'info',
  },
}))

mock.module('@napgram/logger-kit', () => ({
  getLogger: mock().mockReturnValue({
    trace: mock(),
    debug: mock(),
    info: mock(),
    warn: mock(),
    error: mock(),
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
