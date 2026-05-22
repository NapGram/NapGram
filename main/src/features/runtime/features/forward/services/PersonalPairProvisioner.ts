import type { UnifiedMessage } from '@napgram/message-kit'
import type { ForwardMap, IQQClient, Instance, Telegram } from '../../../shared-types.js'
import type { QqChatType, TypedForwardPair } from '../../commands/utils/ForwardPairChatType.js'
import { getLogger } from '../../../shared-types.js'
import { addForwardPairWithChatType, findPairByQQWithChatType } from '../../commands/utils/ForwardPairChatType.js'

interface ProvisionedQQInfo {
  displayName: string
  title: string
  description: string
}

const logger = getLogger('PersonalPairProvisioner')

export class PersonalPairProvisioner {
  private readonly inFlight = new Map<string, Promise<TypedForwardPair | undefined>>()

  constructor(
    private readonly instance: Instance,
    private readonly forwardMap: ForwardMap,
    private readonly qqClient: IQQClient,
  ) { }

  async ensurePairForQQMessage(msg: UnifiedMessage, qqChatType: QqChatType): Promise<TypedForwardPair | undefined> {
    if (!this.canProvision())
      return undefined

    const key = `${qqChatType}:${msg.chat.id}`
    const pending = this.inFlight.get(key)
    if (pending)
      return pending

    const task = this.provision(msg, qqChatType)
      .catch((error) => {
        logger.warn({ error, instanceId: this.instance.id, qqChatType, qqRoomId: msg.chat.id }, 'Personal pair auto provisioning failed')
        return undefined
      })
      .finally(() => {
        this.inFlight.delete(key)
      })

    this.inFlight.set(key, task)
    return task
  }

  private canProvision() {
    const diagnostics = typeof this.instance.getPersonalModeDiagnostics === 'function'
      ? this.instance.getPersonalModeDiagnostics()
      : undefined

    return diagnostics?.workMode === 'personal'
      && diagnostics.canAutoProvisionPairs
      && Boolean(this.instance.tgUserBot?.isOnline)
      && Boolean(this.instance.tgBot?.isOnline)
      && Boolean(this.instance.userSessionId)
  }

  private async provision(msg: UnifiedMessage, qqChatType: QqChatType): Promise<TypedForwardPair | undefined> {
    const existing = await findPairByQQWithChatType(this.forwardMap, this.instance.id, msg.chat.id, qqChatType)
    if (existing)
      return existing

    const userBot = this.instance.tgUserBot
    if (!userBot)
      return undefined

    const qqInfo = await this.resolveQQInfo(msg, qqChatType)
    const tgChat = await this.createTelegramGroup(userBot, qqInfo)
    const tgChatId = BigInt(tgChat.id)

    await this.inviteBot(userBot, tgChat.id)
    await this.ensureBotCanSeeChat(tgChat.id)
    await this.hideSettingsBarAndAddToFolder(userBot, tgChat.id)

    const pair = await addForwardPairWithChatType(
      this.forwardMap,
      this.instance.id,
      msg.chat.id,
      tgChatId,
      undefined,
      qqChatType,
      {
        qqDisplayName: qqInfo.displayName,
        tgProvisionedByUserSessionId: this.instance.userSessionId,
        autoCreated: true,
      },
    )

    logger.info({
      instanceId: this.instance.id,
      qqChatType,
      qqRoomId: msg.chat.id,
      tgChatId: pair.tgChatId,
      pairId: pair.id,
    }, 'Personal pair auto provisioned')

    return pair
  }

  private async hideSettingsBarAndAddToFolder(userBot: Telegram, chatId: number | bigint): Promise<void> {
    const client = (userBot as any).client
    if (!client || typeof client.resolvePeer !== 'function' || typeof client.call !== 'function')
      return

    try {
      const inputPeer = await client.resolvePeer(chatId)

      // 1. Hide peer settings bar
      try {
        await client.call({
          _: 'messages.hidePeerSettingsBar',
          peer: inputPeer,
        })
        logger.info({ chatId }, 'Successfully hid peer settings bar')
      }
      catch (error) {
        logger.warn({ error, chatId }, 'Failed to hide peer settings bar')
      }

      // 2. Add chat to DialogFilter/"QQ" folder
      try {
        const foldersResult = await client.call({ _: 'messages.getDialogFilters' })
        const filters = foldersResult.filters || []
        
        let qqFilter = filters.find((f: any) => f._ === 'dialogFilter' && f.title === 'QQ')
        if (qqFilter) {
          const includePeers = qqFilter.includePeers || []
          const exists = includePeers.some((p: any) => {
            return (p.userId && String(p.userId) === String(inputPeer.userId)) ||
                   (p.chatId && String(p.chatId) === String(inputPeer.chatId)) ||
                   (p.channelId && String(p.channelId) === String(inputPeer.channelId))
          })

          if (!exists) {
            await client.call({
              _: 'messages.updateDialogFilter',
              id: qqFilter.id,
              filter: {
                ...qqFilter,
                includePeers: [...includePeers, inputPeer],
              },
            })
            logger.info({ chatId, folderId: qqFilter.id }, 'Added chat to existing QQ folder')
          }
        }
        else {
          const nextId = Math.max(2, ...filters.map((f: any) => f.id || 0)) + 1
          await client.call({
            _: 'messages.updateDialogFilter',
            id: nextId,
            filter: {
              _: 'dialogFilter',
              id: nextId,
              title: 'QQ',
              emoticon: '💬',
              includePeers: [inputPeer],
              excludePeers: [],
              pinnedPeers: [],
            },
          })
          logger.info({ chatId, folderId: nextId }, 'Created new QQ folder and added chat')
        }
      }
      catch (error) {
        logger.warn({ error, chatId }, 'Failed to update QQ folder')
      }
    }
    catch (error) {
      logger.warn({ error, chatId }, 'Failed to resolve input peer or call userbot RPC APIs')
    }
  }

