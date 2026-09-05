/* eslint-disable eslint-comments/no-unlimited-disable */
/* eslint-disable */
import { describe, expect, it, mock, spyOn } from 'bun:test'
import { CommandsFeature } from '../CommandsFeature.js'
import * as actualMessageKit from '@napgram/message-kit'
import * as actualSharedUtils from '../../../../../shared/utils/index.js'

mock.module('@napgram/message-kit', async () => {
  return {
    ...actualMessageKit,
    messageConverter: {
      fromTelegram: mock().mockReturnValue({ id: '1', content: [] }),
    },
  }
})

mock.module('../../../../../shared/utils/index.js', async () => {
  return {
    ...actualSharedUtils,
    getLogger: mock().mockReturnValue({ info: mock(), warn: mock(), error: console.error, debug: mock() }),
  }
})

describe('commandsFeature handleTgMessage parsing', () => {
  it('handles bot suffix mention', async () => {
    const mockInstance = { id: 1, config: {} } as any
    const mockTgBot = { on: mock(), addNewMessageEventHandler: mock(), botInfo: { username: 'mybot' } } as any
    const mockQqClient = { on: mock(), off: mock() } as any
    const feature = new CommandsFeature(mockInstance, mockTgBot, mockQqClient)

    // other bot
    let msg = { text: '/cmd@otherbot', chat: { id: 1 }, sender: { id: 2 } } as any
    let res = await (feature as any).handleTgMessage(msg)
    expect(res).toBe(false)

    // my bot
    msg = { text: '/cmd@mybot', chat: { id: 1 }, sender: { id: 2 } } as any
    feature.registerCommand({ name: 'cmd', description: 'test', permission: { level: 1 }, handler: mock() })
    spyOn(feature as any, 'extractMentionedBotUsernames').mockReturnValue(new Set())
    spyOn(feature as any, 'checkPermission').mockResolvedValue({ allowed: true })
    spyOn(feature as any, 'logAudit').mockResolvedValue(undefined)
    spyOn(feature as any, 'blockUntilWorkModeConfigured').mockResolvedValue(false)

    res = await (feature as any).handleTgMessage(msg)
    console.log('Test 1 res:', res)
    expect(res).toBe(true)
  })

  it('handles inline mention', async () => {
    const mockInstance = { id: 1, config: {} } as any
    const mockTgBot = { on: mock(), addNewMessageEventHandler: mock(), botInfo: { username: 'mybot' } } as any
    const mockQqClient = { on: mock(), off: mock() } as any
    const feature = new CommandsFeature(mockInstance, mockTgBot, mockQqClient)

    // other bot
    let msg = { text: '/cmd some args @otherbot', chat: { id: 1 }, sender: { id: 2 } } as any
    let res = await (feature as any).handleTgMessage(msg)
    expect(res).toBe(false)

    // my bot
    msg = { text: '/cmd args @mybot', chat: { id: 1 }, sender: { id: 2 } } as any
    feature.registerCommand({ name: 'cmd', description: 'test', permission: { level: 1 }, handler: mock() })
    spyOn(feature as any, 'extractMentionedBotUsernames').mockReturnValue(new Set())
    spyOn(feature as any, 'checkPermission').mockResolvedValue({ allowed: true })
    spyOn(feature as any, 'logAudit').mockResolvedValue(undefined)
    spyOn(feature as any, 'blockUntilWorkModeConfigured').mockResolvedValue(false)

    res = await (feature as any).handleTgMessage(msg)
    console.log('Test 2 res:', res)
    expect(res).toBe(true)
  })

  it('handles unknown command', async () => {
    const mockInstance = { id: 1, config: {} } as any
    const mockTgBot = { on: mock(), addNewMessageEventHandler: mock(), botInfo: { username: 'mybot' } } as any
    const mockQqClient = { on: mock(), off: mock() } as any
    const feature = new CommandsFeature(mockInstance, mockTgBot, mockQqClient)

    let msg = { text: '/unknown', chat: { id: 1 }, sender: { id: 2 } } as any
    ;(feature as any).registry.get = mock().mockReturnValue(undefined)

    let res = await (feature as any).handleTgMessage(msg)
    expect(res).toBe(false)
  })

  it('handles blockUntilWorkModeConfigured', async () => {
    const mockInstance = { id: 1, config: {} } as any
    const mockTgBot = { on: mock(), addNewMessageEventHandler: mock(), botInfo: { username: 'mybot' } } as any
    const mockQqClient = { on: mock(), off: mock() } as any
    const feature = new CommandsFeature(mockInstance, mockTgBot, mockQqClient)

    let msg = { text: '/cmd', chat: { id: 1 }, sender: { id: 2 } } as any
    feature.registerCommand({ name: 'cmd', description: 'test', permission: { level: 1 }, handler: mock() })
    spyOn(feature as any, 'blockUntilWorkModeConfigured').mockResolvedValue(true)

    let res = await (feature as any).handleTgMessage(msg)
    expect(res).toBe(true)
  })
})

describe('commandsFeature private methods', () => {
  it('checkPermission with permissionPlugin', async () => {
    const mockInstance = { id: 1, config: {} } as any
    const mockTgBot = { on: mock(), addNewMessageEventHandler: mock(), botInfo: { username: 'mybot' } } as any
    const mockQqClient = { on: mock(), off: mock() } as any
    const feature = new CommandsFeature(mockInstance, mockTgBot, mockQqClient)

    ;(feature as any).permissionPlugin = {
      permissionService: {
        checkCommandPermission: mock().mockResolvedValue({ allowed: false, reason: 'no' }),
      },
    }

    let res = await (feature as any).checkPermission('user1', { name: 'cmd', permission: { level: 2 } })
    expect(res).toEqual({ allowed: false, reason: 'no' })

    // test fallback when plugin throws
    ;(feature as any).permissionPlugin.permissionService.checkCommandPermission.mockRejectedValue(new Error('fail'))
    ;(feature as any).permissionChecker = { isAdmin: mock().mockReturnValue(true) }

    res = await (feature as any).checkPermission('user1', { name: 'cmd', adminOnly: true })
    expect(res).toEqual({ allowed: true, reason: undefined })

    // test normal fallback without plugin
    ;(feature as any).permissionPlugin = undefined
    ;(feature as any).permissionChecker = { isAdmin: mock().mockReturnValue(false) }
    res = await (feature as any).checkPermission('user1', { name: 'cmd', adminOnly: true })
    expect(res).toEqual({ allowed: false, reason: '此命令仅限管理员使用' })

    // test default allow
    res = await (feature as any).checkPermission('user1', { name: 'cmd' })
    expect(res).toEqual({ allowed: true })
  })

  it('logAudit', async () => {
    const mockTgBot = { on: mock(), addNewMessageEventHandler: mock(), botInfo: { username: 'mybot' } } as any
    const mockQqClient = { on: mock(), off: mock() } as any
    const feature = new CommandsFeature({ id: 1, config: {} } as any, mockTgBot, mockQqClient)
    const logAuditMock = mock().mockResolvedValue(undefined)
    ;(feature as any).permissionPlugin = {
      permissionService: { logAudit: logAuditMock },
    }
    await (feature as any).logAudit({ eventType: 'test', userId: 'u1', commandName: 'cmd', reason: 'r' })
    expect(logAuditMock).toHaveBeenCalled()

    // handles error gracefully
    logAuditMock.mockRejectedValue(new Error('fail'))
    await expect((feature as any).logAudit({ eventType: 'test', userId: 'u1', commandName: 'cmd' })).resolves.toBeUndefined()
  })
})
