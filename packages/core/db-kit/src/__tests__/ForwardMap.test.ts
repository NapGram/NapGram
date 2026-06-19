import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

// Mock database
const mockDb = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
  values: vi.fn().mockReturnThis(),
  returning: vi.fn().mockResolvedValue([]),
}

vi.mock('../db.js', () => ({
  default: mockDb,
  db: mockDb,
  schema: {
    forwardPair: {
      instanceId: 'instanceId',
      id: 'id',
      qqRoomId: 'qqRoomId',
      tgChatId: 'tgChatId',
    },
  },
  eq: vi.fn((a: any, b: any) => ({ a, b, type: 'eq' })),
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

describe('ForwardMap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDb.select.mockReturnThis()
    mockDb.from.mockReturnThis()
    mockDb.where.mockReturnThis()
    mockDb.insert.mockReturnThis()
    mockDb.update.mockReturnThis()
    mockDb.delete.mockReturnThis()
    mockDb.set.mockReturnThis()
    mockDb.values.mockReturnThis()
    mockDb.returning.mockResolvedValue([])
  })

  describe('constructor', () => {
    it('should create ForwardMap with pairs', async () => {
      const { ForwardMap } = await import('../models/ForwardMap.js')

      const pairs = [
        {
          id: 1,
          qqChatType: 'group',
          qqRoomId: BigInt(123456),
          tgChatId: BigInt(-100123),
          tgThreadId: null,
          flags: 0,
          instanceId: 1,
          apiKey: 'key1',
        },
      ]

      const map = new (ForwardMap as any)(pairs, 1)
      expect(map).toBeDefined()
    })
  })

  describe('find', () => {
    it('should return null for null/undefined target', async () => {
      const { ForwardMap } = await import('../models/ForwardMap.js')
      const map = new (ForwardMap as any)([], 1)

      expect(map.find(null)).toBeNull()
      expect(map.find(undefined)).toBeNull()
    })

    it('should find by QQ target object', async () => {
      const { ForwardMap } = await import('../models/ForwardMap.js')

      const pairs = [
        {
          id: 1,
          qqChatType: 'group',
          qqRoomId: BigInt(123456),
          tgChatId: BigInt(-100123),
          tgThreadId: null,
          flags: 0,
          instanceId: 1,
          apiKey: 'key1',
        },
      ]

      const map = new (ForwardMap as any)(pairs, 1)
      const result = map.find({ type: 'group', id: '123456' })
      expect(result).toBeDefined()
      expect(result?.id).toBe(1)
    })

    it('should find by TG id', async () => {
      const { ForwardMap } = await import('../models/ForwardMap.js')

      const pairs = [
        {
          id: 1,
          qqChatType: 'group',
          qqRoomId: BigInt(123456),
          tgChatId: BigInt(-100123),
          tgThreadId: null,
          flags: 0,
          instanceId: 1,
          apiKey: 'key1',
        },
      ]

      const map = new (ForwardMap as any)(pairs, 1)
      const result = map.find({ id: -100123 })
      expect(result).toBeDefined()
      expect(result?.id).toBe(1)
    })

    it('should return null for non-existent target', async () => {
      const { ForwardMap } = await import('../models/ForwardMap.js')
      const map = new (ForwardMap as any)([], 1)

      expect(map.find({ type: 'group', id: '999' })).toBeFalsy()
    })
  })

  describe('findByQQ', () => {
    it('should find pair by QQ room id', async () => {
      const { ForwardMap } = await import('../models/ForwardMap.js')

      const pairs = [
        {
          id: 1,
          qqChatType: 'group',
          qqRoomId: BigInt(123456),
          tgChatId: BigInt(-100123),
          tgThreadId: null,
          flags: 0,
          instanceId: 1,
          apiKey: 'key1',
        },
      ]

      const map = new (ForwardMap as any)(pairs, 1)
      const result = map.findByQQ('123456')
      expect(result).toBeDefined()
      expect(result?.id).toBe(1)
    })

    it('should normalize negative group ids', async () => {
      const { ForwardMap } = await import('../models/ForwardMap.js')

      const pairs = [
        {
          id: 1,
          qqChatType: 'group',
          qqRoomId: BigInt(123456),
          tgChatId: BigInt(-100123),
          tgThreadId: null,
          flags: 0,
          instanceId: 1,
          apiKey: 'key1',
        },
      ]

      const map = new (ForwardMap as any)(pairs, 1)
      // Negative group id should be normalized to positive
      const result = map.findByQQ({ type: 'group', id: '-123456' })
      expect(result).toBeDefined()
    })
  })

  describe('findByTG', () => {
    it('should find pair by TG chat id', async () => {
      const { ForwardMap } = await import('../models/ForwardMap.js')

      const pairs = [
        {
          id: 1,
          qqChatType: 'group',
          qqRoomId: BigInt(123456),
          tgChatId: BigInt(-100123),
          tgThreadId: null,
          flags: 0,
          instanceId: 1,
          apiKey: 'key1',
        },
      ]

      const map = new (ForwardMap as any)(pairs, 1)
      const result = map.findByTG(-100123)
      expect(result).toBeDefined()
      expect(result?.id).toBe(1)
    })

    it('should find by thread id', async () => {
      const { ForwardMap } = await import('../models/ForwardMap.js')

      const pairs = [
        {
          id: 1,
          qqChatType: 'group',
          qqRoomId: BigInt(123456),
          tgChatId: BigInt(-100123),
          tgThreadId: BigInt(456),
          flags: 0,
          instanceId: 1,
          apiKey: 'key1',
        },
      ]

      const map = new (ForwardMap as any)(pairs, 1)
      const result = map.findByTG(-100123, BigInt(456))
      expect(result).toBeDefined()
      expect(result?.id).toBe(1)
    })
  })

  describe('getAll', () => {
    it('should return all pairs', async () => {
      const { ForwardMap } = await import('../models/ForwardMap.js')

      const pairs = [
        {
          id: 1,
          qqChatType: 'group',
          qqRoomId: BigInt(123456),
          tgChatId: BigInt(-100123),
          tgThreadId: null,
          flags: 0,
          instanceId: 1,
          apiKey: 'key1',
        },
        {
          id: 2,
          qqChatType: 'private',
          qqRoomId: BigInt(789),
          tgChatId: BigInt(456),
          tgThreadId: null,
          flags: 0,
          instanceId: 1,
          apiKey: 'key2',
        },
      ]

      const map = new (ForwardMap as any)(pairs, 1)
      const all = map.getAll()
      expect(all).toHaveLength(2)
    })
  })
})
