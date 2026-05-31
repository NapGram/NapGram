import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../../../shared-types.js'
import {
  addForwardPairWithChatType,
  findPairByQQWithChatType,
  findPairByTGWithChatType,
  formatQqChatTypeLabel,
  getForwardPairChatType,
  normalizeQqChatType,
  parseQqChatType,
  qqChatTypeFromMessage,
  qqChatTypeToMessageChatType,
  removeForwardPairById,
} from '../ForwardPairChatType.js'

const loggerMocks = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}))

vi.mock('../../../../shared-types.js', async importOriginal => ({
  ...(await importOriginal() as any),
  db: {
    execute: vi.fn().mockResolvedValue({ rows: [], rowCount: 1 }),
  },
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings: [...strings], values })),
  getLogger: vi.fn(() => loggerMocks),
}))

function createRawPair(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    qqRoomId: '20002',
    tgChatId: '-10040004',
    tgThreadId: null,
    instanceId: 7,
    flags: 0,
    apiKey: 'api-key',
    ignoreRegex: null,
    ignoreSenders: null,
    forwardMode: null,
    nicknameMode: null,
    commandReplyMode: null,
    commandReplyFilter: null,
    commandReplyList: null,
    qqChatType: 'private',
    qqDisplayName: 'Alice',
    tgProvisionedByUserSessionId: '66',
    autoCreated: true,
    ...overrides,
  }
}

function createForwardMap(overrides: Record<string, unknown> = {}) {
  return {
    findByTG: vi.fn(),
    findByQQ: vi.fn(),
    getAll: vi.fn().mockReturnValue([]),
    reload: vi.fn().mockResolvedValue(undefined),
    add: vi.fn(),
    ...overrides,
  } as any
}

