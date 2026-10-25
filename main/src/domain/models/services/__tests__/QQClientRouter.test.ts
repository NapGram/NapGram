import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { createQQClientRouter, QQClientRouter } from '../QQClientRouter.js'

function makeClient(overrides: Record<string, any> = {}) {
  return {
    uin: 10000,
    nickname: 'napcat',
    isOnline: mock().mockResolvedValue(true),
    sendMessage: mock().mockResolvedValue({ messageId: 'm1' }),
    sendGroupForwardMsg: mock().mockResolvedValue({ messageId: 'f1' }),
    recallMessage: mock().mockResolvedValue(undefined),
    getMessage: mock().mockResolvedValue(null),
    ...overrides,
  } as any
}

describe('QQClientRouter', () => {
  let napcat: any
  let official: any

  beforeEach(() => {
    napcat = makeClient()
    official = makeClient({ uin: 20000, nickname: 'official' })
  })

  it('exposes both underlying clients', () => {
    const router = new QQClientRouter(napcat, official)
    expect(router.clients).toEqual([napcat, official])
  })

  it('falls back to a single client list when only one exists', () => {
    expect(new QQClientRouter(napcat).clients).toEqual([napcat])
  })

  it('reads identity from the napcat primary by default', () => {
    const router = new QQClientRouter(napcat, official)
    expect(router.uin).toBe(10000)
    expect(router.nickname).toBe('napcat')
    expect(router.clientType).toBe('napcat')
  })

  it('reads identity from official when napcat is absent', () => {
    const router = new QQClientRouter(undefined, official)
    expect(router.uin).toBe(20000)
    expect(router.nickname).toBe('official')
    expect(router.clientType).toBe('qqofficial')
  })

  it('returns empty identity without clients', () => {
    const router = new QQClientRouter()
    expect(router.uin).toBe(0)
    expect(router.nickname).toBe('')
    expect(router.clients).toEqual([])
  })

  it('reports offline without clients', async () => {
    await expect(new QQClientRouter().isOnline()).resolves.toBe(false)
  })

  it('delegates isOnline to official alone when napcat is absent', async () => {
    official.isOnline.mockResolvedValue(false)
    await expect(new QQClientRouter(undefined, official).isOnline()).resolves.toBe(false)
  })

  it('short-circuits isOnline when napcat is online', async () => {
    await expect(new QQClientRouter(napcat, official).isOnline()).resolves.toBe(true)
    expect(official.isOnline).not.toHaveBeenCalled()
  })

  it('consults official when napcat is offline', async () => {
    napcat.isOnline.mockResolvedValue(false)
    await expect(new QQClientRouter(napcat, official).isOnline()).resolves.toBe(true)
    expect(official.isOnline).toHaveBeenCalledTimes(1)

    official.isOnline.mockResolvedValue(false)
    await expect(new QQClientRouter(napcat, official).isOnline()).resolves.toBe(false)
  })

  it('routes channel chats to the official client', async () => {
    const router = new QQClientRouter(napcat, official)
    await router.sendMessage('555', { chat: { type: 'channel' } } as any)
    expect(official.sendMessage).toHaveBeenCalledWith('555', { chat: { type: 'channel' } })
    expect(napcat.sendMessage).not.toHaveBeenCalled()
  })

  it('routes non-channel chats to the napcat primary', async () => {
    const router = new QQClientRouter(napcat, official)
    await router.sendMessage('123', { chat: { type: 'group' } } as any)
    expect(napcat.sendMessage).toHaveBeenCalledTimes(1)
    expect(official.sendMessage).not.toHaveBeenCalled()
  })

  it('routes channel chats back to napcat when official is missing', async () => {
    const router = new QQClientRouter(napcat)
    await router.sendMessage('555', { chat: { type: 'channel' } } as any)
    expect(napcat.sendMessage).toHaveBeenCalledTimes(1)
  })

  it('rejects sends without any client', async () => {
    const router = new QQClientRouter()
    await expect(router.sendMessage('1', {} as any)).rejects.toThrow('QQ 客户端未初始化')
  })

  it('always sends group forwards through napcat', async () => {
    const router = new QQClientRouter(napcat, official)
    await router.sendGroupForwardMsg('123', [])
    expect(napcat.sendGroupForwardMsg).toHaveBeenCalledTimes(1)
    expect(official.sendGroupForwardMsg).not.toHaveBeenCalled()
  })

  it('falls back to official for group forwards when napcat is missing', async () => {
    const router = new QQClientRouter(undefined, official)
    await router.sendGroupForwardMsg('123', [])
    expect(official.sendGroupForwardMsg).toHaveBeenCalledTimes(1)
  })

  it('rejects group forwards without any client', async () => {
    await expect(new QQClientRouter().sendGroupForwardMsg('1', [])).rejects.toThrow('QQ 客户端未初始化')
  })

  it('recalls through official when it holds the channel context', async () => {
    official.hasRecallContext = mock().mockReturnValue(true)
    const router = new QQClientRouter(napcat, official)
    await router.recallMessage('qq:channel:1')
    expect(official.recallMessage).toHaveBeenCalledTimes(1)
    expect(napcat.recallMessage).not.toHaveBeenCalled()
  })

  it('recalls through the primary without channel context', async () => {
    official.hasRecallContext = mock().mockReturnValue(false)
    const router = new QQClientRouter(napcat, official)
    await router.recallMessage('qq:g:1')
    expect(napcat.recallMessage).toHaveBeenCalledTimes(1)
  })

  it('rejects recalls without any client', async () => {
    await expect(new QQClientRouter().recallMessage('x')).rejects.toThrow('QQ 客户端未初始化')
  })

  it('returns the primary message without consulting official', async () => {
    napcat.getMessage.mockResolvedValue({ messageId: 'primary' })
    const router = new QQClientRouter(napcat, official)
    await expect(router.getMessage('a')).resolves.toEqual({ messageId: 'primary' })
    expect(official.getMessage).not.toHaveBeenCalled()
  })

  it('falls back to official when the primary has no message', async () => {
    official.getMessage.mockResolvedValue({ messageId: 'official' })
    const router = new QQClientRouter(napcat, official)
    await expect(router.getMessage('a')).resolves.toEqual({ messageId: 'official' })
  })

  it('returns null from getMessage without clients', async () => {
    await expect(new QQClientRouter().getMessage('a')).resolves.toBeNull()
  })

  it('does not double-query when official is the primary', async () => {
    const router = new QQClientRouter(undefined, official)
    await router.getMessage('a')
    expect(official.getMessage).toHaveBeenCalledTimes(1)
  })
})

