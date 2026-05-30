import type { ForwardMap, IQQClient, Instance } from '../../../shared-types.js'
import type { TypedForwardPair } from '../../commands/utils/ForwardPairChatType.js'
import { getLogger } from '../../../shared-types.js'
import { Buffer } from 'node:buffer'
import crypto from 'node:crypto'

const logger = getLogger('PersonalSyncService')

function buildQqGroupAvatarUrl(groupId: string, size: 40 | 100 | 140 | 640 = 640) {
  const gid = String(groupId || '').trim()
  return `https://p.qlogo.cn/gh/${gid}/${gid}/${size}/`
}

function buildQqFriendAvatarUrl(userId: string) {
  const uid = String(userId || '').trim()
  return `https://q.qlogo.cn/g?b=qq&nk=${uid}&s=640`
}

async function fetchBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url)
  if (!res.ok)
    throw new Error(`Fetch failed: ${res.status} ${res.statusText}`)
  const ab = await res.arrayBuffer()
  return Buffer.from(ab)
}

export class PersonalSyncService {
  private timer?: NodeJS.Timeout
  private readonly avatarHashCache = new Map<string, string>()

  constructor(
    private readonly instance: Instance,
    private readonly forwardMap: ForwardMap,
    private readonly qqClient: IQQClient,
  ) {}

  public start(intervalMs = 60 * 60 * 1000) {
    if (this.timer)
      return
    this.timer = setInterval(() => this.syncAll().catch(err => logger.error('Sync failed:', err)), intervalMs)
    // Run initial sync after a short delay
    setTimeout(() => this.syncAll().catch(err => logger.error('Sync failed:', err)), 10_000)
    logger.info('PersonalSyncService started')
  }

  public stop() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = undefined
    }
    logger.info('PersonalSyncService stopped')
  }

  public async syncAll() {
    if (this.instance.workMode !== 'personal')
      return

    const userBot = this.instance.tgUserBot
    if (!userBot || !userBot.isOnline)
      return

    logger.debug('Starting personal mode synchronization...')
    const all = typeof (this.forwardMap as any).getAll === 'function' ? (this.forwardMap as any).getAll() : []
    if (!Array.isArray(all))
      return

    for (const pair of all) {
      const typedPair = pair as TypedForwardPair
      if (typedPair.instanceId !== this.instance.id)
        continue

      if (typedPair.qqChatType !== 'private' && !typedPair.autoCreated)
        continue

      try {
        await this.syncPair(typedPair)
      }
      catch (error) {
        logger.warn({ error, pairId: pair.id }, 'Failed to sync pair')
      }
    }
    logger.debug('Personal mode synchronization completed')
  }

  private async syncPair(pair: TypedForwardPair) {
    const tgBot = this.instance.tgBot
    if (!tgBot)
      return

    const tgChatId = Number(pair.tgChatId)
    const tgChat = await tgBot.getChat(tgChatId)
    if (!tgChat)
      return

    const qqRoomId = pair.qqRoomId.toString()
    let expectedTitle = ''
    let avatarUrl = ''

    if (pair.qqChatType === 'private') {
      let displayName = pair.qqDisplayName || ''
      try {
        const info = await this.qqClient.getFriendInfo(qqRoomId)
        if (info?.name) {
          displayName = info.name.replace(/\s+/g, ' ').trim()
        }
      }
      catch (err) {
        logger.debug({ err, qqRoomId }, 'Failed to get friend info from QQ')
      }
      displayName = displayName || qqRoomId
      expectedTitle = `QQ 好友 ${displayName}`.replace(/[<>]/g, '').slice(0, 120).trim()
      avatarUrl = buildQqFriendAvatarUrl(qqRoomId)
    }
    else {
      let displayName = pair.qqDisplayName || ''
      try {
        const info = await this.qqClient.getGroupInfo(qqRoomId)
        if (info?.name) {
          displayName = info.name.replace(/\s+/g, ' ').trim()
        }
      }
      catch (err) {
        logger.debug({ err, qqRoomId }, 'Failed to get group info from QQ')
      }
      displayName = displayName || qqRoomId
      expectedTitle = `QQ 群 ${displayName}`.replace(/[<>]/g, '').slice(0, 120).trim()
      avatarUrl = buildQqGroupAvatarUrl(qqRoomId)
    }

    // 1. Sync title
    if (tgChat.chat?.title !== expectedTitle) {
      try {
        await tgChat.editTitle(expectedTitle)
        logger.info(`Updated TG title to: ${expectedTitle} for pair ${pair.id}`)
      }
      catch (err) {
        logger.warn({ err, expectedTitle }, 'Failed to sync title to Telegram')
      }
    }

    // 2. Sync avatar with cache
    try {
      const avatarBuffer = await fetchBuffer(avatarUrl)
      if (avatarBuffer.length) {
        const hash = crypto.createHash('md5').update(avatarBuffer).digest('hex')
        const cacheKey = String(pair.id)
        if (this.avatarHashCache.get(cacheKey) !== hash) {
          await tgChat.setProfilePhoto(avatarBuffer)
          this.avatarHashCache.set(cacheKey, hash)
          logger.info(`Updated TG photo from QQ avatar for pair ${pair.id}`)
        }
      }
    }
    catch (err) {
      logger.debug({ err, pairId: pair.id }, 'Failed to sync avatar photo')
    }
  }
}
