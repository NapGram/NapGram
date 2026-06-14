import type { UnifiedMessage } from '@napgram/message-kit'
import type { ForwardMap, ForwardPairRecord } from '../../../runtime-types.js'
import { randomUUID } from 'node:crypto'
import { db, sql } from '../../../capabilities/db.js'
import { getLogger } from '../../../capabilities/logging.js'

const logger = getLogger('ForwardPairChatType')

export type QqChatType = 'group' | 'private'

export interface TypedForwardPair extends ForwardPairRecord {
  qqChatType: QqChatType
  qqDisplayName?: string | null
  tgProvisionedByUserSessionId?: number | null
  autoCreated?: boolean
}

export interface ForwardPairMetadata {
  qqDisplayName?: string | null
  tgProvisionedByUserSessionId?: number | null
  autoCreated?: boolean
  forwardMode?: string | null
  nicknameMode?: string | null
}

const CHAT_TYPE_ALIASES: Record<string, QqChatType> = {
  group: 'group',
  groups: 'group',
  qqgroup: 'group',
  群: 'group',
  群聊: 'group',
  friend: 'private',
  friends: 'private',
  private: 'private',
  qqfriend: 'private',
  好友: 'private',
  私聊: 'private',
}

function isMissingPersonalModeColumn(error: unknown): boolean {
  const message = String((error as any)?.message || error)
  return /qqChatType|qqDisplayName|tgProvisionedByUserSessionId|autoCreated/i.test(message)
    && /does not exist|不存在|no such column/i.test(message)
}

function bigintOrNull(value: unknown): bigint | null {
  return value === null || value === undefined ? null : BigInt(value as any)
}

function numberOrNull(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value)
}

function normalizeRawPair(row: any): TypedForwardPair {
  return {
    id: Number(row.id),
    qqRoomId: BigInt(row.qqRoomId),
    tgChatId: BigInt(row.tgChatId),
    tgThreadId: bigintOrNull(row.tgThreadId),
    flags: Number(row.flags ?? 0),
    instanceId: Number(row.instanceId),
    apiKey: String(row.apiKey ?? ''),
    ignoreRegex: row.ignoreRegex ?? null,
    ignoreSenders: row.ignoreSenders ?? null,
    forwardMode: row.forwardMode ?? null,
    nicknameMode: row.nicknameMode ?? null,
    commandReplyMode: row.commandReplyMode ?? null,
    commandReplyFilter: row.commandReplyFilter ?? null,
    commandReplyList: row.commandReplyList ?? null,
    qqChatType: normalizeQqChatType(row.qqChatType),
    qqDisplayName: row.qqDisplayName ?? null,
    tgProvisionedByUserSessionId: numberOrNull(row.tgProvisionedByUserSessionId),
    autoCreated: Boolean(row.autoCreated ?? false),
  }
}

function attachChatType(pair: ForwardPairRecord, chatType: QqChatType): TypedForwardPair {
  const typed = pair as TypedForwardPair
  typed.qqChatType = chatType
  return typed
}

async function executeRows<T = any>(query: any): Promise<T[]> {
  const res = await db.execute(query)
  return ((res as any)?.rows ?? []) as T[]
}

async function selectPairById(pairId: number): Promise<TypedForwardPair | undefined> {
  const rows = await executeRows(sql`
    SELECT
      "id",
      "qqRoomId",
      "tgChatId",
      "tgThreadId",
      "instanceId",
      "flags",
      "apiKey",
      "ignoreRegex",
      "ignoreSenders",
      "forwardMode",
      "nicknameMode",
      "commandReplyMode",
      "commandReplyFilter",
      "commandReplyList",
      "qqChatType",
      "qqDisplayName",
      "tgProvisionedByUserSessionId",
      "autoCreated"
    FROM "ForwardPair"
    WHERE "id" = ${pairId}
    LIMIT 1
  `)
  return rows[0] ? normalizeRawPair(rows[0]) : undefined
}

