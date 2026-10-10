import type { Chat, MessageReceipt, RecallEvent, Sender, UnifiedMessage } from './message.js'
import type { ForwardMessage } from './types/index.js'
import type { QQOfficialCreateParams } from './interface.js'
import { EventEmitter } from './events.js'
import { getQQClientDependencies, resolveLoggerFactory } from './deps.js'

function getLogger(name: string) {
  const { loggerFactory } = getQQClientDependencies()
  return resolveLoggerFactory(loggerFactory)(name)
}

type LoggerLike = ReturnType<typeof getLogger>

/** ARK 卡片中的资源类 URL（图标/封面/静态资源），对上层消息消费者无意义 */
const ARK_ASSET_URL = /\.(?:png|jpe?g|gif|svg|webp|ico|css|js)(?:[?#]|$)/i

/**
 * QQ 官方机器人（开放平台）适配器。
 *
 * 与 NapCat 适配器互补：群聊/私聊继续走 NapCat 个人号协议，
 * 频道（guild）消息走官方 API（WS 网关收 + REST 发）。
 *
 * 协议要点（与官方 botpy SDK 对齐）：
 * - access_token：POST https://bots.qq.com/app/getAppAccessToken { appId, clientSecret }，
 *   返回 { access_token, expires_in }，过期前刷新。
 * - Authorization: QQBot <access_token>
 * - WS 网关：GET /gateway/bot 取 wss 地址，op 10 Hello → op 2 Identify
 *   { token, intents, shard } → op 0 Dispatch 事件 → op 1 心跳。
 * - 发频道消息：POST /channels/{channel_id}/messages（content/image 等）
 * - 发频道私信：POST /dms/{guild_id}/messages（guild_id 为私信会话 ID）
 * - 频道事件（公域）：AT_MESSAGE_CREATE / DIRECT_MESSAGE_CREATE / PUBLIC_GUILD_MESSAGES
 */
export class QQOfficialAdapter extends EventEmitter {
  readonly clientType = 'qqofficial' as const
  private _uin: number = 0
  private _nickname: string = ''
  private readonly params: QQOfficialCreateParams
  private readonly logger: LoggerLike

  private ws: WebSocket | null = null
  private lastSeq = 0
  private sessionId = ''
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectAttempts = 0
  private isIntentionalClose = false
  private identified = false

  private accessToken: string | null = null
  private tokenExpiresAt = 0
  private tokenRefreshPromise: Promise<string> | null = null

  private static readonly INTENT_GUILDS = 1 << 0
  private static readonly INTENT_PUBLIC_GUILD_MESSAGES = 1 << 30
  private static readonly INTENT_DIRECT_MESSAGE = 1 << 12
  private static readonly INTENT_GROUP_AND_C2C = 1 << 25

  /** 被动回复窗口：频道私信 5 分钟（官方文档） */
  private static readonly DM_PASSIVE_WINDOW_MS = 5 * 60_000
  /** 被动回复窗口：QQ 单聊 60 分钟（官方文档；主动消息配额约 4 条/用户/月，极省着用） */
  private static readonly C2C_PASSIVE_WINDOW_MS = 60 * 60_000

  private static readonly API_BASE = 'https://api.sgroup.qq.com'
  private static readonly API_SANDBOX_BASE = 'https://sandbox.api.sgroup.qq.com'
  private static readonly TOKEN_URL = 'https://bots.qq.com/app/getAppAccessToken'

  /**
   * 被动回复窗口记录：msgId + 时间戳 + 该会话类型的窗口长度。
   * 频道私信（DM）5 分钟；QQ 单聊（C2C）60 分钟——窗口判定必须按类型，
   * C2C 超窗会被上层当成主动消息，消耗约 4 条/用户/月的配额。
   */
  private passiveReplies = new Map<string, { msgId: string, ts: number, ttlMs: number }>()

  /** 消息 ID → 所在会话，用于撤回（isDm/isC2C 决定端点） */
  private recallContexts = new Map<string, { channelId: string, isDm?: boolean, isC2C?: boolean }>()

  /**
   * 私信类会话注册表：chatId → 投递端点类型。
   * - 'dms'：频道私信会话（guild_id 形态），收发走 /dms/{guild_id}/messages
   * - 'c2c'：QQ 单聊（user_openid 形态），收发走 /v2/users/{openid}/messages
   * 普通子频道消息不登记，默认走 /channels/{channel_id}/messages。
   */
  private dmLikeChats = new Map<string, 'dms' | 'c2c'>()

  /** C2C intent 被网关拒绝（4014）后禁用，重连时不再订阅（进程生命周期内有效） */
  private c2cIntentDropped = false

  /** 登记私信类会话（DM/C2C），超出容量时淘汰最早条目 */
  private registerDmLikeChat(chatId: string, kind: 'dms' | 'c2c'): void {
    if (!chatId)
      return
    this.dmLikeChats.set(chatId, kind)
    if (this.dmLikeChats.size > 500) {
      const firstKey = this.dmLikeChats.keys().next().value
      if (firstKey !== undefined) {
        this.dmLikeChats.delete(firstKey)
        this.logger.debug({ evicted: firstKey, kind }, 'QQOfficial dmLikeChat evicted (capacity 500)')
      }
    }
  }

  /** 撤回上下文缓存容量上限，超出淘汰最早条目 */
  private static readonly RECALL_CONTEXT_CAP = 500

  /** 缓存消息撤回上下文；kind 决定撤回端点（缺省 = 普通子频道 /channels/） */
  private cacheRecallContext(messageId: string, channelId: string, kind?: 'dms' | 'c2c'): void {
    this.recallContexts.set(messageId, {
      channelId,
      ...(kind === 'dms' ? { isDm: true } : kind === 'c2c' ? { isC2C: true } : {}),
    })
    if (this.recallContexts.size > QQOfficialAdapter.RECALL_CONTEXT_CAP) {
      const firstKey = this.recallContexts.keys().next().value
      if (firstKey !== undefined) {
        this.recallContexts.delete(firstKey)
        this.logger.debug({ evicted: firstKey }, 'QQOfficial recallContext evicted (capacity 500)')
      }
    }
  }

  constructor(params: QQOfficialCreateParams) {
    super()
    this.params = params
    const { loggerFactory } = getQQClientDependencies()
    this.logger = resolveLoggerFactory(loggerFactory)('QQOfficialAdapter')
  }

  get uin(): number {
    return this._uin
  }

  get nickname(): string {
    return this._nickname
  }

  get appId(): string {
    return this.params.appId
  }

  private get apiBase(): string {
    return this.params.sandbox ? QQOfficialAdapter.API_SANDBOX_BASE : QQOfficialAdapter.API_BASE
  }

  private getIntents(): number {
    let intents = QQOfficialAdapter.INTENT_GUILDS
      | QQOfficialAdapter.INTENT_PUBLIC_GUILD_MESSAGES
    if (this.params.enableGuildDirectMessage !== false) {
      intents |= QQOfficialAdapter.INTENT_DIRECT_MESSAGE
    }
    if (this.params.enableC2C !== false && !this.c2cIntentDropped) {
      intents |= QQOfficialAdapter.INTENT_GROUP_AND_C2C
    }
    return intents
  }

  // ============ 鉴权 ============

  private async getAccessToken(force = false): Promise<string> {
    if (!force && this.accessToken && Date.now() < this.tokenExpiresAt) {
      return this.accessToken
    }
    if (this.tokenRefreshPromise) {
      return this.tokenRefreshPromise
    }
    this.tokenRefreshPromise = (async () => {
      const res = await fetch(QQOfficialAdapter.TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appId: this.params.appId, clientSecret: this.params.appSecret }),
      })
      const data = await res.json() as { access_token?: string, expires_in?: string, code?: number, message?: string }
      if (!data.access_token || !data.expires_in) {
        throw new Error(`获取 access_token 失败: ${JSON.stringify(data)}`)
      }
      this.accessToken = data.access_token
      // 提前 5 分钟刷新，避免边界过期
      this.tokenExpiresAt = Date.now() + (Number(data.expires_in) - 300) * 1000
      this.logger.info(`QQOfficial access_token refreshed (expires_in ${data.expires_in}s)`)
      return this.accessToken
    })()
    try {
      return await this.tokenRefreshPromise
    }
    finally {
      this.tokenRefreshPromise = null
    }
  }

  private async apiRequest(
    method: 'GET' | 'POST' | 'DELETE' | 'PATCH',
    path: string,
    body?: any,
    retryOn401 = true,
  ): Promise<any> {
    const token = await this.getAccessToken()
    const res = await fetch(`${this.apiBase}${path}`, {
      method,
      headers: {
        'Authorization': `QQBot ${token}`,
        'Content-Type': 'application/json',
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })
    if (res.status === 401 && retryOn401) {
      await this.getAccessToken(true)
      return this.apiRequest(method, path, body, false)
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`QQOfficial API ${method} ${path} failed: ${res.status} ${text.slice(0, 300)}`)
    }
    if (res.status === 204)
      return null
    return res.json().catch(() => null)
  }

  // ============ IQQClient 基础 ============

  async isOnline(): Promise<boolean> {
    return this.identified && this.ws?.readyState === WebSocket.OPEN
  }

  async sendMessage(chatId: string, message: UnifiedMessage): Promise<MessageReceipt> {
    try {
      const text = (message.content || [])
        .map((c) => {
          if (c.type === 'text')
            return String(c.data?.text ?? '')
          if (c.type === 'at')
            return `<@${c.data?.userId ?? c.data?.qq ?? ''}>`
          return ''
        })
        .join('')
      const image = (message.content || []).find(c => c.type === 'image')
      const payload: Record<string, any> = {
        content: text || undefined,
        ...(image?.data?.url ? { image: image.data.url } : {}),
      }
      // 主动消息限额极低：若被动窗口内收过该会话消息，附带 msgId 走被动回复
      const msgId = message.metadata?.msgId ?? this.getPassiveReplyMsgId(String(chatId))
      if (msgId) {
        payload.msgId = msgId
        payload.msgSeq = message.metadata?.msgSeq ?? 1
      }
      // 私信类会话必须走对应端点：/channels/ 对 DM/C2C 会 4xx，旧实现还把错误吞成空 messageId
      const dmKind = this.dmLikeChats.get(String(chatId))
      if (dmKind === 'dms')
        return await this.sendDmsMessage(String(chatId), payload)
      if (dmKind === 'c2c')
        return await this.sendC2CMessage(String(chatId), payload)
      return await this.sendChannelMessage(String(chatId), payload)
    }
    catch (error: any) {
      return { messageId: '', timestamp: Date.now(), success: false, error: error.message }
    }
  }

  /** 官方 API 无合并转发能力：拼接为纯文本发送 */
  async sendGroupForwardMsg(groupId: string, messages: any[]): Promise<MessageReceipt> {
    const lines: string[] = []
    for (const node of messages) {
      const nickname = node?.data?.name || node?.nickname || ''
      const contents = Array.isArray(node?.data?.content)
        ? node.data.content
        : Array.isArray(node?.content)
          ? node.content
          : []
      const text = contents
        .map((c: any) => (c?.type === 'text' ? String(c?.data?.text ?? '') : ''))
        .filter(Boolean)
        .join('\n')
      lines.push(nickname ? `${nickname}:\n${text}` : text)
    }
    return this.sendChannelMessage(String(groupId), {
      content: lines.join('\n\n'),
      ...(this.getPassiveReplyMsgId(String(groupId))
        ? { msgId: this.getPassiveReplyMsgId(String(groupId)) }
        : {}),
    })
  }

  /** 底层频道消息发送（也供频道主动消息使用） */
  async sendChannelMessage(channelId: string, payload: Record<string, any>): Promise<MessageReceipt> {
    try {
      const data = await this.apiRequest('POST', `/channels/${channelId}/messages`, payload)
      // 缓存撤回上下文，使机器人自己的频道消息可被 recallMessage 撤回
      if (data?.id)
        this.cacheRecallContext(String(data.id), channelId)
      return {
        messageId: String(data?.id ?? ''),
        timestamp: Date.now(),
        success: Boolean(data?.id),
        raw: data,
      }
    }
    catch (error: any) {
      return { messageId: '', timestamp: Date.now(), success: false, error: error.message }
    }
  }

  /** 发送频道私信（guildId 为 create_dms 返回的私信会话 ID） */
  async sendDmsMessage(guildId: string, payload: Record<string, any>): Promise<MessageReceipt> {
    try {
      // QQ 被动回复字段为 snake_case（msg_id/msg_seq），上层统一用驼峰 msgId 透传，此处转换
      const body: Record<string, any> = { ...payload }
      if (body.msgId !== undefined) {
        body.msg_id = body.msgId
        body.msg_seq = body.msgSeq ?? 1
        delete body.msgId
        delete body.msgSeq
      }
      const data = await this.apiRequest('POST', `/dms/${guildId}/messages`, body)
      if (data?.id)
        this.cacheRecallContext(String(data.id), guildId, 'dms')
      return {
        messageId: String(data?.id ?? ''),
        timestamp: Date.now(),
        success: Boolean(data?.id),
        raw: data,
      }
    }
    catch (error: any) {
      return { messageId: '', timestamp: Date.now(), success: false, error: error.message }
    }
  }

  /** 发送 QQ 单聊消息（openid = 用户 user_openid），被动回复带 msg_id + msg_seq */
  async sendC2CMessage(openid: string, payload: Record<string, any>): Promise<MessageReceipt> {
    // C2C v2 接口：msg_type 必填（0=文本），被动回复用 msg_id/msg_seq（snake_case）
    const body: Record<string, any> = { ...payload }
    if (body.msgId !== undefined) {
      body.msg_id = body.msgId
      body.msg_seq = body.msgSeq ?? 1
      delete body.msgId
      delete body.msgSeq
    }
    if (body.msg_type === undefined && body.markdown === undefined && body.media === undefined && body.keyboard === undefined && body.ark === undefined)
      body.msg_type = 0
    if (body.image !== undefined) {
      // C2C 不支持 image URL，富媒体需先上传获取 file_info（msg_type=7）
      delete body.image
      this.logger.warn('C2C message dropped unsupported image field')
    }
    try {
      const data = await this.apiRequest('POST', `/v2/users/${openid}/messages`, body)
      if (data?.id)
        this.cacheRecallContext(String(data.id), openid, 'c2c')
      return {
        messageId: String(data?.id ?? ''),
        timestamp: Date.now(),
        success: Boolean(data?.id),
        raw: data,
      }
    }
    catch (error: any) {
      // 被动窗口判定与官方实际窗口如有偏差，msg_id 会被拒；降级主动消息重发一次，
      // 保证令牌不静默丢失（主动消息计入月度配额，warn 日志暴露消耗）
      if (body.msg_id !== undefined) {
        this.logger.warn(`C2C passive reply rejected (${error.message}), retrying as active message`)
        const active: Record<string, any> = { ...body }
        delete active.msg_id
        delete active.msg_seq
        try {
          const data = await this.apiRequest('POST', `/v2/users/${openid}/messages`, active)
          if (data?.id)
            this.cacheRecallContext(String(data.id), openid, 'c2c')
          return {
            messageId: String(data?.id ?? ''),
            timestamp: Date.now(),
            success: Boolean(data?.id),
            raw: data,
          }
        }
        catch (retryError: any) {
          return { messageId: '', timestamp: Date.now(), success: false, error: retryError.message }
        }
      }
      return { messageId: '', timestamp: Date.now(), success: false, error: error.message }
    }
  }

  /** 创建私信会话（返回 guild_id 用于 sendDmsMessage） */
  async createDms(recipientId: string, sourceGuildId: string): Promise<any> {
    return this.apiRequest('POST', '/users/@me/dms', {
      recipient_id: recipientId,
      source_guild_id: sourceGuildId,
    })
  }

  /** 是否持有该消息的频道撤回上下文（路由层据此判断撤回应走官方客户端） */
  hasRecallContext(messageId: string): boolean {
    return this.recallContexts.has(messageId)
  }

  async recallMessage(messageId: string): Promise<void> {
    // 撤回端点随会话类型变化，从消息上下文缓存中取
    const cached = this.recallContexts.get(messageId)
    if (cached?.isDm) {
      await this.apiRequest('DELETE', `/dms/${cached.channelId}/messages/${messageId}`)
      return
    }
    if (cached?.isC2C) {
      await this.apiRequest('DELETE', `/v2/users/${cached.channelId}/messages/${messageId}`)
      return
    }
    if (cached) {
      await this.apiRequest('DELETE', `/channels/${cached.channelId}/messages/${messageId}`)
      return
    }
    throw new Error('recallMessage requires channel context (use callApi with channel_id)')
  }

  async getMessage(_messageId: string): Promise<UnifiedMessage | null> {
    // 官方 API 需要 channelId 才能取消息，暂不支持按 ID 直取
    return null
  }

  async getForwardMsg(_messageId: string, _fileName?: string): Promise<ForwardMessage[]> {
    return []
  }

  async getFriendList(): Promise<Sender[]> {
    return []
  }

  async getGroupList(): Promise<Chat[]> {
    try {
      const guilds = await this.apiRequest('GET', '/users/@me/guilds')
      return (Array.isArray(guilds) ? guilds : []).map((g: any) => ({
        id: String(g.id),
        type: 'channel' as const,
        name: g.name,
      }))
    }
    catch (e) {
      this.logger.warn('getGuildList failed', e)
      return []
    }
  }

  async getGroupMemberList(_groupId: string): Promise<Sender[]> {
    return []
  }

  async getFriendInfo(_uin: string): Promise<Sender | null> {
    return null
  }

  async getGroupInfo(groupId: string): Promise<Chat | null> {
    try {
      const info = await this.apiRequest('GET', `/guilds/${groupId}`)
      return {
        id: String(info?.id ?? groupId),
        type: 'channel',
        name: info?.name,
      }
    }
    catch {
      return null
    }
  }

  async getGroupMemberInfo(_groupId: string, _userId: string): Promise<any> {
    return null
  }

  async getUserInfo(userId: string): Promise<any> {
    try {
      return await this.apiRequest('GET', `/users/${userId}`)
    }
    catch {
      return null
    }
  }

  async login(): Promise<void> {
    await this.getAccessToken(true)
    try {
      const me = await this.apiRequest('GET', '/users/@me')
      this._uin = Number(me?.id ?? 0) || 0
      this._nickname = String(me?.username ?? '')
      this.logger.info(`Logged in as ${this._nickname} (${me?.id})`)
    }
    catch (e) {
      this.logger.warn('get /users/@me failed; continuing with appId as identity', e)
      this._uin = 0
      this._nickname = this.params.appId
    }
    this.isIntentionalClose = false
    await this.connectGateway()
  }

  async logout(): Promise<void> {
    this.isIntentionalClose = true
    this.cleanupGateway()
  }

  async destroy(): Promise<void> {
    await this.logout()
  }

  /** 插件可用的通用 API 通道 */
  async callApi(method: string, params?: any): Promise<any> {
    switch (method) {
      case 'get_guild_list':
        return this.getGroupList()
      case 'send_channel_msg':
      case 'send_guild_channel_msg':
        return this.sendChannelMessage(String(params?.channel_id), params)
      case 'send_dms_msg':
        return this.sendDmsMessage(String(params?.guild_id), params)
      case 'create_dms':
        return this.createDms(String(params?.recipient_id), String(params?.source_guild_id))
      default:
        throw new Error(`QQOfficialAdapter: unsupported API ${method}`)
    }
  }

  // ============ WS 网关 ============

  private async connectGateway(): Promise<void> {
    try {
      const gw = await this.apiRequest('GET', '/gateway/bot')
      const url = String(gw?.url ?? '')
      if (!url)
        throw new Error('gateway url empty')
    }
    catch (e) {
      this.logger.error('Failed to get gateway URL', e)
      this.scheduleReconnect()
      return
    }

    this.identified = false
    try {
      const gw = await this.apiRequest('GET', '/gateway/bot')
      this.ws = new WebSocket(String(gw?.url ?? ''))
    }
    catch (e) {
      this.logger.error('Failed to create gateway WebSocket', e)
      this.scheduleReconnect()
      return
    }

    this.ws.onopen = () => {
      this.logger.info('QQOfficial gateway connected')
      this.reconnectAttempts = 0
    }

    this.ws.onmessage = (event) => {
      void this.handleGatewayMessage(String(event.data)).catch(e => this.logger.error('gateway message handling failed', e))
    }

    this.ws.onclose = (event) => {
      this.logger.warn(`QQOfficial gateway closed: code=${event.code} reason=${event.reason}`)
      this.cleanupHeartbeat()
      if (!this.isIntentionalClose) {
        // 4004 = 鉴权失败：强制刷新 token 后重连
        if (event.code === 4004) {
          void this.getAccessToken(true).catch(() => {})
        }
        // 4014 = intent 无权限：C2C 事件 intent 未过审，去掉后重连，保住频道私信等其它事件
        if (event.code === 4014 && !this.c2cIntentDropped) {
          this.c2cIntentDropped = true
          this.reconnectAttempts = 0
          this.logger.warn('QQOfficial C2C intent not authorized (4014), reconnecting without GROUP_AND_C2C_EVENT')
        }
        this.scheduleReconnect()
      }
    }

    this.ws.onerror = (event) => {
      this.logger.error('QQOfficial gateway error', event)
    }
  }

  private async handleGatewayMessage(raw: string): Promise<void> {
    let msg: { op: number, s?: number, t?: string, d?: any }
    try {
      msg = JSON.parse(raw)
    }
    catch {
      return
    }
    if (typeof msg.s === 'number' && msg.s > 0) {
      this.lastSeq = msg.s
    }

    switch (msg.op) {
      case 10: {
        // Hello：开始心跳并鉴权
        const heartbeatInterval = Number(msg.d?.heartbeat_interval ?? 30_000)
        this.startHeartbeat(heartbeatInterval)
        await this.identify()
        break
      }
      case 11:
        // Heartbeat ACK
        break
      case 7:
        // 服务端要求重连
        this.logger.warn('QQOfficial gateway requested reconnect (op 7)')
        this.reconnect()
        break
      case 9:
        // Invalid Session：清空 session 后重新 Identify
        this.logger.warn('QQOfficial gateway invalid session (op 9)')
        this.sessionId = ''
        this.lastSeq = 0
        await this.identify()
        break
      case 0:
        this.handleDispatch(msg)
        break
      default:
        break
    }
  }

  private async identify(): Promise<void> {
    if (this.identified && this.sessionId && this.lastSeq > 0) {
      // Resume
      const token = await this.getAccessToken()
      this.wsSend({
        op: 6,
        d: { token: `QQBot ${token}`, session_id: this.sessionId, seq: this.lastSeq },
      })
      return
    }
    const token = await this.getAccessToken()
    this.wsSend({
      op: 2,
      d: {
        shard: [0, 1],
        token: `QQBot ${token}`,
        intents: this.getIntents(),
      },
    })
  }

  private handleDispatch(msg: { t?: string, d?: any }): void {
    const type = msg.t
    const d = msg.d ?? {}
    switch (type) {
      case 'READY':
        this.sessionId = String(d?.session_id ?? '')
        this.identified = true
        this.logger.info('QQOfficial gateway READY')
        this.emit('online')
        break
      case 'RESUMED':
        this.identified = true
        this.logger.info('QQOfficial gateway RESUMED')
        this.emit('online')
        break
      case 'AT_MESSAGE_CREATE':
      case 'MESSAGE_CREATE':
      case 'PUBLIC_AT_MESSAGE_CREATE':
      case 'DIRECT_MESSAGE_CREATE':
        this.emitChannelMessage(d, type)
        break
      case 'C2C_MESSAGE_CREATE':
        this.emitC2CMessage(d)
        break
      case 'MESSAGE_DELETE':
      case 'PUBLIC_MESSAGE_DELETE':
      case 'DIRECT_MESSAGE_DELETE':
        this.emitRecall(d)
        break
      case 'GUILD_MEMBER_ADD':
        this.emit('group.increase', String(d?.guild_id ?? ''), { id: String(d?.user?.id ?? ''), name: String(d?.user?.username ?? '') })
        break
      case 'GUILD_MEMBER_REMOVE':
        this.emit('group.decrease', String(d?.guild_id ?? ''), String(d?.user?.id ?? ''))
        break
      default:
        this.logger.debug({ type, id: String(d?.id ?? '') }, 'QQOfficial unhandled event type')
        break
    }
  }

  private emitChannelMessage(d: any, eventType: string): void {
    const isDirect = eventType === 'DIRECT_MESSAGE_CREATE'
    const channelId = String(d?.channel_id ?? '')
    const guildId = String(d?.guild_id ?? '')
    const chatId = channelId || String(d?.id ?? '')
    if (isDirect)
      this.registerDmLikeChat(chatId, 'dms')
    if (d?.id) {
      this.cacheRecallContext(String(d.id), channelId, isDirect ? 'dms' : undefined)
      // 记录被动回复窗口（官方 API 主动消息限制极严，优先 msgId 被动回复）
      this.passiveReplies.set(chatId, { msgId: String(d.id), ts: Date.now(), ttlMs: QQOfficialAdapter.DM_PASSIVE_WINDOW_MS })
      for (const [key, val] of this.passiveReplies) {
        if (Date.now() - val.ts > val.ttlMs)
          this.passiveReplies.delete(key)
      }
    }

    const unified: UnifiedMessage = {
      id: String(d?.id ?? `${Date.now()}`),
      platform: 'qq',
      sender: {
        id: String(d?.author?.id ?? d?.author?.user_openid ?? ''),
        name: String(d?.author?.username ?? d?.member?.nick ?? ''),
        avatar: d?.author?.avatar,
      },
      chat: {
        id: chatId,
        type: 'channel',
        name: d?.channel?.name,
      },
      content: this.parseContent(String(d?.content ?? ''), d?.attachments, d?.ark_data),
      timestamp: Number(d?.timestamp ? Date.parse(String(d.timestamp)) : Date.now()),
      metadata: {
        raw: d,
        guildId,
        channelId,
        eventType,
        isDirect,
        msgId: d?.id ? String(d.id) : undefined,
      },
    }
    this.emit('message', unified)
  }

  /**
   * QQ 单聊（C2C）消息：chatId = user_openid，收发走 /v2/users/{openid}/messages。
   * chat.type 映射为 'channel' + metadata.isDirect，让上层（转发/插件）按私信处理；
   * 实际端点由 dmLikeChats 注册表区分。
   */
  private emitC2CMessage(d: any): void {
    const openid = String(d?.author?.user_openid ?? d?.author?.id ?? '')
    if (!openid) {
      // 没有 openid 无法路由到 /v2/users/ 端点；丢弃并记日志，
      // 避免旧实现那样把消息 ID 误注册成 c2c 会话（后续回复会打到错误端点）
      this.logger.warn({ id: String(d?.id ?? '') }, 'QQOfficial C2C message without author openid, dropped')
      return
    }
    const chatId = openid
    this.registerDmLikeChat(chatId, 'c2c')
    if (d?.id) {
      this.cacheRecallContext(String(d.id), chatId, 'c2c')
      // 记录被动回复窗口（C2C 主动消息配额约 4 条/用户/月，优先 msg_id 被动回复）
      this.passiveReplies.set(chatId, { msgId: String(d.id), ts: Date.now(), ttlMs: QQOfficialAdapter.C2C_PASSIVE_WINDOW_MS })
      for (const [key, val] of this.passiveReplies) {
        if (Date.now() - val.ts > val.ttlMs)
          this.passiveReplies.delete(key)
      }
    }
    const unified: UnifiedMessage = {
      id: String(d?.id ?? `${Date.now()}`),
      platform: 'qq',
      sender: {
        id: openid,
        name: String(d?.author?.username ?? ''),
        avatar: d?.author?.avatar,
      },
      chat: {
        id: chatId,
        type: 'channel',
      },
      content: this.parseContent(String(d?.content ?? ''), d?.attachments, d?.ark_data),
      timestamp: Number(d?.timestamp ? Date.parse(String(d.timestamp)) : Date.now()),
      metadata: {
        raw: d,
        guildId: '',
        channelId: chatId,
        eventType: 'C2C_MESSAGE_CREATE',
        isDirect: true,
        msgId: d?.id ? String(d.id) : undefined,
      },
    }
    this.emit('message', unified)
  }

  /**
   * 从 ARK 卡片数据中抽取 http(s) URL（分享链接卡片的 link 藏在 kv/obj 里，形态多变，暴力抽取最稳）。
   * 资源类 URL（图标/封面/静态资源）对上层无意义，过滤掉并记 debug 日志。
   */
  private extractUrlsFromArk(arkData: any): string {
    let raw: string
    try {
      raw = typeof arkData === 'string' ? arkData : JSON.stringify(arkData)
    }
    catch {
      return ''
    }
    const urls = raw.match(/https?:\/\/[^\s"'\\\])}]+/g) ?? []
    const kept: string[] = []
    const dropped: string[] = []
    for (const u of urls) {
      const clean = u.replace(/[.,;:!?)\]}>]+$/, '')
      if (ARK_ASSET_URL.test(clean))
        dropped.push(clean)
      else kept.push(clean)
    }
    if (dropped.length > 0)
      this.logger.debug({ dropped }, 'QQOfficial ARK asset URLs filtered out')
    return [...new Set(kept)].join('\n')
  }

  private parseContent(content: string, attachments?: any[], arkData?: any): any[] {
    const segments: any[] = []
    const text = String(content ?? '')
    // 官方内容为纯文本（可含 <@openid> 提及），不做复杂分段
    if (text.trim())
      segments.push({ type: 'text', data: { text } })
    for (const att of Array.isArray(attachments) ? attachments : []) {
      if (att?.content_type === 'image' && att?.url) {
        segments.push({ type: 'image', data: { url: att.url } })
      }
    }
    // ARK 卡片（message_type=3，用户分享的链接卡片）：URL 藏在 ark_data 里，content 往往为空。
    // 抽取其中全部 http(s) URL 拼为文本，供上层（如鉴权插件）解析激活链接。
    if (arkData) {
      const arkText = this.extractUrlsFromArk(arkData)
      if (arkText)
        segments.push({ type: 'text', data: { text: arkText } })
    }
    if (segments.length === 0)
      segments.push({ type: 'text', data: { text: '' } })
    return segments
  }

  private emitRecall(d: any): void {
    const event: RecallEvent = {
      messageId: String(d?.id ?? ''),
      chatId: String(d?.channel_id ?? d?.guild_id ?? ''),
      operatorId: String(d?.op_user_id ?? ''),
      timestamp: Date.now(),
    }
    this.emit('recall', event)
  }

  private wsSend(payload: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload))
    }
  }

  private startHeartbeat(intervalMs: number): void {
    this.cleanupHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      this.wsSend({ op: 1, d: this.lastSeq })
    }, Math.max(5000, intervalMs * 0.8))
  }

  private cleanupHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  private reconnect(): void {
    this.cleanupGateway()
    this.scheduleReconnect()
  }

  private scheduleReconnect(): void {
    const reconnectOpt = this.params.reconnect
    if (reconnectOpt === false)
      return
    const maxAttempts = (typeof reconnectOpt === 'object' ? reconnectOpt.maxAttempts : undefined) ?? Infinity
    if (this.reconnectAttempts >= maxAttempts) {
      this.logger.error(`QQOfficial reconnect attempts exceeded (${maxAttempts})`)
      this.emit('connection:lost', { timestamp: Date.now(), reason: 'Reconnect attempts exceeded' })
      return
    }
    const base = (typeof reconnectOpt === 'object' ? reconnectOpt.interval : undefined) ?? 5000
    const delay = Math.min(base * 1.5 ** this.reconnectAttempts, 60_000)
    this.reconnectAttempts++
    this.logger.warn(`QQOfficial reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`)
    if (this.reconnectTimer)
      clearTimeout(this.reconnectTimer)
    this.reconnectTimer = setTimeout(() => {
      void this.connectGateway()
    }, delay)
  }

  private cleanupGateway(): void {
    this.cleanupHeartbeat()
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      try {
        this.ws.onopen = null
        this.ws.onmessage = null
        this.ws.onclose = null
        this.ws.onerror = null
        if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
          this.ws.close(1000, 'logout')
        }
      }
      catch {
        // ignore close errors during cleanup
      }
      this.ws = null
    }
    this.identified = false
  }

  /** 取指定会话的被动回复 msgId（各会话类型的被动窗口内），供发送逻辑使用 */
  getPassiveReplyMsgId(chatId: string): string | undefined {
    const cached = this.passiveReplies.get(chatId)
    if (cached && Date.now() - cached.ts < cached.ttlMs) {
      return cached.msgId
    }
    return undefined
  }
}
