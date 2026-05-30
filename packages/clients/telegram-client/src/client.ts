import type { InputPeerLike, User } from '@mtcute/core'
import { Buffer } from 'node:buffer'
import fs from 'node:fs'
import path from 'node:path'
import { Message } from '@mtcute/core'
import { Dispatcher } from '@mtcute/dispatcher'
import { HttpProxyTcpTransport, SocksProxyTcpTransport, TelegramClient } from '@mtcute/node'
import {
  getTelegramClientDependencies,
  resolveLoggerFactory,
  resolveTelegramEnv,
  resolveTempPath,
} from './deps.js'
import type { LoggerLike, TelegramClientDependencies, TelegramEnv, TelegramSessionStore } from './deps.js'

// Define types for handlers
export type MessageHandler = (message: Message) => Promise<boolean | void>
export type TelegramAuthMode = 'bot' | 'user'

export interface TelegramConnectOptions {
  authMode?: TelegramAuthMode
  botToken?: string
  phone?: string | (() => string | Promise<string>)
  code?: string | (() => string | Promise<string>)
  password?: string | (() => string | Promise<string>)
}

function normalizeAuthMode(mode: unknown): TelegramAuthMode {
  return mode === 'user' ? 'user' : 'bot'
}

export default class Telegram {
  public readonly client: TelegramClient
  public readonly dispatcher: Dispatcher
  public me?: User
  private logger!: LoggerLike
  private env!: TelegramEnv
  private tempPath!: string

  private static existedBots = {} as { [id: number]: Telegram }

  private resolveProxyType(raw?: string): 'socks5' | 'http' | 'https' {
    const normalized = (raw || 'socks5').trim().toLowerCase()
    if (normalized === 'socks' || normalized === 'socks5') {
      return 'socks5'
    }
    if (normalized === 'http' || normalized === 'https') {
      return normalized
    }
    this.logger.warn(`Unknown PROXY_TYPE="${raw}", fallback to socks5`)
    return 'socks5'
  }

  private createProxyTransportFromUrl(rawUrl: string) {
    let proxyUrl: URL
    try {
      proxyUrl = new URL(rawUrl.trim())
    }
    catch {
      throw new Error(`Invalid proxy url: ${rawUrl}`)
    }

    const protocol = proxyUrl.protocol.replace(/:$/, '').toLowerCase()
    const host = proxyUrl.hostname
    const user = proxyUrl.username ? decodeURIComponent(proxyUrl.username) : undefined
    const password = proxyUrl.password ? decodeURIComponent(proxyUrl.password) : undefined

    if (!host) {
      throw new Error(`Invalid proxy url host: ${rawUrl}`)
    }

    if (protocol === 'socks4' || protocol === 'socks5' || protocol === 'socks') {
      const port = Number(proxyUrl.port || 1080)
      return new SocksProxyTcpTransport({
        host,
        port,
        user,
        password,
        ...(protocol === 'socks4' ? { version: 4 as const } : { version: 5 as const }),
      })
    }

    if (protocol === 'http' || protocol === 'https') {
      const port = Number(proxyUrl.port || (protocol === 'https' ? 443 : 80))
      return new HttpProxyTcpTransport({
        host,
        port,
        user,
        password,
        ...(protocol === 'https' ? { tls: true } : {}),
      })
    }

    throw new Error(`Unsupported proxy protocol: ${protocol}`)
  }

  private createProxyTransport() {
    const proxyUrl = this.env.PROXY_URL || this.env.PROXY
    if (proxyUrl) {
      try {
        return this.createProxyTransportFromUrl(proxyUrl)
      }
      catch (err) {
        this.logger.error(`Invalid proxy url: ${proxyUrl}`, err)
        throw err
      }
    }

    if (!this.env.PROXY_IP || !this.env.PROXY_PORT) {
      return undefined
    }

    const proxyType = this.resolveProxyType(this.env.PROXY_TYPE)
    if (proxyType === 'http' || proxyType === 'https') {
      return new HttpProxyTcpTransport({
        host: this.env.PROXY_IP,
        port: Number(this.env.PROXY_PORT),
        user: this.env.PROXY_USERNAME,
        password: this.env.PROXY_PASSWORD,
        ...(proxyType === 'https' ? { tls: true } : {}),
      })
    }

    return new SocksProxyTcpTransport({
      host: this.env.PROXY_IP,
      port: Number(this.env.PROXY_PORT),
      user: this.env.PROXY_USERNAME,
      password: this.env.PROXY_PASSWORD,
    })
  }