describe('createQQClientRouter', () => {
  it('throws without any client', () => {
    expect(() => createQQClientRouter()).toThrow('QQ 客户端未初始化')
  })

  it('returns the napcat client identity when alone', () => {
    const napcat = { uin: 1 } as any
    expect(createQQClientRouter(napcat)).toBe(napcat)
  })

  it('returns the official client identity when alone', () => {
    const official = { uin: 2 } as any
    expect(createQQClientRouter(undefined, official)).toBe(official)
  })

  it('wraps both clients in a routing proxy', async () => {
    const napcat = {
      uin: 1,
      nickname: 'n',
      isOnline: mock().mockResolvedValue(true),
      sendMessage: mock().mockResolvedValue({ messageId: 'n' }),
      getFriendList: mock().mockResolvedValue(['f']),
      version: '4.5',
      on: mock().mockImplementation((_event: string, cb: any) => cb),
    } as any
    const official = {
      uin: 2,
      nickname: 'o',
      isOnline: mock().mockResolvedValue(false),
      sendMessage: mock().mockResolvedValue({ messageId: 'o' }),
      on: mock().mockImplementation((_event: string, cb: any) => cb),
    } as any

    const client = createQQClientRouter(napcat, official)

    expect(client.uin).toBe(1)
    expect(client.nickname).toBe('n')
    expect(client.clientType).toBe('napcat')
    expect(client.getUnderlyingClients()).toEqual([napcat, official])
    await expect(client.isOnline()).resolves.toBe(true)

    await client.sendMessage('555', { chat: { type: 'channel' } } as any)
    expect(official.sendMessage).toHaveBeenCalledTimes(1)

    // unknown methods forward to the primary with binding
    await client.getFriendList()
    expect(napcat.getFriendList).toHaveBeenCalledTimes(1)

    // non-function properties pass through from the primary
    expect((client as any).version).toBe('4.5')

    // event methods broadcast to every underlying client; the proxy returns
    // the last client's result (bun:test mock `on` implementations echo the handler)
    const handler = () => 'x'
    const result = (client as any).on('message', handler)
    expect(napcat.on).toHaveBeenCalledWith('message', handler)
    expect(official.on).toHaveBeenCalledWith('message', handler)
    expect(result).toBe(handler)
  })
})
