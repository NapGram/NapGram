import type { MessageContent, UnifiedMessage } from '@napgram/message-kit'
import process from 'node:process'
import { db, getLogger, sql } from '../../../shared-types.js'
import { renderContent } from '../utils/render.js'

type QqChatType = 'private' | 'group'

interface MessageInsertValues {
  qqChatType: QqChatType
  qqRoomId: bigint
  qqSenderId: bigint
  time: number
  seq: number
  rand: bigint
  pktnum: number
  tgChatId: bigint
  tgMsgId: bigint
  tgSenderId: bigint
  instanceId: number
  nick?: string | null
  brief: string
}

export class ForwardMapper {
  private readonly logger = getLogger('ForwardFeature')

  constructor(
    private readonly contentRenderer: (content: MessageContent) => string = renderContent,
  ) { }

  private shouldSkipPersistence() {
    // Avoid touching the real database when running under Vitest/Node test runs
    return process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST)
  }

  private getQqChatTypeFromPair(pair: any): QqChatType {
    return pair?.qqChatType === 'private' ? 'private' : 'group'
  }

  private getQqChatTypeFromMessage(msg: UnifiedMessage): QqChatType {
    return msg.chat?.type === 'private' ? 'private' : 'group'
  }

  private async executeRows<T = any>(query: any): Promise<T[]> {
    const res = await db.execute(query)
    return ((res as any)?.rows ?? []) as T[]
  }

  private async insertMessage(values: MessageInsertValues): Promise<void> {
    await db.execute(sql`
      INSERT INTO "Message" (
        "qqChatType",
        "qqRoomId",
        "qqSenderId",
        "time",
        "seq",
        "rand",
        "pktnum",
        "tgChatId",
        "tgMsgId",
        "tgSenderId",
        "instanceId",
        "nick",
        "brief"
      )
      VALUES (
        ${values.qqChatType},
        ${values.qqRoomId},
        ${values.qqSenderId},
        ${values.time},
        ${values.seq},
        ${values.rand},
        ${values.pktnum},
        ${values.tgChatId},
        ${values.tgMsgId},
        ${values.tgSenderId},
        ${values.instanceId},
        ${values.nick ?? null},
        ${values.brief}
      )
    `)
  }

  async saveTgToQqMapping(unified: UnifiedMessage, tgMsg: any, receipt: any, pair: any) {
    if (this.shouldSkipPersistence()) {
      return
    }
    const msgId = receipt?.messageId || receipt?.data?.message_id || receipt?.id
    if (!msgId) {
      this.logger.warn('TG->QQ forwarded but no messageId in receipt, cannot save mapping.')
      return
    }
    try {
      const nick = unified.sender?.name || tgMsg?.sender?.name || tgMsg?.sender?.username || tgMsg?.sender?.displayName || null
      await this.insertMessage({
        qqChatType: this.getQqChatTypeFromPair(pair),
        qqRoomId: pair.qqRoomId,
        qqSenderId: BigInt(0),
        time: Math.floor(Date.now() / 1000),
        seq: Number(msgId),
        rand: BigInt(0),
        pktnum: 0,
        tgChatId: BigInt(pair.tgChatId),
        tgMsgId: BigInt(tgMsg.id),
        tgSenderId: BigInt(tgMsg.sender?.id || 0),
        instanceId: pair.instanceId,
        nick,
        brief: unified.content.map(c => this.contentRenderer(c)).join(' ').slice(0, 50),
      })
      this.logger.debug(`Saved TG->QQ mapping: seq=${msgId} <-> tgMsgId=${tgMsg.id}`)
    }
    catch (e) {
      this.logger.warn(e, 'Failed to save TG->QQ message mapping:')
    }
  }

  async saveMessage(qqMsg: UnifiedMessage, tgMsg: any, instanceId: number, qqRoomId: bigint, tgChatId: bigint) {
    if (this.shouldSkipPersistence()) {
      return
    }
    try {
      const raw = qqMsg.metadata?.raw || {}
      const rawSender = raw?.sender || {}
      const card = typeof rawSender.card === 'string' ? rawSender.card.trim() : ''
      const nickname = typeof rawSender.nickname === 'string' ? rawSender.nickname.trim() : ''
      const senderName = typeof qqMsg.sender?.name === 'string' ? qqMsg.sender.name.trim() : ''
      const nick = card || nickname || senderName || null
      const seq = raw.message_id || raw.seq || 0
      const rand = raw.rand || 0
      const time = Math.floor(qqMsg.timestamp / 1000)
      const qqSenderId = BigInt(qqMsg.sender?.id ?? 0)
      const tgMsgId = tgMsg?.id ?? 0
      const tgSenderId = BigInt(tgMsg?.sender?.id ?? 0)

      await this.insertMessage({
        qqChatType: this.getQqChatTypeFromMessage(qqMsg),
        qqRoomId,
        qqSenderId,
        time,
        seq,
        rand: BigInt(rand),
        pktnum: 0,
        tgChatId,
        tgMsgId: BigInt(tgMsgId),
        tgSenderId,
        instanceId,
        nick,
        brief: qqMsg.content.map(c => this.contentRenderer(c)).join(' ').slice(0, 50),
      })
    }
    catch (e) {
      this.logger.warn(e, 'Failed to save message mapping:')
    }
  }

  async findTgMsgId(instanceId: number, qqRoomId: bigint, qqMsgId: string, qqChatType: QqChatType = 'group'): Promise<bigint | undefined> {
    const numericId = Number(qqMsgId)
    if (!Number.isNaN(numericId)) {
      this.logger.debug(`Finding TG Msg ID by seq: instanceId=${instanceId}, qqRoomId=${qqRoomId}, seq=${numericId}`)
      const bySeq = (await this.executeRows<{ tgMsgId: string | number | bigint }>(sql`
        SELECT "tgMsgId"
        FROM "Message"
        WHERE "instanceId" = ${instanceId}
          AND "qqChatType" = ${qqChatType}
          AND "qqRoomId" = ${qqRoomId}
          AND "seq" = ${numericId}
        LIMIT 1
      `))[0]
      if (bySeq) {
        this.logger.debug(`Found TG Msg ID by seq: ${bySeq.tgMsgId}`)
        return BigInt(bySeq.tgMsgId)
      }
    }

    if (this.shouldSkipPersistence()) {
      return undefined
    }

    if (!Number.isNaN(numericId)) {
      const senderId = BigInt(numericId)
      this.logger.debug(`Finding TG Msg ID by sender: instanceId=${instanceId}, qqRoomId=${qqRoomId}, sender=${senderId}`)
      const bySender = (await this.executeRows<{ tgMsgId: string | number | bigint }>(sql`
        SELECT "tgMsgId"
        FROM "Message"
        WHERE "instanceId" = ${instanceId}
          AND "qqChatType" = ${qqChatType}
          AND "qqRoomId" = ${qqRoomId}
          AND "qqSenderId" = ${senderId}
        ORDER BY "time" DESC
        LIMIT 1
      `))[0]
      if (bySender) {
        this.logger.debug(`Found TG Msg ID by sender: ${bySender.tgMsgId}`)
        return BigInt(bySender.tgMsgId)
      }
    }

    this.logger.debug('TG Msg ID not found for reply')
    return undefined
  }

  async findQqSource(instanceId: number, tgChatId: bigint, tgMsgId: bigint) {
    if (this.shouldSkipPersistence()) {
      return undefined
    }
    this.logger.debug(`Finding QQ source: instanceId=${instanceId}, tgChatId=${tgChatId}, tgMsgId=${tgMsgId}`)
    const msg = (await this.executeRows<{
      seq?: number
      qqRoomId?: string | number | bigint
      qqChatType?: string
      qqSenderId?: string | number | bigint
      time?: number
    }>(sql`
      SELECT "seq", "qqRoomId", "qqChatType", "qqSenderId", "time"
      FROM "Message"
      WHERE "tgChatId" = ${BigInt(tgChatId)}
        AND "tgMsgId" = ${tgMsgId}
        AND "instanceId" = ${instanceId}
      LIMIT 1
    `))[0]
    this.logger.debug(`Found QQ source: ${msg ? 'yes' : 'no'} (seq=${msg?.seq})`)
    return msg
      ? {
          ...msg,
          qqRoomId: msg.qqRoomId === undefined ? undefined : BigInt(msg.qqRoomId),
          qqChatType: msg.qqChatType === 'private' ? 'private' : 'group',
          qqSenderId: msg.qqSenderId === undefined ? undefined : BigInt(msg.qqSenderId),
        }
      : undefined
  }
}
