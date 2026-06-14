import type { FastifyInstance, FastifyRequest } from 'fastify'
import { authMiddleware } from '@napgram/auth-kit'
import { processNestedForward } from '@napgram/message-kit'
import { TTLCache } from './web-cache.js'
import {
  getLogger,
  and,
  count,
  db,
  desc,
  eq,
  like,
  lt,
  or,
  schema,
} from './web-deps.js'
import { ErrorResponses } from './web-http.js'
import { createMessageBridgeContext } from './runtime-context.js'

const forwardCache = new TTLCache<string, any>(60000) // 1 minute TTL
const tgSenderNameCache = new TTLCache<string, string | null>(5 * 60 * 1000)
const tgSenderNameInflight = new Map<string, Promise<string | null>>()
const logger = getLogger('MessagesApi')

const normalizeTgSenderName = (chat: any): string | null => {
  const title = typeof chat?.title === 'string' ? chat.title.trim() : ''
  const displayName = typeof chat?.displayName === 'string' ? chat.displayName.trim() : ''
  const firstName = typeof chat?.firstName === 'string' ? chat.firstName.trim() : ''
  const lastName = typeof chat?.lastName === 'string' ? chat.lastName.trim() : ''
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim()
  const username = typeof chat?.username === 'string' && chat.username ? `@${chat.username}` : ''
  const name = title || displayName || fullName || username
  return name || null
}

export default async function (fastify: FastifyInstance) {
  const messageBridgeContext = createMessageBridgeContext(fastify)
  const resolveTgSenderName = async (instanceId: number, senderId: string): Promise<string | null> => {
    const cacheKey = `${instanceId}:${senderId}`
    const cached = tgSenderNameCache.get(cacheKey)
    if (cached !== undefined)
      return cached

    const inflight = tgSenderNameInflight.get(cacheKey)
    if (inflight)
      return inflight

    const task = (async () => {
      const instance = messageBridgeContext.getInstance(instanceId)
      const bot = (instance as any)?.tgBot
      if (!bot?.getChat) {
        tgSenderNameCache.set(cacheKey, null, 60000)
        return null
      }
      const botMe = (bot as any)?.me
      const botId = botMe?.id ? String(botMe.id) : ''
      if (botId && botId === senderId) {
        const name = normalizeTgSenderName(botMe)
        tgSenderNameCache.set(cacheKey, name)
        return name
      }
      try {
        const numericId = Number(senderId)
        const chatId = Number.isNaN(numericId) ? senderId : numericId
        const chat = await bot.getChat(chatId)
        const name = normalizeTgSenderName(chat)
        tgSenderNameCache.set(cacheKey, name)
        return name
      }
      catch (error) {
        logger.debug({ error, senderId, instanceId }, 'Failed to resolve TG sender name')
        tgSenderNameCache.set(cacheKey, null, 60000)
        return null
      }
      finally {
        tgSenderNameInflight.delete(cacheKey)
      }
    })()

    tgSenderNameInflight.set(cacheKey, task)
    return task
  }

  const resolveQqBotIdentity = (instanceId: number): { id: string | null, name: string | null } => {
    const instance = messageBridgeContext.getInstance(instanceId)
    const qqClient = (instance as any)?.qqClient
    const rawId = qqClient?.uin
    const id = rawId !== undefined && rawId !== null ? String(rawId) : null
    const name = typeof qqClient?.nickname === 'string' ? qqClient.nickname : null
    return { id, name }
  }

  // 管理端 - 消息列表
  fastify.get('/api/admin/messages', {
    preHandler: authMiddleware,
  }, async (request: FastifyRequest) => {
    const { page = 1, limit = 20, search, from, to, sortBy = 'id', sortDir = 'desc' } = request.query as any
    const take = Math.min(1000, Math.max(Number.parseInt(String(limit)) || 20, 1))
    const skip = (Math.max(Number.parseInt(String(page)) || 1, 1) - 1) * take

    const where: any = {}
    const filters: any[] = []

    if (search) {
      const trimmed = String(search).trim()
      if (trimmed) {
        filters.push(or(
          like(schema.message.brief, `%${trimmed}%`),
          like(schema.message.tgMessageText, `%${trimmed}%`),
          like(schema.message.nick, `%${trimmed}%`)
        ))
      }
    }

    const whereCond = filters.length > 0 ? (filters.length === 1 ? filters[0] : and(...filters)) : undefined
    const orderByColumn = sortBy === 'time' ? schema.message.time : schema.message.id
    const orderBy = sortDir === 'asc' ? orderByColumn : desc(orderByColumn)

    const [items, totalResult] = await Promise.all([
      db.query.message.findMany({
        where: whereCond,
        limit: take,
        offset: skip,
        orderBy: [orderBy],
      }),
      db.select({ value: count() }).from(schema.message).where(whereCond),
    ])

    const total = totalResult[0].value

    const itemsWithNames = await Promise.all(items.map(async (item: any) => {
      const tgSenderId = item.tgSenderId?.toString() || null
      const tgSenderName = tgSenderId ? await resolveTgSenderName(item.instanceId, tgSenderId) : null
      const qqSenderId = item.qqSenderId.toString()
      const botIdentity = qqSenderId === '0' ? resolveQqBotIdentity(item.instanceId) : { id: null, name: null }
      return {
        ...item,
        qqRoomId: item.qqRoomId.toString(),
        qqSenderId,
        qqSenderIdResolved: botIdentity.id,
        qqSenderName: botIdentity.name,
        tgChatId: item.tgChatId.toString(),
        rand: item.rand.toString(),
        tgFileId: item.tgFileId?.toString() || null,
        tgSenderId,
        tgSenderName,
      }
    }))

    return {
      code: 0,
      data: {
        total,
        items: itemsWithNames,
      },
    }
  })

  // 补发/重试转发
  fastify.post('/api/admin/messages/retry', {
    preHandler: authMiddleware,
  }, async (request: FastifyRequest, reply) => {
    const { messageId } = request.body as any
    if (!messageId) {
      return ErrorResponses.badRequest(reply, 'messageId is required')
    }

    const msg = await db.query.message.findFirst({
      where: eq(schema.message.id, messageId),
    })

    if (!msg) {
      return ErrorResponses.notFound(reply, 'Message not found')
    }

    try {
      // 这里的逻辑需要根据业务需求实现具体的补发
      // 目前简单返回成功
      return { code: 0, message: 'Retry initiated' }
    }
    catch (error) {
      logger.error(error, `Failed to retry message ${messageId}`)
      return ErrorResponses.internalError(reply, 'Failed to retry message')
    }
  })

  // 转发搜索/预览
  fastify.post('/api/admin/messages/forward-preview', {
    preHandler: authMiddleware,
  }, async (request: FastifyRequest, reply) => {
    const { content } = request.body as any

    try {
      await processNestedForward(content, 0)
      return { code: 0, data: content }
    }
    catch (error) {
      return ErrorResponses.internalError(reply, 'Forward preview failed')
    }
  })
}
