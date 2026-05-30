import db, { schema, eq } from '../db.js'
import { getLogger } from '@napgram/logger-kit'

const logger = getLogger('ForwardMap')

export type QqChatType = 'private' | 'group'

export interface QqChatTarget {
  type?: QqChatType
  id: string | number | bigint
}

export interface AddForwardPairInput {
  qqChatType?: QqChatType
  qqRoomId: string | number | bigint
  qqDisplayName?: string | null
  tgChatId: string | number | bigint
  tgThreadId?: bigint | null
  tgProvisionedByUserSessionId?: number | null
  autoCreated?: boolean
  forwardMode?: string | null
  nicknameMode?: string | null
}

export interface ForwardPairRecord {
  id: number
  qqChatType?: QqChatType
  qqRoomId: bigint
  qqDisplayName?: string | null
  tgChatId: bigint
  tgThreadId?: bigint | null
  tgProvisionedByUserSessionId?: number | null
  autoCreated?: boolean
  flags: number
  instanceId: number
  apiKey: string
  ignoreRegex?: string | null
  ignoreSenders?: string | null
  forwardMode?: string | null
  nicknameMode?: string | null
  commandReplyMode?: string | null
  commandReplyFilter?: string | null
  commandReplyList?: string | null
}

export class ForwardMap {
  private byQQ = new Map<string, ForwardPairRecord>()
  private byTG = new Map<string, ForwardPairRecord>()

  private constructor(
    pairs: ForwardPairRecord[],
    private readonly instanceId: number,
  ) {
    for (const pair of pairs) {
      const rec = this.normalizePairRecord(pair)
      this.byQQ.set(this.getQqKey(rec.qqChatType, rec.qqRoomId), rec)
      this.byTG.set(this.getTgKey(rec.tgChatId, rec.tgThreadId), rec)
    }
  }

  static async load(instanceId: number) {
    const rows = await db.select().from(schema.forwardPair).where(eq(schema.forwardPair.instanceId, instanceId))
    return new ForwardMap(rows as ForwardPairRecord[], instanceId)
  }

  async reload() {
    const rows = await db.select().from(schema.forwardPair).where(eq(schema.forwardPair.instanceId, this.instanceId))

    this.byQQ.clear()
    this.byTG.clear()
    for (const pair of rows as any as ForwardPairRecord[]) {
      const rec = this.normalizePairRecord(pair)
      this.byQQ.set(this.getQqKey(rec.qqChatType, rec.qqRoomId), rec)
      this.byTG.set(this.getTgKey(rec.tgChatId, rec.tgThreadId), rec)
    }
  }

  find(target: any) {
    if (!target) return null
    if (typeof target === 'object' && 'type' in target && 'id' in target) return this.findByQQ(target as QqChatTarget)
    if (typeof target === 'object' && 'uin' in target) return this.findByQQ({ type: 'private', id: (target as any).uin })
    if (typeof target === 'object' && 'gid' in target) return this.findByQQ({ type: 'group', id: (target as any).gid })
    if (typeof target === 'object' && 'chat' in target && (target as any).chat?.id) {
      return this.findByQQ({
        type: (target as any).chat.type === 'private' ? 'private' : 'group',
        id: (target as any).chat.id,
      })
    }
    if (typeof target === 'object' && 'id' in target) return this.findByTG((target as any).id)
    return this.findByQQ(target) || this.findByTG(target) || null
  }

  async add(
    qqRoomIdOrInput: string | number | bigint | AddForwardPairInput,
    tgChatId?: string | number | bigint,
    tgThreadId?: bigint,
  ) {
    const input = typeof qqRoomIdOrInput === 'object'
      ? qqRoomIdOrInput
      : { qqRoomId: qqRoomIdOrInput, tgChatId: tgChatId as string | number | bigint, tgThreadId }
    if (input.tgChatId === undefined || input.tgChatId === null) {
      throw new Error('tgChatId is required')
    }

    const qqTarget = this.normalizeQqTarget({
      type: input.qqChatType,
      id: input.qqRoomId,
    })
    const normalizedThreadId = input.tgThreadId ?? null
    const existingByQQ = this.findByQQ(qqTarget)
    const existingByTG = this.findByTG(input.tgChatId, input.tgThreadId ?? undefined, false)

    if (existingByTG && (!existingByQQ || existingByTG.id !== existingByQQ.id)) {
      return existingByTG
    }

    if (existingByQQ) {
      const updateData = {
        tgChatId: BigInt(input.tgChatId),
        tgThreadId: normalizedThreadId,
        ...(input.qqDisplayName !== undefined ? { qqDisplayName: input.qqDisplayName } : {}),
        ...(input.tgProvisionedByUserSessionId !== undefined ? { tgProvisionedByUserSessionId: input.tgProvisionedByUserSessionId } : {}),
        ...(input.autoCreated !== undefined ? { autoCreated: input.autoCreated } : {}),
        ...(input.forwardMode !== undefined ? { forwardMode: input.forwardMode } : {}),
        ...(input.nicknameMode !== undefined ? { nicknameMode: input.nicknameMode } : {}),
      }
      const onlyTargetUnchanged = Object.keys(updateData).length === 2
        && existingByQQ.tgChatId === BigInt(input.tgChatId)
        && (existingByQQ.tgThreadId ?? null) === normalizedThreadId
      if (onlyTargetUnchanged) {
        return existingByQQ
      }

      const updatedArr = await db.update(schema.forwardPair)
        .set(updateData)
        .where(eq(schema.forwardPair.id, existingByQQ.id))
        .returning()
      const rec = this.normalizePairRecord(updatedArr[0] as ForwardPairRecord)
      this.refreshMaps(existingByQQ, rec)
      return rec
    }

    const rowArr = await db.insert(schema.forwardPair)
      .values({
        qqChatType: qqTarget.type,
        qqRoomId: BigInt(qqTarget.id),
        qqDisplayName: input.qqDisplayName ?? null,
        tgChatId: BigInt(input.tgChatId),
        tgThreadId: normalizedThreadId,
        tgProvisionedByUserSessionId: input.tgProvisionedByUserSessionId ?? null,
        autoCreated: input.autoCreated ?? false,
        instanceId: this.instanceId,
        forwardMode: input.forwardMode ?? null,
        nicknameMode: input.nicknameMode ?? null,
      })
      .returning()
    const rec = this.normalizePairRecord(rowArr[0] as ForwardPairRecord)
    this.byQQ.set(this.getQqKey(rec.qqChatType, rec.qqRoomId), rec)
    this.byTG.set(this.getTgKey(rec.tgChatId, rec.tgThreadId), rec)
    return rec
  }

