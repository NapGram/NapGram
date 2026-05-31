import { describe, it, expect, vi } from 'vitest'
import { CommandsFeature } from '../CommandsFeature.js'

vi.mock('@napgram/message-kit', async () => {
  const actual = await vi.importActual<any>('@napgram/message-kit')
  return {
    ...actual,
    messageConverter: {
      fromTelegram: vi.fn().mockReturnValue({ id: '1', content: [] }),
    }
  }
})

vi.mock('../../../../../shared/utils/index.js', async () => {
  const actual = await vi.importActual<any>('../../../../../shared/utils/index.js')
  return {
    ...actual,
    getLogger: vi.fn().mockReturnValue({ info: vi.fn(), warn: vi.fn(), error: console.error, debug: vi.fn() })
  }
})

describe('CommandsFeature handleTgMessage parsing', () => {
  it('handles bot suffix mention', async () => {
    const mockInstance = { id: 1, config: {} } as any
    const mockTgBot = { on: vi.fn(), addNewMessageEventHandler: vi.fn(), botInfo: { username: 'mybot' } } as any
    const mockQqClient = { on: vi.fn(), off: vi.fn() } as any
    const feature = new CommandsFeature(mockInstance, mockTgBot, mockQqClient)
    
    // other bot
    let msg = { text: '/cmd@otherbot', chat: { id: 1 }, sender: { id: 2 } } as any
    let res = await (feature as any).handleTgMessage(msg)
    expect(res).toBe(false)
    
    // my bot
    msg = { text: '/cmd@mybot', chat: { id: 1 }, sender: { id: 2 } } as any
    feature.registerCommand({ name: 'cmd', description: 'test', permission: { level: 1 }, handler: vi.fn() })
    vi.spyOn(feature as any, 'extractMentionedBotUsernames').mockReturnValue(new Set())
    vi.spyOn(feature as any, 'checkPermission').mockResolvedValue({ allowed: true })
    vi.spyOn(feature as any, 'logAudit').mockResolvedValue(undefined)
    vi.spyOn(feature as any, 'blockUntilWorkModeConfigured').mockResolvedValue(false)
    
    res = await (feature as any).handleTgMessage(msg)
    console.log('Test 1 res:', res)
    expect(res).toBe(true)
  })

  it('handles inline mention', async () => {
    const mockInstance = { id: 1, config: {} } as any
    const mockTgBot = { on: vi.fn(), addNewMessageEventHandler: vi.fn(), botInfo: { username: 'mybot' } } as any
    const mockQqClient = { on: vi.fn(), off: vi.fn() } as any
    const feature = new CommandsFeature(mockInstance, mockTgBot, mockQqClient)
    
    // other bot
    let msg = { text: '/cmd some args @otherbot', chat: { id: 1 }, sender: { id: 2 } } as any
    let res = await (feature as any).handleTgMessage(msg)
    expect(res).toBe(false)
    
    // my bot
    msg = { text: '/cmd args @mybot', chat: { id: 1 }, sender: { id: 2 } } as any
    feature.registerCommand({ name: 'cmd', description: 'test', permission: { level: 1 }, handler: vi.fn() })
    vi.spyOn(feature as any, 'extractMentionedBotUsernames').mockReturnValue(new Set())
    vi.spyOn(feature as any, 'checkPermission').mockResolvedValue({ allowed: true })
    vi.spyOn(feature as any, 'logAudit').mockResolvedValue(undefined)
    vi.spyOn(feature as any, 'blockUntilWorkModeConfigured').mockResolvedValue(false)
    
    res = await (feature as any).handleTgMessage(msg)
    console.log('Test 2 res:', res)
    expect(res).toBe(true)
  })

  it('handles unknown command', async () => {
    const mockInstance = { id: 1, config: {} } as any
    const mockTgBot = { on: vi.fn(), addNewMessageEventHandler: vi.fn(), botInfo: { username: 'mybot' } } as any
    const mockQqClient = { on: vi.fn(), off: vi.fn() } as any
    const feature = new CommandsFeature(mockInstance, mockTgBot, mockQqClient)
    
    let msg = { text: '/unknown', chat: { id: 1 }, sender: { id: 2 } } as any
    ;(feature as any).registry.get = vi.fn().mockReturnValue(undefined)
    
    let res = await (feature as any).handleTgMessage(msg)
    expect(res).toBe(false)
  })

  it('handles blockUntilWorkModeConfigured', async () => {
    const mockInstance = { id: 1, config: {} } as any
    const mockTgBot = { on: vi.fn(), addNewMessageEventHandler: vi.fn(), botInfo: { username: 'mybot' } } as any
    const mockQqClient = { on: vi.fn(), off: vi.fn() } as any
    const feature = new CommandsFeature(mockInstance, mockTgBot, mockQqClient)
    
    let msg = { text: '/cmd', chat: { id: 1 }, sender: { id: 2 } } as any
    feature.registerCommand({ name: 'cmd', description: 'test', permission: { level: 1 }, handler: vi.fn() })
    vi.spyOn(feature as any, 'blockUntilWorkModeConfigured').mockResolvedValue(true)
    
    let res = await (feature as any).handleTgMessage(msg)
    expect(res).toBe(true)
  })
})

