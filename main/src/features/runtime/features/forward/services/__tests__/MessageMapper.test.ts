import type { UnifiedMessage } from '@napgram/message-kit'
import { bunEnv } from '../../../../../../shared/utils/runtime.js'
import { db } from '@napgram/db-kit'
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test'
import { ForwardMapper } from '../MessageMapper.js'

const loggerMocks = { debug: mock(), info: mock(), warn: mock(), error: mock() }

function queryResult(rows: Record<string, unknown>[] = [], rowCount = rows.length) {
  return {
    rows,
    rowCount,
    command: 'SELECT',
    oid: 0,
    fields: [],
  }
}

mock.module('@napgram/db-kit', () => ({
  db: { execute: mock().mockResolvedValue({ rows: [], rowCount: 1, command: 'SELECT', oid: 0, fields: [] }) },
  sql: mock((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings: [...strings], values })),
}))

mock.module('@napgram/logger-kit', () => ({
  getLogger: mock(() => loggerMocks),
}))

const originalNodeEnv = bunEnv.NODE_ENV

function createQqMessage(overrides: Partial<UnifiedMessage> = {}): UnifiedMessage {
  return {
    id: 'qq-1',
    platform: 'qq',
    sender: { id: '10001', name: 'Sender Name' },
    chat: { id: '20002', type: 'group', name: 'Group Name' },
    content: [{ type: 'text', data: { text: 'hello' } }, { type: 'image', data: { url: 'https://example.test/a.jpg' } }],
    timestamp: 1_700_000_500_000,
    metadata: { raw: { message_id: 123, rand: 456, sender: { card: ' Group Card ', nickname: ' Nick ' } } },
    ...overrides,
  } as UnifiedMessage
}

function createTgUnified(overrides: Partial<UnifiedMessage> = {}): UnifiedMessage {
  return {
    id: 'tg-1',
    platform: 'telegram',
    sender: { id: '30003', name: 'TG Sender' },
    chat: { id: '-10040004', type: 'group', name: 'TG Group' },
    content: [{ type: 'text', data: { text: 'from tg' } }, { type: 'file', data: { filename: 'report.txt' } }],
    timestamp: 1_700_000_600_000,
    metadata: {},
    ...overrides,
  } as UnifiedMessage
}

