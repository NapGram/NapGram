import { definePlugin } from '@napgram/sdk'
import type { PluginContext, PluginQqClientLike, PluginRuntimeInstance, PluginTgBotLike } from '@napgram/plugin-kit'
import type { RecallEvent } from '@napgram/message-kit'
import { and, db, eq, schema } from '@napgram/db-kit'
import { env } from '@napgram/env-kit'
import { bindInstanceLifecycle } from '@napgram/plugin-kit'

const CONFIGURED_WORK_MODES = new Set(['personal', 'group', 'public'])

type RecallQqClient = PluginQqClientLike & {
  on: (event: 'recall', listener: (event: RecallEvent) => void | Promise<void>) => unknown
  off?: (event: 'recall', listener: (event: RecallEvent) => void | Promise<void>) => unknown
}

type RecallTgBot = PluginTgBotLike & {
  addDeletedMessageEventHandler: (handler: (update: any) => void | Promise<void>) => void
  removeDeletedMessageEventHandler: (handler: (update: any) => void | Promise<void>) => void
}

type RecallNativeInstance = PluginRuntimeInstance & {
  id: number
  workMode?: string
  qqClient?: RecallQqClient | null
  tgBot?: RecallTgBot | null
}

type RecallInstanceBinding = {
  detach: () => Promise<void>
}

function hasConfiguredWorkMode(instance: PluginRuntimeInstance): boolean {
  return CONFIGURED_WORK_MODES.has(String(instance.workMode || '').trim())
}

function recallEventChatType(event: RecallEvent): 'private' | 'group' {
  return (event as any).chatType === 'private' ? 'private' : 'group'
}

function toBigIntValue(value: unknown): bigint | undefined {
  if (value === null || value === undefined) {
    return undefined
  }

  try {
    if (typeof value === 'bigint') {
      return value
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return BigInt(value)
    }
    if (typeof value === 'string' && value.trim()) {
      return BigInt(value)
    }

    const text = (value as any)?.toString?.()
    if (typeof text === 'string' && /^-?\d+$/.test(text.trim())) {
      return BigInt(text.trim())
    }
  }
  catch {
    return undefined
  }

  return undefined
}

function normalizeTelegramDeleteUpdate(update: any): { chatId: bigint, messageIds: bigint[] } | undefined {
  const chatId = toBigIntValue(
    update?.channelId
      ?? update?.chatId
      ?? update?.peer?.channelId
      ?? update?.peer?.chatId
      ?? update?.peerId,
  )

  const rawMessageIds = update?.messageIds ?? update?.messages ?? update?.deletedIds
  if (!chatId || !Array.isArray(rawMessageIds)) {
    return undefined
  }

  const messageIds = rawMessageIds
    .map(toBigIntValue)
    .filter((id): id is bigint => id !== undefined)

  if (!messageIds.length) {
    return undefined
  }

  return { chatId, messageIds }
}