describe('forwardPairChatType', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(db.execute).mockReset()
    vi.mocked(db.execute).mockResolvedValue({ rows: [], rowCount: 1 })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('normalizes, parses, and formats QQ chat type aliases', () => {
    expect(normalizeQqChatType(' qq_group ')).toBe('group')
    expect(normalizeQqChatType('好友')).toBe('private')
    expect(normalizeQqChatType('unknown')).toBe('group')
    expect(normalizeQqChatType(undefined)).toBe('group')
    expect(parseQqChatType('qq-friend')).toBe('private')
    expect(parseQqChatType('群聊')).toBe('group')
    expect(parseQqChatType('unknown')).toBeUndefined()
    expect(parseQqChatType(123)).toBeUndefined()
    expect(qqChatTypeFromMessage({ chat: { type: 'private' } } as any)).toBe('private')
    expect(qqChatTypeToMessageChatType('group')).toBe('group')
    expect(formatQqChatTypeLabel('private')).toBe('QQ 好友')
    expect(formatQqChatTypeLabel('group')).toBe('QQ 群')
  })

  it('returns group for missing pairs and existing chat type without database access', async () => {
    await expect(getForwardPairChatType(undefined)).resolves.toBe('group')

    const pair = { id: 10, qqChatType: 'friend' } as any
    await expect(getForwardPairChatType(pair)).resolves.toBe('private')

    expect(db.execute).not.toHaveBeenCalled()
  })

  it('loads and attaches chat type for pairs without an in-memory type', async () => {
    const pair = { id: 10 } as any
    vi.mocked(db.execute).mockResolvedValueOnce({ rows: [createRawPair({ qqChatType: 'private' })] })

    await expect(getForwardPairChatType(pair)).resolves.toBe('private')

    expect(pair.qqChatType).toBe('private')
    expect(db.execute).toHaveBeenCalledTimes(1)
  })

  it('falls back to group when legacy databases lack personal-mode columns', async () => {
    vi.mocked(db.execute).mockRejectedValueOnce(new Error('column qqChatType does not exist'))

    await expect(getForwardPairChatType({ id: 10 } as any)).resolves.toBe('group')

    expect(loggerMocks.debug).not.toHaveBeenCalled()
  })

  it('logs unexpected chat type lookup failures and falls back to group', async () => {
    const error = new Error('network down')
    vi.mocked(db.execute).mockRejectedValueOnce(error)

    await expect(getForwardPairChatType({ id: 10 } as any)).resolves.toBe('group')

    expect(loggerMocks.debug).toHaveBeenCalledWith(error, 'Failed to read qqChatType for pair 10')
  })

  it('finds TG pairs and attaches chat type from storage', async () => {
    const loaded = { id: 10 } as any
    const forwardMap = createForwardMap({
      findByTG: vi.fn().mockReturnValue(loaded),
    })
    vi.mocked(db.execute).mockResolvedValueOnce({ rows: [createRawPair({ qqChatType: 'private' })] })

    const pair = await findPairByTGWithChatType(forwardMap, -10040004, undefined, false)

    expect(pair).toBe(loaded)
    expect(pair?.qqChatType).toBe('private')
    expect(forwardMap.findByTG).toHaveBeenCalledWith(-10040004, undefined, false)
  })

  it('returns undefined when no TG pair exists', async () => {
    const forwardMap = createForwardMap({ findByTG: vi.fn().mockReturnValue(undefined) })

    await expect(findPairByTGWithChatType(forwardMap, -10040004, undefined, false)).resolves.toBeUndefined()

    expect(db.execute).not.toHaveBeenCalled()
  })

  it('finds QQ pairs from storage and prefers loaded pair instances', async () => {
    const loaded = { id: 10, qqRoomId: BigInt(20002) } as any
    const forwardMap = createForwardMap({
      getAll: vi.fn().mockReturnValue([loaded]),
    })
    vi.mocked(db.execute).mockResolvedValueOnce({ rows: [createRawPair({ id: 10, qqChatType: 'private' })] })

    const pair = await findPairByQQWithChatType(forwardMap, 7, 20002, 'private')

    expect(pair).toBe(loaded)
    expect(pair?.qqChatType).toBe('private')
  })

  it('falls back to loaded group mappings only for group lookups', async () => {
    const fallback = { id: 11, qqRoomId: BigInt(20002) } as any
    const forwardMap = createForwardMap({
      findByQQ: vi.fn().mockReturnValue(fallback),
    })
    vi.mocked(db.execute).mockResolvedValue({ rows: [] })

    await expect(findPairByQQWithChatType(forwardMap, 7, 20002, 'private')).resolves.toBeUndefined()
    const groupPair = await findPairByQQWithChatType(forwardMap, 7, 20002, 'group')

    expect(groupPair).toBe(fallback)
    expect(groupPair?.qqChatType).toBe('group')
  })

  it('uses legacy fallback for missing group columns and rejects private fallback', async () => {
    const forwardMap = createForwardMap({
      add: vi.fn().mockResolvedValue({ id: 12, qqRoomId: BigInt(20002) }),
    })
    vi.mocked(db.execute).mockRejectedValue(new Error('no such column: qqChatType'))

    const groupPair = await addForwardPairWithChatType(forwardMap, 7, 20002, -10040004, BigInt(9), 'group')

    expect(groupPair.qqChatType).toBe('group')
    expect(forwardMap.add).toHaveBeenCalledWith(20002, -10040004, BigInt(9))
    await expect(addForwardPairWithChatType(forwardMap, 7, 10001, -10040004, undefined, 'private'))
      .rejects.toThrow('数据库尚未应用个人模式迁移，无法绑定 QQ 好友')
  })

  it('returns existing TG pair when it conflicts with a different QQ pair', async () => {
    const existingTg = { id: 20, qqChatType: 'group' } as any
    const existingQq = createRawPair({ id: 21, qqChatType: 'group' })
    const forwardMap = createForwardMap({
      findByTG: vi.fn().mockReturnValue(existingTg),
    })
    vi.mocked(db.execute)
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [existingQq] })

    const pair = await addForwardPairWithChatType(forwardMap, 7, 20002, -10040004, undefined, 'group')

    expect(pair).toBe(existingTg)
    expect(forwardMap.reload).not.toHaveBeenCalled()
  })

  it('updates an existing QQ pair and returns the reloaded TG pair', async () => {
    const existingQq = createRawPair({ id: 21, qqChatType: 'group', qqDisplayName: 'Old Name' })
    const reloaded = { id: 21, qqChatType: 'group', tgChatId: BigInt(-10040004) } as any
    const forwardMap = createForwardMap({
      findByTG: vi.fn()
        .mockReturnValueOnce(undefined)
        .mockReturnValueOnce(reloaded),
    })
    vi.mocked(db.execute)
      .mockResolvedValueOnce({ rows: [existingQq] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })

    const pair = await addForwardPairWithChatType(forwardMap, 7, 20002, -10040004, BigInt(9), 'group', {
      qqDisplayName: 'New Name',
      autoCreated: true,
      forwardMode: '11',
      nicknameMode: '10',
    })

    expect(pair).toBe(reloaded)
    expect(db.execute).toHaveBeenCalledTimes(2)
    expect((vi.mocked(db.execute).mock.calls[1][0] as any).values).toEqual([
      BigInt(-10040004),
      BigInt(9),
      'group',
      'New Name',
      66,
      true,
      '11',
      '10',
      21,
    ])
    expect(forwardMap.reload).toHaveBeenCalled()
  })

  it('inserts a new typed pair and throws if reload cannot observe it', async () => {
    const forwardMap = createForwardMap({
      findByTG: vi.fn().mockReturnValue(undefined),
      findByQQ: vi.fn().mockReturnValue(undefined),
    })
    vi.mocked(db.execute)
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })

    await expect(addForwardPairWithChatType(forwardMap, 7, 20002, -10040004, undefined, 'group', {
      qqDisplayName: 'Group Name',
      tgProvisionedByUserSessionId: 66,
      autoCreated: true,
    })).rejects.toThrow('绑定失败：操作未生效，请重试')

    expect((vi.mocked(db.execute).mock.calls[1][0] as any).values.slice(0, 10)).toEqual([
      BigInt(20002),
      BigInt(-10040004),
      null,
      7,
      'group',
      'Group Name',
      66,
      true,
      null,
      null,
    ])
  })

  it('removes pairs by id and reports row count', async () => {
    const forwardMap = createForwardMap()
    vi.mocked(db.execute).mockResolvedValueOnce({ rows: [], rowCount: 0 })

    await expect(removeForwardPairById(forwardMap, 10)).resolves.toBe(false)
    expect(forwardMap.reload).toHaveBeenCalledTimes(1)

    vi.mocked(db.execute).mockResolvedValueOnce({ rows: [], rowCount: 2 })
    await expect(removeForwardPairById(forwardMap, 11)).resolves.toBe(true)
    expect(forwardMap.reload).toHaveBeenCalledTimes(2)
  })
})
