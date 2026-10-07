import type { MessageReceipt, UnifiedMessage } from '@napgram/message-kit'
import type { IQQClient } from '../../../infrastructure/clients/qq'

const EVENT_METHODS = new Set(['on', 'off', 'once', 'emit'])

/**
 * 组合多个 QQ 客户端，对外暴露单一 IQQClient。
 *
 * 并存语义：群聊 / 私聊走 NapCat（个人号协议，具备合并转发、媒体、撤回同步等能力），
 * 频道（channel）走 QQ 官方机器人 API。上层无需逐点判断使用哪个客户端。
 *
 * 事件监听会注册到所有底层客户端，因此两个客户端的消息 / 上下线事件都能被上层接收。
 * 未显式路由的方法统一转发到主客户端（NapCat 优先），缺失时回落到官方客户端。
 */
export class QQClientRouter {
  readonly napcat?: IQQClient
  readonly official?: IQQClient

  constructor(napcat?: IQQClient, official?: IQQClient) {
    this.napcat = napcat
    this.official = official
  }

  get clients(): IQQClient[] {
    return [this.napcat, this.official].filter(Boolean) as IQQClient[]
  }

  private get primary(): IQQClient | undefined {
    return this.napcat ?? this.official
  }

  private route(chatType?: string): IQQClient | undefined {
    if (chatType === 'channel' && this.official)
      return this.official
    return this.primary
  }

  get uin(): number {
    return this.primary?.uin ?? 0
  }

  get nickname(): string {
    return this.primary?.nickname ?? ''
  }

  get clientType(): 'napcat' | 'qqofficial' {
    return this.napcat ? 'napcat' : 'qqofficial'
  }

  async isOnline(): Promise<boolean> {
    if (!this.napcat)
      return this.official ? await this.official.isOnline() : false
    const napcatOnline = await this.napcat.isOnline()
    if (!this.official)
      return napcatOnline
    return napcatOnline || await this.official.isOnline()
  }

  async sendMessage(chatId: string, message: UnifiedMessage): Promise<MessageReceipt> {
    const target = this.route(message?.chat?.type)
    if (!target)
      throw new Error('QQ 客户端未初始化')
    return await target.sendMessage(chatId, message)
  }

  async sendGroupForwardMsg(groupId: string, messages: any[]): Promise<MessageReceipt> {
    // 合并转发是 NapCat 专有能力，官方机器人 API 不支持
    const target = this.napcat ?? this.official
    if (!target)
      throw new Error('QQ 客户端未初始化')
    return await target.sendGroupForwardMsg(groupId, messages)
  }

  async recallMessage(messageId: string): Promise<void> {
    const official = this.official as (IQQClient & { hasRecallContext?: (id: string) => boolean }) | undefined
    // 频道撤回需要 channel 上下文，只有官方客户端持有该上下文时才走它
    if (official?.hasRecallContext?.(messageId)) {
      await official.recallMessage(messageId)
      return
    }
    if (!this.primary)
      throw new Error('QQ 客户端未初始化')
    await this.primary.recallMessage(messageId)
  }

  async getMessage(messageId: string): Promise<UnifiedMessage | null> {
    const fromPrimary = this.primary ? await this.primary.getMessage(messageId) : null
    if (fromPrimary || !this.official || this.official === this.primary)
      return fromPrimary
    return await this.official.getMessage(messageId)
  }

  /** 返回实现了 IQQClient 的代理，未显式路由的方法转发到主客户端 */
  asClient(): IQQClient {
    // 箭头捕获而非 `const router = this`，避免 no-this-alias
    const self = (): QQClientRouter => this
    const base: Record<string, unknown> = {
      get uin() { return self().uin },
      get nickname() { return self().nickname },
      get clientType() { return self().clientType },
      isOnline: () => self().isOnline(),
      sendMessage: (chatId: string, message: UnifiedMessage) => self().sendMessage(chatId, message),
      sendGroupForwardMsg: (groupId: string, messages: any[]) => self().sendGroupForwardMsg(groupId, messages),
      recallMessage: (messageId: string) => self().recallMessage(messageId),
      getMessage: (messageId: string) => self().getMessage(messageId),
      getUnderlyingClients: () => self().clients,
    }

    return new Proxy(base, {
      get(target, prop, receiver) {
        if (typeof prop !== 'string')
          return Reflect.get(target, prop, receiver)

        if (prop in target)
          return Reflect.get(target, prop, receiver)

        // 事件方法：广播到所有底层客户端
        if (EVENT_METHODS.has(prop)) {
          return (...args: any[]) => {
            let result: any
            for (const client of self().clients)
              result = (client as any)[prop]?.(...args)
            return result
          }
        }

        const router = self()
        const source = (router.primary ?? router.official) as any
        const value = source?.[prop]
        if (typeof value !== 'function')
          return value
        return (...args: any[]) => value.apply(source, args)
      },
    }) as unknown as IQQClient
  }
}

/**
 * 仅在两个客户端同时存在时才需要路由。单客户端场景直接返回原对象，
 * 避免代理包装破坏对象身份（上层存在 `client.fn === fn` 之类的相等性判断）。
 */
export function createQQClientRouter(napcat?: IQQClient, official?: IQQClient): IQQClient {
  if (!napcat && !official)
    throw new Error('QQ 客户端未初始化')
  if (!official)
    return napcat as IQQClient
  if (!napcat)
    return official
  return new QQClientRouter(napcat, official).asClient()
}