  public get sessionId() {
    return this.session.dbId
  }

  public get isOnline() {
    return this.me !== undefined
  }

  private constructor(
    private session: TelegramSessionStore,
    appName: string,
    deps: TelegramClientDependencies,
    storage?: any,
  ) {
    this.env = resolveTelegramEnv(deps.env)
    const loggerFactory = resolveLoggerFactory(deps.loggerFactory)
    this.logger = loggerFactory('TelegramClient')
    this.tempPath = resolveTempPath(this.env, deps.tempPath)

    const dataDir = this.env.DATA_DIR || '/app/data'
    if (!fs.existsSync(dataDir)) {
      try {
        fs.mkdirSync(dataDir, { recursive: true })
      }
      catch (err: any) {
        this.logger.error(`无法创建数据目录 ${dataDir}: 权限拒绝。请确保容器内用户对挂载卷有写权限。`, err)
        throw new Error(`EACCES: 权限拒绝，无法创建目录 ${dataDir}`)
      }
    }

    // 测试目录写权限
    try {
      const testFile = path.join(dataDir, `.perm_test_${Date.now()}`)
      fs.writeFileSync(testFile, '')
      fs.unlinkSync(testFile)
    }
    catch (err: any) {
      if (err.code === 'EACCES') {
        this.logger.error(`对数据目录 ${dataDir} 没有写权限。
请检查挂载卷权限，或运行: chown -R 1000:1000 <主机数据目录>`, err)
        throw new Error(`EACCES: 权限拒绝，无法写入目录 ${dataDir}`)
      }
    }

    const defaultStorage = path.join(dataDir, 'session.db')
    const finalStorage = storage || defaultStorage
    const proxyTransport = this.createProxyTransport()

    try {
      this.client = new TelegramClient({
        apiId: Number(this.env.TG_API_ID),
        apiHash: this.env.TG_API_HASH as string,
        storage: finalStorage,
        ...(proxyTransport ? { transport: proxyTransport } : {}),
        initConnectionOptions: {},
      })
    }
    catch (err: any) {
      if (err.message?.includes('readonly') || err.code === 'SQLITE_CANTOPEN') {
        this.logger.error(`无法打开 SQLite 数据库 ${finalStorage}: 可能是权限不足。`, err)
      }
      throw err
    }
    this.dispatcher = Dispatcher.for(this.client)
  }

  public static async create(startArgs: any, appName = 'NapGram') {
    const deps = getTelegramClientDependencies()
    const session = deps.sessionFactory()
    await session.load()

    const bot = new this(session, appName, deps)

    if (session.sessionString) {
      await bot.client.importSession(session.sessionString, true)
    }

    const env = resolveTelegramEnv(deps.env)
    const authMode = normalizeAuthMode(startArgs.authMode)
    const botToken = authMode === 'user'
      ? undefined
      : startArgs.botToken ?? startArgs.botAuthToken ?? env.TG_BOT_TOKEN
    bot.logger.info(authMode === 'user' ? '开始登录 TG User' : '开始登录 TG Bot')
    try {
      await bot.client.start({
        phone: startArgs.phoneNumber,
        code: startArgs.phoneCode,
        password: startArgs.password,
        ...(botToken ? { botToken } : {}),
      })
      bot.logger.info(authMode === 'user' ? 'TG User 登录成功' : 'TG Bot 登录成功')
    }
    catch (err) {
      bot.logger.error(authMode === 'user' ? 'TG User 登录失败' : 'TG Bot 登录失败', err)
      throw err
    }

    const sessionStr = await bot.client.exportSession()
    await session.save(sessionStr)

    if (session.dbId !== undefined) {
      Telegram.existedBots[session.dbId] = bot
    }
    await bot.config()
    return bot
  }

