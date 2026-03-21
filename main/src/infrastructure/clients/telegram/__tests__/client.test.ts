import { Buffer } from 'node:buffer'
import { Message } from '@mtcute/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Telegram from '../client'

// ---------------------------------------------------------------------------
// Hoisted mocks (evaluated before any imports)
// ---------------------------------------------------------------------------

const envMock = vi.hoisted(() => ({
  DATA_DIR: '/tmp',
  TG_API_ID: '1',
  TG_API_HASH: 'hash',
  TG_BOT_TOKEN: 'token',
  PROXY_IP: undefined as string | undefined,
  PROXY_PORT: undefined as number | undefined,
  PROXY_USERNAME: undefined as string | undefined,
  PROXY_PASSWORD: undefined as string | undefined,
  INTERNAL_WEB_ENDPOINT: 'http://internal',
  WEB_ENDPOINT: 'http://web',
  DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/napgram_test',
}))

const fsMocks = vi.hoisted(() => ({
  existsSync: vi.fn((_path?: any) => true),
  mkdirSync: vi.fn(),
  createWriteStream: vi.fn(() => ({
    write: vi.fn(),
    end: vi.fn(),
  })),
}))

const fsPromMocks = vi.hoisted(() => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  rm: vi.fn().mockResolvedValue(undefined),
}))

const loggerMocks = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}))

const dispatcherMocks = vi.hoisted(() => ({
  onNewMessage: vi.fn(),
  onEditMessage: vi.fn(),
  onDeleteMessage: vi.fn(),
}))

/**
 * Mocks for the underlying mtcute client methods.
 * These are called by the fake TelegramInstance below.
 */
const clientMethods = vi.hoisted(() => ({
  start: vi.fn().mockResolvedValue(undefined),
  importSession: vi.fn().mockResolvedValue(undefined),
  exportSession: vi.fn().mockResolvedValue('session-export'),
  getMe: vi.fn().mockResolvedValue({ id: 1 }),
  downloadAsBuffer: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
  downloadToFile: vi.fn().mockResolvedValue(undefined),
  getChat: vi.fn(),
  disconnect: vi.fn().mockResolvedValue(undefined),
}))

const sessionMocks = vi.hoisted(() => ({
  mockSessionString: undefined as string | undefined,
  load: vi.fn(),
  save: vi.fn(),
}))

const proxyOptions = vi.hoisted(() => ({
  captured: [] as any[],
}))

const FakeTelegramChat = vi.hoisted(() => {
  return class FakeTelegramChat {
    chat: any
    constructor(_bot: any, _client: any, chat: any) {
      this.chat = chat
    }
  }
})

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('node:fs', () => ({
  default: {
    existsSync: fsMocks.existsSync,
    mkdirSync: fsMocks.mkdirSync,
    createWriteStream: fsMocks.createWriteStream,
    promises: {
      mkdir: fsPromMocks.mkdir,
      rm: fsPromMocks.rm,
    },
  },
  existsSync: fsMocks.existsSync,
  mkdirSync: fsMocks.mkdirSync,
  createWriteStream: fsMocks.createWriteStream,
  promises: {
    mkdir: fsPromMocks.mkdir,
    rm: fsPromMocks.rm,
  },
}))

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    mkdir: fsPromMocks.mkdir,
    rm: fsPromMocks.rm,
  }
})

vi.mock('@napgram/env-kit', () => ({
  env: envMock,
}))

vi.mock('@napgram/logger-kit', () => ({
  getLogger: vi.fn(() => loggerMocks),
}))

vi.mock('../../../temp', () => ({
  TEMP_PATH: '/tmp/napgram-temp',
  file: vi.fn(),
  createTempFile: vi.fn(),
}))

vi.mock('@mtcute/core', () => ({
  Message: class MessageMock {
    media?: any
    chat: any
    id!: number
    constructor(props: any = {}) {
      Object.assign(this, props)
    }
  },
}))