describe('forwardMapper', () => {
  let mapper: ForwardMapper
  let dateSpy: any

  beforeEach(() => {
    mapper = new ForwardMapper()
    bunEnv.NODE_ENV = 'production'
    dateSpy = spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    ;(db.execute as any).mockClear()
    ;(db.execute as any).mockResolvedValue({ rows: [], rowCount: 1, command: 'SELECT', oid: 0, fields: [] })
    loggerMocks.debug.mockClear()
    loggerMocks.info.mockClear()
    loggerMocks.warn.mockClear()
    loggerMocks.error.mockClear()
  })

  afterEach(() => {
    bunEnv.NODE_ENV = originalNodeEnv
    if (dateSpy)
      dateSpy.mockRestore()
  })

  it('skips persistence in test runs', async () => {
    bunEnv.NODE_ENV = 'test'
    await mapper.saveTgToQqMapping(createTgUnified(), { id: 88 }, { messageId: 99 }, { instanceId: 7, qqRoomId: BigInt(20002), tgChatId: BigInt(-10040004) })
    await mapper.saveMessage(createQqMessage(), { id: 77 }, 7, BigInt(20002), BigInt(-10040004))
    const source = await mapper.findQqSource(7, BigInt(-10040004), BigInt(77))
    expect(db.execute).not.toHaveBeenCalled()
    expect(source).toBeUndefined()
  })

  it('stores TG to QQ mappings with receipt variants and rendered brief text', async () => {
    await mapper.saveTgToQqMapping(createTgUnified({ sender: { id: '30003' } as any }), { id: 88, sender: { id: 30003, username: 'tg-user' } }, { data: { message_id: 99 } }, { instanceId: 7, qqRoomId: BigInt(20002), tgChatId: BigInt(-10040004), qqChatType: 'private' })
    expect(db.execute).toHaveBeenCalledTimes(1)
    const query = (db.execute as any).mock.calls[0][0] as any
    expect(query.values).toEqual(['private', BigInt(20002), BigInt(0), 1_700_000_000, 99, BigInt(0), 1, BigInt(-10040004), BigInt(88), BigInt(30003), 7, 'tg-user', 'from tg [文件:report.txt]'])
    expect(loggerMocks.debug).toHaveBeenCalledWith('Saved TG->QQ mapping: seq=99 <-> tgMsgId=88')
  })

  it('stores enriched TG to QQ receipt fields from fetched raw message data', async () => {
    await mapper.saveTgToQqMapping(createTgUnified(), { id: 88, sender: { id: 30003 } }, { messageId: '99', raw: { message_id: 99, fetched: { sender: { user_id: 777 }, time: 1_700_000_777, rand: 123456789, pktnum: 2 } } }, { instanceId: 7, qqRoomId: BigInt(20002), tgChatId: BigInt(-10040004), qqChatType: 'group' })
    const query = (db.execute as any).mock.calls[0][0] as any
    expect(query.values[2]).toBe(BigInt(777))
    expect(query.values[3]).toBe(1_700_000_777)
    expect(query.values[4]).toBe(99)
    expect(query.values[5]).toBe(BigInt(123456789))
    expect(query.values[6]).toBe(2)
  })

  it('warns when TG to QQ receipt has no message id', async () => {
    await mapper.saveTgToQqMapping(createTgUnified(), { id: 88 }, {}, { instanceId: 7, qqRoomId: BigInt(20002), tgChatId: BigInt(-10040004) })
    expect(db.execute).not.toHaveBeenCalled()
    expect(loggerMocks.warn).toHaveBeenCalledWith('TG->QQ forwarded but no messageId in receipt, cannot save mapping.')
  })

  it('logs database failures while saving TG to QQ mappings', async () => {
    const error = new Error('insert failed');
    (db.execute as any).mockRejectedValueOnce(error)
    await mapper.saveTgToQqMapping(createTgUnified(), { id: 88, sender: { id: 30003 } }, { id: 99 }, { instanceId: 7, qqRoomId: BigInt(20002), tgChatId: BigInt(-10040004) })
    expect(loggerMocks.warn).toHaveBeenCalledWith(error, 'Failed to save TG->QQ message mapping:')
  })

  it('stores QQ to TG mappings using raw sender fields and message metadata', async () => {
    await mapper.saveMessage(createQqMessage(), { id: 77, sender: { id: 90001 } }, 7, BigInt(20002), BigInt(-10040004))
    const query = (db.execute as any).mock.calls[0][0] as any
    expect(query.values).toEqual(['group', BigInt(20002), BigInt(10001), 1_700_000_500, 123, BigInt(456), 0, BigInt(-10040004), BigInt(77), BigInt(90001), 7, 'Group Card', 'hello [图片]'])
  })

  it('falls back to sender name and defaults when saving QQ messages', async () => {
    await mapper.saveMessage(createQqMessage({ sender: { id: '10001', name: ' Sender Fallback ' }, chat: { id: '10001', type: 'private', name: 'Private' }, metadata: { raw: { seq: 321, sender: { card: ' ', nickname: '' } } } }), {}, 7, BigInt(10001), BigInt(-10040004))
    const query = (db.execute as any).mock.calls[0][0] as any
    expect(query.values[0]).toBe('private')
    expect(query.values[4]).toBe(321)
    expect(query.values[5]).toBe(BigInt(0))
    expect(query.values[8]).toBe(BigInt(0))
    expect(query.values[9]).toBe(BigInt(0))
    expect(query.values[11]).toBe('Sender Fallback')
  })

  it('logs database failures while saving QQ to TG mappings', async () => {
    const error = new Error('save failed');
    (db.execute as any).mockRejectedValueOnce(error)
    await mapper.saveMessage(createQqMessage(), { id: 77 }, 7, BigInt(20002), BigInt(-10040004))
    expect(loggerMocks.warn).toHaveBeenCalledWith(error, 'Failed to save message mapping:')
  })

  it('finds TG message ids by QQ sequence before using persistence guards', async () => {
    (db.execute as any).mockResolvedValueOnce(queryResult([{ tgMsgId: '987654321' }]))
    bunEnv.NODE_ENV = 'test'
    const tgMsgId = await mapper.findTgMsgId(7, BigInt(20002), '123')
    expect(tgMsgId).toBe(BigInt(987654321))
    expect(db.execute).toHaveBeenCalledTimes(1)
    expect(loggerMocks.debug).toHaveBeenCalledWith('Found TG Msg ID by seq: 987654321')
  })

  it('returns undefined for missing TG message ids during test persistence skip', async () => {
    (db.execute as any).mockResolvedValueOnce(queryResult())
    bunEnv.NODE_ENV = 'test'
    const tgMsgId = await mapper.findTgMsgId(7, BigInt(20002), '123')
    expect(tgMsgId).toBeUndefined()
    expect(db.execute).toHaveBeenCalledTimes(1)
  })

  it('falls back to sender lookup for numeric QQ ids', async () => {
    (db.execute as any).mockResolvedValueOnce(queryResult()).mockResolvedValueOnce(queryResult([{ tgMsgId: BigInt(555) }]))
    const tgMsgId = await mapper.findTgMsgId(7, BigInt(20002), '123', 'private')
    expect(tgMsgId).toBe(BigInt(555))
    expect(db.execute).toHaveBeenCalledTimes(2)
    expect(loggerMocks.debug).toHaveBeenCalledWith('Finding TG Msg ID by sender: instanceId=7, qqRoomId=20002, sender=123')
  })

  it('returns undefined for non-numeric QQ ids without issuing queries', async () => {
    const tgMsgId = await mapper.findTgMsgId(7, BigInt(20002), 'abc')
    expect(tgMsgId).toBeUndefined()
    expect(db.execute).not.toHaveBeenCalled()
    expect(loggerMocks.debug).toHaveBeenCalledWith('TG Msg ID not found for reply')
  })

  it('finds and normalizes QQ source rows by TG message id', async () => {
    (db.execute as any).mockResolvedValueOnce(queryResult([{ seq: 123, rand: '456', pktnum: 2, qqRoomId: '20002', qqChatType: 'private', qqSenderId: '10001', time: 1_700_000_500 }]))
    const source = await mapper.findQqSource(7, BigInt(-10040004), BigInt(77))
    expect(source).toEqual({ seq: 123, rand: BigInt(456), pktnum: 2, qqRoomId: BigInt(20002), qqChatType: 'private', qqSenderId: BigInt(10001), time: 1_700_000_500 })
  })

  it('defaults missing QQ source chat type to group and preserves absent ids', async () => {
    (db.execute as any).mockResolvedValueOnce(queryResult([{ seq: 123, qqChatType: 'unknown' }]))
    const source = await mapper.findQqSource(7, BigInt(-10040004), BigInt(77))
    expect(source as any).toEqual({ seq: 123, qqChatType: 'group', qqRoomId: undefined, qqSenderId: undefined })
  })

  it('returns undefined when QQ source is not found', async () => {
    (db.execute as any).mockResolvedValueOnce(queryResult())
    const source = await mapper.findQqSource(7, BigInt(-10040004), BigInt(77))
    expect(source).toBeUndefined()
    expect(loggerMocks.debug).toHaveBeenCalledWith('Found QQ source: no (seq=undefined)')
  })
})