async function selectPairByQQ(
  instanceId: number,
  qqRoomId: string | number | bigint,
  chatType: QqChatType,
): Promise<TypedForwardPair | undefined> {
  const rows = await executeRows(sql`
    SELECT
      "id",
      "qqRoomId",
      "tgChatId",
      "tgThreadId",
      "instanceId",
      "flags",
      "apiKey",
      "ignoreRegex",
      "ignoreSenders",
      "forwardMode",
      "nicknameMode",
      "commandReplyMode",
      "commandReplyFilter",
      "commandReplyList",
      "qqChatType",
      "qqDisplayName",
      "tgProvisionedByUserSessionId",
      "autoCreated"
    FROM "ForwardPair"
    WHERE "instanceId" = ${instanceId}
      AND "qqChatType" = ${chatType}
      AND "qqRoomId" = ${BigInt(qqRoomId)}
    LIMIT 1
  `)
  return rows[0] ? normalizeRawPair(rows[0]) : undefined
}

function findLoadedPairById(forwardMap: ForwardMap, pairId: number): ForwardPairRecord | undefined {
  const all = typeof (forwardMap as any).getAll === 'function' ? (forwardMap as any).getAll() : []
  return Array.isArray(all) ? all.find((pair: ForwardPairRecord) => pair.id === pairId) : undefined
}

export function normalizeQqChatType(value: unknown): QqChatType {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase().replace(/[\s_-]/g, '')
    return CHAT_TYPE_ALIASES[normalized] ?? 'group'
  }
  return 'group'
}

export function parseQqChatType(value: unknown): QqChatType | undefined {
  if (typeof value !== 'string')
    return undefined
  const normalized = value.trim().toLowerCase().replace(/[\s_-]/g, '')
  return CHAT_TYPE_ALIASES[normalized]
}

export function qqChatTypeFromMessage(msg: UnifiedMessage): QqChatType {
  return msg.chat.type === 'private' ? 'private' : 'group'
}

export function qqChatTypeToMessageChatType(chatType: QqChatType): 'private' | 'group' {
  return chatType === 'private' ? 'private' : 'group'
}

export function formatQqChatTypeLabel(chatType: QqChatType): string {
  return chatType === 'private' ? 'QQ 好友' : 'QQ 群'
}

export async function getForwardPairChatType(pair: ForwardPairRecord | undefined | null): Promise<QqChatType> {
  if (!pair)
    return 'group'

  const existing = (pair as any).qqChatType
  if (existing)
    return normalizeQqChatType(existing)

  try {
    const typed = await selectPairById(pair.id)
    if (typed)
      return attachChatType(pair, typed.qqChatType).qqChatType
  }
  catch (error) {
    if (!isMissingPersonalModeColumn(error))
      logger.debug(error, `Failed to read qqChatType for pair ${pair.id}`)
  }

  return 'group'
}

export async function findPairByTGWithChatType(
  forwardMap: ForwardMap,
  tgChatId: string | number | bigint,
  tgThreadId: bigint | undefined,
  allowFallback: boolean,
): Promise<TypedForwardPair | undefined> {
  const pair = forwardMap.findByTG(tgChatId, tgThreadId, allowFallback)
  if (!pair)
    return undefined

  const chatType = await getForwardPairChatType(pair)
  return attachChatType(pair, chatType)
}

export async function findPairByQQWithChatType(
  forwardMap: ForwardMap,
  instanceId: number,
  qqRoomId: string | number | bigint,
  chatType: QqChatType,
): Promise<TypedForwardPair | undefined> {
  try {
    const rawPair = await selectPairByQQ(instanceId, qqRoomId, chatType)
    if (rawPair) {
      const loadedPair = findLoadedPairById(forwardMap, rawPair.id)
      return loadedPair ? attachChatType(loadedPair, rawPair.qqChatType) : rawPair
    }
  }
  catch (error) {
    if (!isMissingPersonalModeColumn(error))
      logger.debug(error, `Failed to find ${chatType} pair by QQ ${qqRoomId}`)
  }

  if (chatType !== 'group')
    return undefined

  const fallback = forwardMap.findByQQ(qqRoomId)
  return fallback ? attachChatType(fallback, 'group') : undefined
}