  public static async connect(sessionId: number, appName = 'NapGram', botTokenOrOptions?: string | TelegramConnectOptions) {
    if (this.existedBots[sessionId]) {
      return this.existedBots[sessionId]
    }
    const deps = getTelegramClientDependencies()
    const session = deps.sessionFactory(sessionId)
    await session.load()

    const bot = new this(session, appName, deps)
    if (session.dbId !== undefined) {
      Telegram.existedBots[session.dbId] = bot
    }

    if (session.sessionString) {
      await bot.client.importSession(session.sessionString, true)
    }

    const env = resolveTelegramEnv(deps.env)
    const authMode = normalizeAuthMode(typeof botTokenOrOptions === 'object' ? botTokenOrOptions.authMode : undefined)
    const explicitBotToken = typeof botTokenOrOptions === 'string' ? botTokenOrOptions : botTokenOrOptions?.botToken
    const effectiveBotToken = authMode === 'user' ? undefined : explicitBotToken ?? env.TG_BOT_TOKEN

    const phoneOpt = typeof botTokenOrOptions === 'object' ? botTokenOrOptions.phone : undefined
    const codeOpt = typeof botTokenOrOptions === 'object' ? botTokenOrOptions.code : undefined
    const passwordOpt = typeof botTokenOrOptions === 'object' ? botTokenOrOptions.password : undefined

    try {
      bot.logger.info(authMode === 'user' ? '开始登录 TG User（已有 session）' : '开始登录 TG Bot（已有 session）')
      await bot.client.start({
        ...(effectiveBotToken ? { botToken: effectiveBotToken } : {}),
        ...(phoneOpt ? { phone: phoneOpt } : {}),
        ...(codeOpt ? { code: codeOpt } : {}),
        ...(passwordOpt ? { password: passwordOpt } : {}),
      })
      bot.logger.info(authMode === 'user' ? 'TG User 登录成功' : 'TG Bot 登录成功')
      const sessionStr = await bot.client.exportSession()
      await session.save(sessionStr)
    }
    catch (err) {
      bot.logger.error(authMode === 'user' ? 'TG User 登录失败' : 'TG Bot 登录失败', err)
      throw err
    }
    await bot.config()
    return bot
  }

  private async config() {
    this.me = await this.client.getMe()
    this.dispatcher.onNewMessage(this.onMessage)
    this.dispatcher.onEditMessage(this.onEditedMessage)
    this.dispatcher.onDeleteMessage(this.onDeleteMessage)
  }

  private onMessage = async (msg: Message) => {
    this.logger.debug(`[TG] recv ${msg.id} from ${msg.chat.id}`)
    for (const handler of this.onMessageHandlers) {
      const result = await handler(msg)
      if (result === true) {
        return
      }
    }
  }

  private onEditedMessage = async (msg: Message) => {
    for (const handler of this.onEditedMessageHandlers) {
      await handler(msg)
    }
  }

  private onDeleteMessage = async (update: any) => {
    const ids = update.messageIds || update.messages || []
    this.logger.info(`[TG] message deleted in ${update.channelId || update.chatId}: ${ids.join(', ')}`)
    for (const handler of this.onDeletedMessageHandlers) {
      await handler(update)
    }
  }

  private readonly onMessageHandlers: Array<MessageHandler> = []
  private readonly onEditedMessageHandlers: Array<MessageHandler> = []
  private readonly onDeletedMessageHandlers: Array<(update: any) => Promise<void>> = []

  public addNewMessageEventHandler(handler: MessageHandler) {
    this.onMessageHandlers.push(handler)
  }

  public removeNewMessageEventHandler(handler: MessageHandler) {
    const index = this.onMessageHandlers.indexOf(handler)
    if (index > -1) {
      this.onMessageHandlers.splice(index, 1)
    }
  }

  public addEditedMessageEventHandler(handler: MessageHandler) {
    this.onEditedMessageHandlers.push(handler)
  }

  public removeEditedMessageEventHandler(handler: MessageHandler) {
    const index = this.onEditedMessageHandlers.indexOf(handler)
    if (index > -1) {
      this.onEditedMessageHandlers.splice(index, 1)
    }
  }

  public addDeletedMessageEventHandler(handler: (update: any) => Promise<void>) {
    this.onDeletedMessageHandlers.push(handler)
  }