describe('CommandsFeature private methods', () => {
  it('checkPermission with permissionPlugin', async () => {
    const mockInstance = { id: 1, config: {} } as any
    const mockTgBot = { on: vi.fn(), addNewMessageEventHandler: vi.fn(), botInfo: { username: 'mybot' } } as any
    const mockQqClient = { on: vi.fn(), off: vi.fn() } as any
    const feature = new CommandsFeature(mockInstance, mockTgBot, mockQqClient)
    
    ;(feature as any).permissionPlugin = {
      permissionService: {
        checkCommandPermission: vi.fn().mockResolvedValue({ allowed: false, reason: 'no' })
      }
    }
    
    let res = await (feature as any).checkPermission('user1', { name: 'cmd', permission: { level: 2 } })
    expect(res).toEqual({ allowed: false, reason: 'no' })
    
    // test fallback when plugin throws
    ;(feature as any).permissionPlugin.permissionService.checkCommandPermission.mockRejectedValue(new Error('fail'))
    ;(feature as any).permissionChecker = { isAdmin: vi.fn().mockReturnValue(true) }
    
    res = await (feature as any).checkPermission('user1', { name: 'cmd', adminOnly: true })
    expect(res).toEqual({ allowed: true, reason: undefined })
    
    // test normal fallback without plugin
    ;(feature as any).permissionPlugin = undefined
    ;(feature as any).permissionChecker = { isAdmin: vi.fn().mockReturnValue(false) }
    res = await (feature as any).checkPermission('user1', { name: 'cmd', adminOnly: true })
    expect(res).toEqual({ allowed: false, reason: '此命令仅限管理员使用' })
    
    // test default allow
    res = await (feature as any).checkPermission('user1', { name: 'cmd' })
    expect(res).toEqual({ allowed: true })
  })

  it('logAudit', async () => {
    const mockTgBot = { on: vi.fn(), addNewMessageEventHandler: vi.fn(), botInfo: { username: 'mybot' } } as any
    const mockQqClient = { on: vi.fn(), off: vi.fn() } as any
    const feature = new CommandsFeature({ id: 1, config: {} } as any, mockTgBot, mockQqClient)
    const logAuditMock = vi.fn().mockResolvedValue(undefined)
    ;(feature as any).permissionPlugin = {
      permissionService: { logAudit: logAuditMock }
    }
    await (feature as any).logAudit({ eventType: 'test', userId: 'u1', commandName: 'cmd', reason: 'r' })
    expect(logAuditMock).toHaveBeenCalled()
    
    // handles error gracefully
    logAuditMock.mockRejectedValue(new Error('fail'))
    await expect((feature as any).logAudit({ eventType: 'test', userId: 'u1', commandName: 'cmd' })).resolves.not.toThrow()
  })
})