export async function addForwardPairWithChatType(
  forwardMap: ForwardMap,
  instanceId: number,
  qqRoomId: string | number | bigint,
  tgChatId: string | number | bigint,
  tgThreadId: bigint | undefined,
  chatType: QqChatType,
  metadata: ForwardPairMetadata = {},
): Promise<TypedForwardPair> {
  const normalizedThreadId = tgThreadId ?? null
  const existingByTG = await findPairByTGWithChatType(forwardMap, tgChatId, tgThreadId, false)
  const existingByQQ = await findPairByQQWithChatType(forwardMap, instanceId, qqRoomId, chatType)

  if (existingByTG && (!existingByQQ || existingByTG.id !== existingByQQ.id)) {
    return existingByTG
  }

  try {
    if (existingByQQ) {
      await db.execute(sql`
        UPDATE "ForwardPair"
        SET
          "tgChatId" = ${BigInt(tgChatId)},
          "tgThreadId" = ${normalizedThreadId},
          "qqChatType" = ${chatType},
          "qqDisplayName" = ${metadata.qqDisplayName ?? existingByQQ.qqDisplayName ?? null},
          "tgProvisionedByUserSessionId" = ${metadata.tgProvisionedByUserSessionId ?? existingByQQ.tgProvisionedByUserSessionId ?? null},
          "autoCreated" = ${metadata.autoCreated ?? existingByQQ.autoCreated ?? false},
          "forwardMode" = ${metadata.forwardMode ?? existingByQQ.forwardMode ?? null},
          "nicknameMode" = ${metadata.nicknameMode ?? existingByQQ.nicknameMode ?? null}
        WHERE "id" = ${existingByQQ.id}
      `)
    }
    else {
      await db.execute(sql`
        INSERT INTO "ForwardPair" (
          "qqRoomId",
          "tgChatId",
          "tgThreadId",
          "instanceId",
          "qqChatType",
          "qqDisplayName",
          "tgProvisionedByUserSessionId",
          "autoCreated",
          "forwardMode",
          "nicknameMode",
          "apiKey"
        )
        VALUES (
          ${BigInt(qqRoomId)},
          ${BigInt(tgChatId)},
          ${normalizedThreadId},
          ${instanceId},
          ${chatType},
          ${metadata.qqDisplayName ?? null},
          ${metadata.tgProvisionedByUserSessionId ?? null},
          ${metadata.autoCreated ?? false},
          ${metadata.forwardMode ?? null},
          ${metadata.nicknameMode ?? null},
          ${randomUUID()}
        )
      `)
    }

    await forwardMap.reload()
    const rec = await findPairByTGWithChatType(forwardMap, tgChatId, tgThreadId, false)
    if (!rec)
      throw new Error('绑定失败：操作未生效，请重试')
    return rec
  }
  catch (error) {
    if (isMissingPersonalModeColumn(error)) {
      if (chatType === 'group') {
        const rec = await forwardMap.add(qqRoomId, tgChatId, tgThreadId)
        return attachChatType(rec, 'group')
      }
      throw new Error('数据库尚未应用个人模式迁移，无法绑定 QQ 好友')
    }
    throw error
  }
}

export async function removeForwardPairById(forwardMap: ForwardMap, pairId: number): Promise<boolean> {
  const res = await db.execute(sql`
    DELETE FROM "ForwardPair"
    WHERE "id" = ${pairId}
  `)
  await forwardMap.reload()
  return Number((res as any)?.rowCount ?? 0) > 0
}
