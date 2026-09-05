import { describe, expect, it } from 'bun:test'
import { ForwardMap } from '../ForwardMap.js'

function makePair(overrides: Partial<any> = {}) {
  return {
    id: 1,
    qqChatType: 'group',
    qqRoomId: BigInt(100),
    tgChatId: BigInt(200),
    tgThreadId: null,
    flags: 0,
    instanceId: 1,
    apiKey: 'key',
    ignoreRegex: null,
    ignoreSenders: null,
    forwardMode: null,
    nicknameMode: null,
    commandReplyMode: null,
    commandReplyFilter: null,
    commandReplyList: null,
    ...overrides,
  }
}

describe('infra-kit ForwardMap compatibility facade', () => {
  it('exposes the db-kit ForwardMap constructor', () => {
    expect(typeof ForwardMap).toBe('function')
  })

  it('retains the in-memory lookup behavior without requiring PostgreSQL', () => {
    const pair = makePair()
    const map = new (ForwardMap as any)([pair], 1)

    const normalizedPair = {
      ...pair,
      autoCreated: false,
      tgProvisionedByUserSessionId: null,
    }
    expect(map.findByQQ(100)).toEqual(normalizedPair)
    expect(map.findByTG(200)).toEqual(normalizedPair)
    expect(map.find({ id: 200 })).toEqual(normalizedPair)
    expect(map.getAll()).toEqual([normalizedPair])
    expect(map.find(null)).toBeNull()
  })
})