  public removeDeletedMessageEventHandler(handler: (update: any) => Promise<void>) {
    const index = this.onDeletedMessageHandlers.indexOf(handler)
    if (index > -1) {
      this.onDeletedMessageHandlers.splice(index, 1)
    }
  }

  public async getChat(chatId: number | string | bigint) {
    const { default: TelegramChat } = await import('./chat.js')
    const chat = await this.client.getChat(chatId as any)
    return new TelegramChat(this, this.client, chat)
  }

  /**
   * 直接发送文本消息（支持用户 ID、群组 ID 等所有 peer 类型）
   * 与 getChat().sendMessage() 不同，此方法不依赖 getChat，可正确处理私聊用户 ID
   */
  public async sendText(chatId: number | string | bigint, text: string, params?: Parameters<TelegramClient['sendText']>[2]) {
    return await this.client.sendText(chatId as any, text, params)
  }

  /**
   * 下载媒体文件
   * @param media 媒体对象或 Message
   * @returns 文件内容的 Buffer
   */
  public async downloadMedia(media: any | Message): Promise<Buffer> {
    let result: Uint8Array
    if (media instanceof Message && media.media) {
      result = await this.client.downloadAsBuffer(media.media as any)
    }
    else {
      result = await this.client.downloadAsBuffer(media)
    }
    return Buffer.from(result)
  }

  private getTempUrl(filename: string) {
    const baseUrl = this.env.INTERNAL_WEB_ENDPOINT || this.env.WEB_ENDPOINT || 'http://napgram-dev:8080'
    return `${baseUrl}/temp/${filename}`
  }

  private sanitizeFilename(name: string) {
    return path
      .basename(name)
      .replace(/[\\/]/g, '_')
      .replace(/[^\w.\-+@() ]/g, '_')
      .trim()
      .slice(0, 200) || `file-${Date.now()}`
  }

  /**
   * 下载媒体文件到本地 temp 目录（避免将整个文件一次性读入内存）。
   * @returns 返回 temp 文件的 URL（默认）或本地路径
   */
  public async downloadMediaToTempFile(
    media: any | Message,
    options?: { prefix?: string, filename?: string, ext?: string, returnType?: 'url' | 'path' },
  ): Promise<string> {
    const prefix = options?.prefix || 'tg'
    const mediaObj = media instanceof Message && (media as any).media ? (media as any).media : media
    const nameFromMedia = typeof (mediaObj as any)?.fileName === 'string' ? (mediaObj as any).fileName : undefined
    const baseName = options?.filename || nameFromMedia
    const rawName = baseName
      ? `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}-${baseName}`
      : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`

    const sanitized = this.sanitizeFilename(rawName)
    const ext = options?.ext ? (options.ext.startsWith('.') ? options.ext : `.${options.ext}`) : ''
    const filename = ext && !sanitized.toLowerCase().endsWith(ext.toLowerCase()) ? `${sanitized}${ext}` : sanitized

    await fs.promises.mkdir(this.tempPath, { recursive: true })
    const filePath = path.join(this.tempPath, filename)

    try {
      const location = media instanceof Message && (media as any).media ? (media as any).media : media
      await this.client.downloadToFile(filePath, location as any)
    }
    catch (error) {
      try {
        await fs.promises.rm(filePath, { force: true })
      }
      catch { }
      throw error
    }

    return options?.returnType === 'path' ? filePath : this.getTempUrl(filename)
  }

  /**
   * 下载用户头像
   * @param userId 用户 ID
   * @returns 头像文件的 Buffer，如果没有头像则返回 null
   */
  public async downloadProfilePhoto(userId: InputPeerLike): Promise<Buffer | null> {
    try {
      const chat = await this.client.getChat(userId)
      if (!chat.photo) {
        return null
      }
      const result = await this.client.downloadAsBuffer(chat.photo.big as any)
      return Buffer.from(result)
    }
    catch (error) {
      this.logger.warn(`Failed to download profile photo for ${userId}:`, error)
      return null
    }
  }

  /**
   * 断开与 Telegram 的连接
   */
  public async disconnect() {
    this.logger.info('Disconnecting from Telegram...')
    try {
      await this.client.disconnect()
      this.me = undefined
      this.logger.info('Disconnected successfully')
    }
    catch (error) {
      this.logger.error('Error during disconnect:', error)
      throw error
    }
  }
}