  private async resolveQQInfo(msg: UnifiedMessage, qqChatType: QqChatType): Promise<ProvisionedQQInfo> {
    const qqRoomId = String(msg.chat.id)
    const displayName = qqChatType === 'private'
      ? await this.resolveFriendName(qqRoomId, msg)
      : await this.resolveGroupName(qqRoomId, msg)
    const label = qqChatType === 'private' ? 'QQ 好友' : 'QQ 群'
    const title = this.sanitizeTitle(`${label} ${displayName}`)

    return {
      displayName,
      title,
      description: `NapGram personal mode auto-created for ${label} ${qqRoomId}`,
    }
  }

  private async resolveFriendName(userId: string, msg: UnifiedMessage): Promise<string> {
    try {
      const info = await this.qqClient.getFriendInfo(userId)
      const name = this.cleanName(info?.name)
      if (name)
        return name
    }
    catch (error) {
      logger.debug({ error, userId }, 'Failed to resolve QQ friend name')
    }

    return this.cleanName(msg.sender?.name) || userId
  }

  private async resolveGroupName(groupId: string, msg: UnifiedMessage): Promise<string> {
    try {
      const info = await this.qqClient.getGroupInfo(groupId)
      const name = this.cleanName(info?.name)
      if (name)
        return name
    }
    catch (error) {
      logger.debug({ error, groupId }, 'Failed to resolve QQ group name')
    }

    return this.cleanName(msg.chat?.name) || groupId
  }

  private cleanName(value: unknown): string {
    return typeof value === 'string'
      ? value.replace(/\s+/g, ' ').trim()
      : ''
  }

  private sanitizeTitle(title: string): string {
    const cleaned = this.cleanName(title).replace(/[<>]/g, '').slice(0, 120).trim()
    return cleaned || 'NapGram personal pair'
  }

  private async createTelegramGroup(userBot: Telegram, qqInfo: ProvisionedQQInfo): Promise<{ id: number | bigint }> {
    const client = (userBot as any).client
    if (!client || typeof client.createSupergroup !== 'function') {
      throw new Error('TG UserBot does not support createSupergroup()')
    }

    return await client.createSupergroup({
      title: qqInfo.title,
      description: qqInfo.description,
      forum: false,
    })
  }

  private resolveBotPeer(): string | number {
    const botMe = this.instance.tgBot?.me as any
    if (botMe?.username)
      return botMe.username
    if (botMe?.id !== undefined && botMe?.id !== null)
      return Number(botMe.id)
    throw new Error('TG Bot identity is unavailable')
  }

  private isAlreadyParticipantError(error: unknown): boolean {
    const message = String((error as any)?.message || error)
    return /USER_ALREADY_PARTICIPANT|already.*participant|already.*member/i.test(message)
  }

  private async inviteBot(userBot: Telegram, tgChatId: number | bigint): Promise<void> {
    const client = (userBot as any).client
    if (!client || typeof client.addChatMembers !== 'function') {
      throw new Error('TG UserBot does not support addChatMembers()')
    }

    const botPeer = this.resolveBotPeer()
    try {
      await client.addChatMembers(tgChatId as any, [botPeer], { forwardCount: 0 })
    }
    catch (error) {
      if (!this.isAlreadyParticipantError(error))
        throw error
    }

    if (typeof client.editAdminRights !== 'function')
      return

    try {
      await client.editAdminRights({
        chatId: tgChatId as any,
        userId: botPeer,
        rights: {
          changeInfo: true,
          postMessages: true,
          editMessages: true,
          deleteMessages: true,
          banUsers: true,
          inviteUsers: true,
          pinMessages: true,
          manageCall: true,
          anonymous: false,
          manageTopics: false,
        },
        rank: 'NapGram',
      })
    }
    catch (error) {
      logger.warn({ error, tgChatId }, 'Failed to promote TG Bot in auto-created chat; continuing with member access')
    }
  }

  private async ensureBotCanSeeChat(tgChatId: number | bigint): Promise<void> {
    const tgBot = this.instance.tgBot
    if (!tgBot || typeof tgBot.getChat !== 'function')
      return

    const attempts = typeof process !== 'undefined' && process.env.NODE_ENV === 'test' ? 1 : 3
    let lastError: unknown
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        await tgBot.getChat(tgChatId as any)
        return
      }
      catch (error) {
        lastError = error
        if (attempt < attempts)
          await new Promise(resolve => setTimeout(resolve, 300 * attempt))
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError))
  }
}

