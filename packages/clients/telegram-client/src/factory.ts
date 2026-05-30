import type Telegram from './client.js'

export interface TelegramClientCreateParams {
  type: string
  authMode?: 'bot' | 'user'
  botToken?: string
  appName?: string
  [key: string]: any
}

export interface TelegramClientConnectParams {
  type: string
  sessionId: number
  authMode?: 'bot' | 'user'
  botToken?: string
  appName?: string
  [key: string]: any
}

export interface TelegramClientProvider {
  create: (params: TelegramClientCreateParams) => Promise<Telegram>
  connect: (params: TelegramClientConnectParams) => Promise<Telegram>
}

export class TelegramClientFactory {
  private providers = new Map<string, TelegramClientProvider>()

  register(type: string, provider: TelegramClientProvider) {
    if (this.providers.has(type)) {
      this.providers.set(type, provider)
      return
    }
    this.providers.set(type, provider)
  }

  async create(params: TelegramClientCreateParams): Promise<Telegram> {
    const provider = this.providers.get(params.type)
    if (!provider) {
      throw new Error(`Unknown Telegram client type: ${params.type}`)
    }
    return provider.create(params)
  }

  async connect(params: TelegramClientConnectParams): Promise<Telegram> {
    const provider = this.providers.get(params.type)
    if (!provider) {
      throw new Error(`Unknown Telegram client type: ${params.type}`)
    }
    return provider.connect(params)
  }
}

export const telegramClientFactory = new TelegramClientFactory()
