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

  private static readonly API_BASE = 'https://api.sgroup.qq.com'
  private static readonly API_SANDBOX_BASE = 'https://sandbox.api.sgroup.qq.com'
  private static readonly TOKEN_URL = 'https://bots.qq.com/app/getAppAccessToken'

  /** 频道主动消息每日限额极低，记录最近收到的被动消息用于 5 分钟窗口内回复 */
  private passiveReplies = new Map<string, { msgId: string, ts: number }>()

  /** 消息 ID → 所在子频道，用于撤回 */
  private recallContexts = new Map<string, { channelId: string }>()

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
      // 频道主动消息限额极低：若 5 分钟内收过该会话消息，附带 msgId 走被动回复
      const msgId = message.metadata?.msgId ?? this.getPassiveReplyMsgId(String(chatId))
      if (msgId) {
        payload.msgId = msgId
        payload.msgSeq = message.metadata?.msgSeq ?? 1
      }
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
      const data = await this.apiRequest('POST', `/dms/${guildId}/messages`, payload)
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
    // 频道撤回需要 channel_id，从消息上下文缓存中取
    const cached = this.recallContexts.get(messageId)
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
        break
    }
  }

  private emitChannelMessage(d: any, eventType: string): void {
    const isDirect = eventType === 'DIRECT_MESSAGE_CREATE'
    const channelId = String(d?.channel_id ?? '')
    const guildId = String(d?.guild_id ?? '')
    const chatId = channelId || String(d?.id ?? '')
    if (d?.id) {
      this.recallContexts.set(String(d.id), { channelId })
      if (this.recallContexts.size > 500) {
        const firstKey = this.recallContexts.keys().next().value
        if (firstKey !== undefined)
          this.recallContexts.delete(firstKey)
      }
      // 记录被动回复窗口（官方 API 主动消息限制极严，优先 msgId 被动回复）
      this.passiveReplies.set(chatId, { msgId: String(d.id), ts: Date.now() })
      for (const [key, val] of this.passiveReplies) {
        if (Date.now() - val.ts > 6 * 60_000)
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
      content: this.parseContent(String(d?.content ?? ''), d?.attachments),
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

  private parseContent(content: string, attachments?: any[]): any[] {
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

  /** 取指定会话的被动回复 msgId（5 分钟窗口内），供发送逻辑使用 */
  getPassiveReplyMsgId(chatId: string): string | undefined {
    const cached = this.passiveReplies.get(chatId)
    if (cached && Date.now() - cached.ts < 5 * 60_000) {
      return cached.msgId
    }
    return undefined
  }
}