  async remove(target: string | number | bigint | QqChatTarget) {
    const rec = this.find(target)
    if (!rec) return false
    await db.delete(schema.forwardPair).where(eq(schema.forwardPair.id, rec.id))
    this.byQQ.delete(this.getQqKey(rec.qqChatType, rec.qqRoomId))
    this.byTG.delete(this.getTgKey(rec.tgChatId, rec.tgThreadId))
    return true
  }

  async initMapInstance(): Promise<void> {}

  findByQQ(target: string | number | bigint | QqChatTarget): ForwardPairRecord | undefined {
    const qqTarget = this.normalizeQqTarget(target)
    return this.byQQ.get(this.getQqKey(qqTarget.type, qqTarget.id))
  }

  findByTG(tgChatId: string | number | bigint, tgThreadId?: bigint, allowFallback = true): ForwardPairRecord | undefined {
    const key = this.getTgKey(tgChatId, tgThreadId)
    const exact = this.byTG.get(key)

    if (!exact && this.byTG.size > 0) {
      logger.debug(`[ForwardMap] findByTG failed. Key: "${key}", Total keys: ${this.byTG.size}`)
      logger.debug(`[ForwardMap] Available keys: ${Array.from(this.byTG.keys()).join(', ')}`)
    }

    if (exact) return exact
    return allowFallback ? this.byTG.get(String(tgChatId)) : undefined
  }

  getAll() {
    return Array.from(this.byQQ.values())
  }

  private getTgKey(tgChatId: string | number | bigint, tgThreadId?: bigint | null) {
    return tgThreadId ? `${tgChatId}:${tgThreadId}` : String(tgChatId)
  }

  private getQqKey(type: QqChatType = 'group', qqRoomId: string | number | bigint) {
    return `${type}:${this.normalizeQqRoomId(type, qqRoomId)}`
  }

  private normalizeQqTarget(target: string | number | bigint | QqChatTarget): Required<QqChatTarget> {
    if (typeof target === 'object') {
      const type = target.type === 'private' ? 'private' : 'group'
      return {
        type,
        id: this.normalizeQqRoomId(type, target.id),
      }
    }
    return {
      type: 'group',
      id: this.normalizeQqRoomId('group', target),
    }
  }

  private normalizeQqRoomId(type: QqChatType, qqRoomId: string | number | bigint) {
    const raw = BigInt(qqRoomId)
    return type === 'group' && raw < BigInt(0) ? -raw : raw
  }

  private normalizePairRecord(pair: ForwardPairRecord): ForwardPairRecord {
    const type = pair.qqChatType === 'private' ? 'private' : 'group'
    return {
      ...pair,
      qqChatType: type,
      qqRoomId: this.normalizeQqRoomId(type, pair.qqRoomId) as bigint,
      autoCreated: pair.autoCreated ?? false,
      tgProvisionedByUserSessionId: pair.tgProvisionedByUserSessionId ?? null,
    }
  }

  private refreshMaps(oldRec: ForwardPairRecord, newRec: ForwardPairRecord) {
    this.byQQ.delete(this.getQqKey(oldRec.qqChatType, oldRec.qqRoomId))
    this.byQQ.set(this.getQqKey(newRec.qqChatType, newRec.qqRoomId), newRec)
    this.byTG.delete(this.getTgKey(oldRec.tgChatId, oldRec.tgThreadId))
    this.byTG.set(this.getTgKey(newRec.tgChatId, newRec.tgThreadId), newRec)
  }
}

export default ForwardMap