function createInstanceRecallBinding(
  ctx: PluginContext,
  instance: RecallNativeInstance,
): RecallInstanceBinding | null {
  const qqClient = instance.qqClient ?? undefined
  const tgBot = instance.tgBot ?? undefined

  if (!qqClient || !tgBot) {
    ctx.logger.debug({ instanceId: instance.id }, 'Recall plugin skipped: instance clients not ready')
    return null
  }

  if (typeof qqClient.on !== 'function' || typeof qqClient.off !== 'function') {
    ctx.logger.warn({ instanceId: instance.id }, 'Recall plugin skipped: QQ client does not expose recall events')
    return null
  }

  if (typeof tgBot.addDeletedMessageEventHandler !== 'function' || typeof tgBot.removeDeletedMessageEventHandler !== 'function') {
    ctx.logger.warn({ instanceId: instance.id }, 'Recall plugin skipped: Telegram client does not expose delete handlers')
    return null
  }

  const handleQQRecall = async (event: RecallEvent) => {
    try {
      if (!hasConfiguredWorkMode(instance)) {
        return
      }

      ctx.logger.info(`QQ message recalled: ${event.messageId}`)

      if (!env.ENABLE_AUTO_RECALL) {
        ctx.logger.debug('Auto recall is disabled, skipping TG message deletion')
        return
      }

      const qqChatType = recallEventChatType(event)
      const dbEntry = await db.query.message.findFirst({
        where: and(
          eq(schema.message.instanceId, instance.id),
          eq(schema.message.qqRoomId, BigInt(event.chatId)),
          eq(schema.message.qqChatType, qqChatType),
          eq(schema.message.seq, Number(event.messageId)),
        ),
      })

      if (!dbEntry) {
        ctx.logger.debug(`No corresponding TG message found for QQ message: ${event.messageId}`)
        return
      }

      try {
        const chat = await tgBot.getChat?.(Number(dbEntry.tgChatId))
        if (!chat || typeof chat.deleteMessages !== 'function') {
          throw new Error('Telegram chat deleteMessages not available on instance')
        }
        await chat.deleteMessages([Number(dbEntry.tgMsgId)])
        ctx.logger.info(`TG message ${dbEntry.tgMsgId} deleted successfully`)
      }
      catch (error) {
        ctx.logger.error(error, 'Failed to delete TG message:')
      }

      await db.update(schema.message)
        .set({ ignoreDelete: true })
        .where(eq(schema.message.id, dbEntry.id))
    }
    catch (error) {
      ctx.logger.error(error, 'Failed to handle QQ recall:')
    }
  }

  const handleTGDelete = async (update: any) => {
    try {
      if (!hasConfiguredWorkMode(instance)) {
        return
      }

      const normalized = normalizeTelegramDeleteUpdate(update)
      if (!normalized) {
        ctx.logger.debug('Invalid delete update: chatId/messageIds are missing or invalid')
        return
      }

      const { chatId, messageIds } = normalized
      ctx.logger.info(`TG messages deleted in ${chatId}: ${messageIds.join(', ')}`)

      if (!env.ENABLE_AUTO_RECALL) {
        ctx.logger.debug('Auto recall disabled, skipping QQ message recall')
        return
      }

      for (const tgMsgId of messageIds) {
        try {
          const dbEntry = await db.query.message.findFirst({
            where: and(
              eq(schema.message.instanceId, instance.id),
              eq(schema.message.tgChatId, chatId),
              eq(schema.message.tgMsgId, tgMsgId),
            ),
          })

          if (!dbEntry) {
            ctx.logger.debug(`No corresponding QQ message found for TG message: ${tgMsgId}`)
            continue
          }

          if (!dbEntry.seq) {
            ctx.logger.debug(`No seq found for TG message: ${tgMsgId}`)
            continue
          }

          try {
            if (typeof qqClient.recallMessage !== 'function') {
              throw new Error('QQ client recallMessage API not available')
            }
            await qqClient.recallMessage(String(dbEntry.seq))
            ctx.logger.info(`QQ message ${dbEntry.seq} recalled after TG message ${tgMsgId} deleted`)
          }
          catch (error) {
            ctx.logger.warn(error, `Failed to recall QQ message ${dbEntry.seq}:`)
          }
        }
        catch (error) {
          ctx.logger.error(error, `Failed to process deleted TG message ${tgMsgId}:`)
        }
      }
    }
    catch (error) {
      ctx.logger.error(error, 'Failed to handle TG delete:')
    }
  }

  qqClient.on('recall', handleQQRecall)
  tgBot.addDeletedMessageEventHandler(handleTGDelete)

  ctx.logger.info({ instanceId: instance.id }, 'Recall plugin attached')

  return {
    detach: async () => {
      qqClient.off?.('recall', handleQQRecall)
      tgBot.removeDeletedMessageEventHandler?.(handleTGDelete)
      ctx.logger.info({ instanceId: instance.id }, 'Recall plugin detached')
    },
  }
}

const plugin = definePlugin({
  id: 'recall',
  name: 'Recall Plugin',
  version: '2.0.0',
  author: 'NapGram Team',
  description: 'Synchronizes QQ and Telegram message recalls',

  permissions: {
    instances: [],
  },

  install: async (ctx: PluginContext) => {
    ctx.logger.info('Recall plugin installed')

    const bindings = new Map<number, RecallInstanceBinding>()

    const lifecycle = await bindInstanceLifecycle<RecallNativeInstance>(ctx, {
      attach: async (instance) => {
        const instanceId = Number(instance.id ?? 0)
        if (bindings.has(instanceId)) {
          return false
        }

        const binding = createInstanceRecallBinding(ctx, instance)
        if (!binding) {
          return false
        }

        bindings.set(instanceId, binding)
        return true
      },
      detach: async (instance) => {
        const instanceId = Number(instance.id ?? 0)
        const binding = bindings.get(instanceId)
        if (!binding) {
          return
        }

        await binding.detach()
        bindings.delete(instanceId)
      },
    })

    ctx.onUnload(async () => {
      await lifecycle.dispose()
      bindings.clear()
    })
  },
})

export default plugin