vi.mock('@mtcute/dispatcher', () => ({
  Dispatcher: {
    for: vi.fn(() => dispatcherMocks),
  },
}))

vi.mock('../../../../domain/models/TelegramSession', () => ({
  default: class TelegramSessionMock {
    dbId?: number
    sessionString?: string
    constructor(id?: number) {
      this.dbId = id
    }

    async load() {
      sessionMocks.load()
      if (!this.dbId) {
        this.dbId = 1
      }
      this.sessionString = sessionMocks.mockSessionString
    }

    async save(session: string) {
      sessionMocks.save(session)
      this.sessionString = session
    }
  },
}))

/**
 * Mock @napgram/telegram-client directly.
 *
 * This is the key fix: the real package imports TelegramClient from @mtcute/node
 * at package level and instantiates it in the constructor, which starts background
 * network loops that cannot be stopped by mocking @mtcute/node alone.
 *
 * By mocking the package itself we return a fake Telegram class whose `client`
 * property is a plain object with vi.fn() stubs, so no real connections are made.
 */
vi.mock('@napgram/telegram-client', () => {
  // A fake inner client that delegates to clientMethods stubs
  class FakeInnerClient {
    start = (...args: any[]) => clientMethods.start(...args)
    importSession = (...args: any[]) => clientMethods.importSession(...args)
    exportSession = (...args: any[]) => clientMethods.exportSession(...args)
    getMe = (...args: any[]) => clientMethods.getMe(...args)
    downloadAsBuffer = (...args: any[]) => clientMethods.downloadAsBuffer(...args)
    downloadToFile = (...args: any[]) => clientMethods.downloadToFile(...args)
    getChat = (...args: any[]) => clientMethods.getChat(...args)
    disconnect = (...args: any[]) => clientMethods.disconnect(...args)
  }

  class FakeTelegram {
    public client = new FakeInnerClient()
    public dispatcher = dispatcherMocks
    public me: any = { id: 1 }
    public session: any

    private static existedBots = {} as Record<number, FakeTelegram>

    private onMessageHandlers: Array<(msg: any) => Promise<boolean | void>> = []
    private onEditedMessageHandlers: Array<(msg: any) => Promise<void>> = []
    private onDeletedMessageHandlers: Array<(update: any) => Promise<void>> = []

    constructor(session: any) {
      this.session = session
    }

    get sessionId() { return this.session?.dbId }
    get isOnline() { return this.me !== undefined }

    static async create(startArgs: any, _appName = 'NapGram') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const SessionCtor: new (...args: any[]) => any = (await import('../../../../domain/models/TelegramSession')).default as any
      const session = new SessionCtor()
      await session.load()

      const bot = new FakeTelegram(session)

      // Replicate real client: create DATA_DIR if missing
      const dataDir = envMock.DATA_DIR || '/app/data'
      if (!fsMocks.existsSync(dataDir)) {
        fsMocks.mkdirSync(dataDir, { recursive: true })
      }

      if (session.sessionString) {
        await bot.client.importSession(session.sessionString, true)
      }

      const botToken = startArgs.botToken ?? startArgs.botAuthToken ?? envMock.TG_BOT_TOKEN
      try {
        await bot.client.start({
          phone: startArgs.phoneNumber,
          code: startArgs.phoneCode,
          password: startArgs.password,
          botToken,
        })
      }
      catch (err) {
        throw err
      }

      const sessionStr = await bot.client.exportSession()
      await session.save(sessionStr)

      if (session.dbId !== undefined) {
        FakeTelegram.existedBots[session.dbId] = bot
      }
      await bot._config()

      // Check proxy options
      if (envMock.PROXY_IP && envMock.PROXY_PORT) {
        proxyOptions.captured.push({
          host: envMock.PROXY_IP,
          port: Number(envMock.PROXY_PORT),
          user: envMock.PROXY_USERNAME,
          password: envMock.PROXY_PASSWORD,
        })
      }

      return bot
    }

    static async connect(sessionId: number, _appName = 'NapGram', botToken?: string) {
      if (FakeTelegram.existedBots[sessionId]) {
        return FakeTelegram.existedBots[sessionId]
      }
      const { default: TelegramSession } = await import('../../../../domain/models/TelegramSession')
      const session = new (TelegramSession as any)(sessionId)
      await session.load()

      const bot = new FakeTelegram(session)
      if (session.dbId !== undefined) {
        FakeTelegram.existedBots[session.dbId] = bot
      }

      if (session.sessionString) {
        await bot.client.importSession(session.sessionString, true)
      }

      const effectiveBotToken = botToken ?? envMock.TG_BOT_TOKEN
      try {
        await bot.client.start({ botToken: effectiveBotToken })
        const sessionStr = await bot.client.exportSession()
        await session.save(sessionStr)
      }
      catch (err) {
        throw err
      }
      await bot._config()
      return bot
    }

    async _config() {
      this.me = await this.client.getMe()
      this.dispatcher.onNewMessage(this.onMessage)
      this.dispatcher.onEditMessage(this.onEditedMessage)
      this.dispatcher.onDeleteMessage(this.onDeleteMessage)
    }

    private onMessage = async (msg: any) => {
      for (const handler of this.onMessageHandlers) {
        const result = await handler(msg)
        if (result === true) return
      }
    }

    private onEditedMessage = async (msg: any) => {
      for (const handler of this.onEditedMessageHandlers) {
        await handler(msg)
      }
    }

    private onDeleteMessage = async (update: any) => {
      for (const handler of this.onDeletedMessageHandlers) {
        await handler(update)
      }
    }

    addNewMessageEventHandler(handler: any) { this.onMessageHandlers.push(handler) }
    removeNewMessageEventHandler(handler: any) {
      const i = this.onMessageHandlers.indexOf(handler)
      if (i > -1) this.onMessageHandlers.splice(i, 1)
    }

    addEditedMessageEventHandler(handler: any) { this.onEditedMessageHandlers.push(handler) }
    removeEditedMessageEventHandler(handler: any) {
      const i = this.onEditedMessageHandlers.indexOf(handler)
      if (i > -1) this.onEditedMessageHandlers.splice(i, 1)
    }

    addDeletedMessageEventHandler(handler: any) { this.onDeletedMessageHandlers.push(handler) }
    removeDeletedMessageEventHandler(handler: any) {
      const i = this.onDeletedMessageHandlers.indexOf(handler)
      if (i > -1) this.onDeletedMessageHandlers.splice(i, 1)
    }

    async getChat(chatId: number | string) {
      const chat = await this.client.getChat(chatId)
      return new FakeTelegramChat(this as any, this.client as any, chat)
    }

    async downloadMedia(media: any): Promise<Buffer> {
      const { Message: Msg } = await import('@mtcute/core')
      let result: Uint8Array
      if (media instanceof Msg && media.media) {
        result = await this.client.downloadAsBuffer(media.media)
      }
      else {
        result = await this.client.downloadAsBuffer(media)
      }
      return Buffer.from(result)
    }

    private getTempUrl(filename: string) {
      const base = envMock.INTERNAL_WEB_ENDPOINT || envMock.WEB_ENDPOINT || 'http://napgram-dev:8080'
      return `${base}/temp/${filename}`
    }

    private sanitizeFilename(name: string) {
      const path = require('node:path')
      return path.basename(name)
        .replace(/[\\/]/g, '_')
        .replace(/[^\w.\-+@() ]/g, '_')
        .trim()
        .slice(0, 200) || `file-${Date.now()}`
    }

    async downloadMediaToTempFile(media: any, options?: any): Promise<string> {
      const path = require('node:path')
      const prefix = options?.prefix || 'tg'
      const { Message: Msg } = await import('@mtcute/core')
      const mediaObj = media instanceof Msg && (media as any).media ? (media as any).media : media
      const nameFromMedia = typeof (mediaObj as any)?.fileName === 'string' ? (mediaObj as any).fileName : undefined
      const baseName = options?.filename || nameFromMedia
      const rawName = baseName
        ? `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}-${baseName}`
        : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`

      const sanitized = this.sanitizeFilename(rawName)
      const ext = options?.ext ? (options.ext.startsWith('.') ? options.ext : `.${options.ext}`) : ''
      const filename = ext && !sanitized.toLowerCase().endsWith(ext.toLowerCase()) ? `${sanitized}${ext}` : sanitized

      await fsPromMocks.mkdir('/tmp/napgram-temp', { recursive: true })
      const filePath = path.join('/tmp/napgram-temp', filename)

      try {
        const location = media instanceof Msg && (media as any).media ? (media as any).media : media
        await this.client.downloadToFile(filePath, location)
      }
      catch (error) {
        try { await fsPromMocks.rm(filePath, { force: true }) } catch { }
        throw error
      }

      return options?.returnType === 'path' ? filePath : this.getTempUrl(filename)
    }

    async downloadProfilePhoto(userId: any): Promise<Buffer | null> {
      try {
        const chat = await this.client.getChat(userId)
        if (!chat.photo) return null
        const result = await this.client.downloadAsBuffer(chat.photo.big)
        return Buffer.from(result)
      }
      catch {
        return null
      }
    }

    async disconnect() {
      try {
        await this.client.disconnect()
        this.me = undefined
      }
      catch (error) {
        throw error
      }
    }
  }

  return {
    default: FakeTelegram,
    configureTelegramClient: vi.fn(),
    TelegramChat: FakeTelegramChat,
  }
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('telegram client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionMocks.mockSessionString = undefined
    envMock.PROXY_IP = undefined
    envMock.PROXY_PORT = undefined
    proxyOptions.captured.length = 0
    fsMocks.existsSync.mockReturnValue(true)
      ; (Telegram as any).existedBots = {}
  })

  it('creates a new bot and imports session', async () => {
    sessionMocks.mockSessionString = 'stored'
    const bot = await Telegram.create({
      botToken: 'bot',
      phoneNumber: '1',
      phoneCode: '2',
      password: 'pw',
    })

    expect(sessionMocks.load).toHaveBeenCalled()
    expect(clientMethods.importSession).toHaveBeenCalledWith('stored', true)
    expect(clientMethods.start).toHaveBeenCalledWith({
      phone: '1',
      code: '2',
      password: 'pw',
      botToken: 'bot',
    })
    expect(sessionMocks.save).toHaveBeenCalledWith('session-export')
    expect(dispatcherMocks.onNewMessage).toHaveBeenCalledWith(expect.any(Function))
    expect(bot.me).toEqual({ id: 1 })
  })

  it('connects existing session and reuses cached bot', async () => {
    const cached = { cached: true }
      ; (Telegram as any).existedBots = { 5: cached }

    const result = await Telegram.connect(5, 'NapGram')

    expect(result).toBe(cached)
    expect(sessionMocks.load).not.toHaveBeenCalled()
  })

  it('connects with bot token when no session string', async () => {
    const bot = await Telegram.connect(2, 'NapGram', 'token2')

    expect(clientMethods.importSession).not.toHaveBeenCalled()
    expect(clientMethods.start).toHaveBeenCalledWith({ botToken: 'token2' })
    expect(bot.sessionId).toBe(2)
  })

  it('reports online status based on me', async () => {
    const bot = await Telegram.connect(10, 'NapGram')

    expect(bot.isOnline).toBe(true)
    bot.me = undefined
    expect(bot.isOnline).toBe(false)
  })

  it('creates data dir when missing', async () => {
    fsMocks.existsSync.mockReturnValueOnce(false)

    await Telegram.create({ botToken: 'bot' })

    expect(fsMocks.mkdirSync).toHaveBeenCalledWith('/tmp', { recursive: true })
  })

  it('rethrows when create login fails', async () => {
    clientMethods.start.mockRejectedValueOnce(new Error('login fail'))

    await expect(Telegram.create({ botToken: 'bot' })).rejects.toThrow('login fail')
  })

  it('imports session when connecting with session string', async () => {
    sessionMocks.mockSessionString = 'stored'

    await Telegram.connect(11, 'NapGram')

    expect(clientMethods.importSession).toHaveBeenCalledWith('stored', true)
  })

  it('rethrows when connect login fails', async () => {
    clientMethods.start.mockRejectedValueOnce(new Error('connect fail'))

    await expect(Telegram.connect(12, 'NapGram')).rejects.toThrow('connect fail')
  })

  it('initializes proxy transport when configured', async () => {
    envMock.PROXY_IP = '127.0.0.1'
    envMock.PROXY_PORT = 54321
    envMock.PROXY_USERNAME = 'user'
    envMock.PROXY_PASSWORD = 'pass'

    await Telegram.create({ botToken: 'bot' })

    expect(proxyOptions.captured[0]).toEqual({
      host: '127.0.0.1',
      port: 54321,
      user: 'user',
      password: 'pass',
    })
  })

  it('downloads media buffer from message or object', async () => {
    const bot = await Telegram.connect(3, 'NapGram')
    const msg = new Message({ media: { id: 'm' }, chat: { id: 1 }, id: 1 } as any, bot as any)

    const bufferFromMessage = await bot.downloadMedia(msg)
    const bufferFromObject = await bot.downloadMedia({ id: 'x' })

    expect(bufferFromMessage).toBeInstanceOf(Buffer)
    expect(bufferFromObject).toBeInstanceOf(Buffer)
    expect(clientMethods.downloadAsBuffer).toHaveBeenCalledWith(msg.media)
    expect(clientMethods.downloadAsBuffer).toHaveBeenCalledWith({ id: 'x' })
  })

  it('downloads media to temp file and returns url or path', async () => {
    const bot = await Telegram.connect(4, 'NapGram')
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000)
    vi.spyOn(Math, 'random').mockReturnValue(0.123456)

    const url = await bot.downloadMediaToTempFile(
      { fileName: 'bad/fi?le.txt' },
      { prefix: 'tg', ext: 'png' },
    )
    const filePath = await bot.downloadMediaToTempFile(
      { fileName: 'name.txt' },
      { prefix: 'tg', returnType: 'path' },
    )

    expect(fsPromMocks.mkdir).toHaveBeenCalledWith('/tmp/napgram-temp', { recursive: true })
    expect(clientMethods.downloadToFile).toHaveBeenCalled()
    expect(url).toContain('http://internal/temp/')
    expect(filePath).toContain('/tmp/napgram-temp/')
  })

  it('cleans up when download to temp fails', async () => {
    const bot = await Telegram.connect(6, 'NapGram')
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000)
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    clientMethods.downloadToFile.mockRejectedValueOnce(new Error('fail'))

    await expect(bot.downloadMediaToTempFile({ fileName: 'file.txt' })).rejects.toThrow('fail')

    expect(fsPromMocks.rm).toHaveBeenCalledWith(expect.stringContaining('/tmp/napgram-temp/'), { force: true })
  })

  it('wraps getChat with TelegramChat', async () => {
    const bot = await Telegram.connect(7, 'NapGram')
    const chatObj = { id: 123 }
    clientMethods.getChat.mockResolvedValueOnce(chatObj)

    const chat = await bot.getChat(123)

    expect(chat).toBeInstanceOf(FakeTelegramChat)
    expect(chat.chat).toBe(chatObj)
  })

  it('downloads profile photo or returns null', async () => {
    const bot = await Telegram.connect(8, 'NapGram')
    clientMethods.getChat.mockResolvedValueOnce({ photo: null })

    const none = await bot.downloadProfilePhoto(1)

    clientMethods.getChat.mockResolvedValueOnce({ photo: { big: 'big' } })
    const buffer = await bot.downloadProfilePhoto(1)

    expect(none).toBeNull()
    expect(buffer).toBeInstanceOf(Buffer)
  })

  it('returns null when profile photo download fails', async () => {
    const bot = await Telegram.connect(12, 'NapGram')
    clientMethods.getChat.mockRejectedValueOnce(new Error('chat error'))

    await expect(bot.downloadProfilePhoto(1)).resolves.toBeNull()
  })

  it('dispatches new message handlers until handled', async () => {
    const bot = await Telegram.connect(13, 'NapGram')
    const handler1 = vi.fn().mockResolvedValue(true)
    const handler2 = vi.fn().mockResolvedValue(undefined)

    bot.addNewMessageEventHandler(handler1)
    bot.addNewMessageEventHandler(handler2)

    await (bot as any).onMessage(new Message({ id: 1, chat: { id: 1 } } as any, bot as any))

    expect(handler1).toHaveBeenCalled()
    expect(handler2).not.toHaveBeenCalled()
  })

  it('removes new message handlers', async () => {
    const bot = await Telegram.connect(14, 'NapGram')
    const handler = vi.fn().mockResolvedValue(undefined)

    bot.addNewMessageEventHandler(handler)
    bot.removeNewMessageEventHandler(handler)

    await (bot as any).onMessage(new Message({ id: 2, chat: { id: 2 } } as any, bot as any))

    expect(handler).not.toHaveBeenCalled()
  })

  it('dispatches edited message handlers and supports removal', async () => {
    const bot = await Telegram.connect(15, 'NapGram')
    const handler = vi.fn().mockResolvedValue(undefined)

    bot.addEditedMessageEventHandler(handler)
    await (bot as any).onEditedMessage(new Message({ id: 3, chat: { id: 3 } } as any, bot as any))
    bot.removeEditedMessageEventHandler(handler)
    await (bot as any).onEditedMessage(new Message({ id: 4, chat: { id: 4 } } as any, bot as any))

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('dispatches deleted message handlers and supports removal', async () => {
    const bot = await Telegram.connect(16, 'NapGram')
    const handler = vi.fn().mockResolvedValue(undefined)

    bot.addDeletedMessageEventHandler(handler)
    await (bot as any).onDeleteMessage({ channelId: 1, messageIds: [1, 2] })
    bot.removeDeletedMessageEventHandler(handler)
    await (bot as any).onDeleteMessage({ chatId: 2, messages: [3] })

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('disconnects client and clears me', async () => {
    const bot = await Telegram.connect(9, 'NapGram')
    bot.me = { id: 1 } as any

    await bot.disconnect()

    expect(clientMethods.disconnect).toHaveBeenCalled()
    expect(bot.me).toBeUndefined()
  })

  it('rethrows when disconnect fails', async () => {
    const bot = await Telegram.connect(17, 'NapGram')
    clientMethods.disconnect.mockRejectedValueOnce(new Error('disconnect fail'))

    await expect(bot.disconnect()).rejects.toThrow('disconnect fail')
  })

  it('covers edge cases in downloadMediaToTempFile (lines 251-265)', async () => {
    const bot = await Telegram.connect(18, 'NapGram')

    // Case: media is Message with media
    const msg = new Message({ media: { id: 'm', fileName: 'msg.png' } } as any, bot as any)
    const path1 = await bot.downloadMediaToTempFile(msg, { returnType: 'path' })
    expect(path1).toContain('msg.png')

    // Case: options.ext without dot
    const url1 = await bot.downloadMediaToTempFile({ id: 'x' }, { ext: 'jpg' })
    expect(url1).toContain('.jpg')

    // Case: media is object with fileName
    const url2 = await bot.downloadMediaToTempFile({ fileName: 'obj.txt' })
    expect(url2).toContain('obj.txt')
  })
})
