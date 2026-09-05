import * as actualMessageKit from '@napgram/message-kit'
import { describe, expect, it, mock, spyOn } from 'bun:test'
import * as actualSharedUtils from '../../../../../shared/utils/index.js'
import { CommandsFeature } from '../CommandsFeature.js'

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

describe('commandsFeature additional coverage', () => {
  it('tests handleAddQQTargetCommand', async () => {
    const mockInstance = { id: 1, config: {} } as any
    const mockTgBot = { on: mock(), addNewMessageEventHandler: mock() } as any
    const mockQqClient = { on: mock(), off: mock() } as any
    const feature = new CommandsFeature(mockInstance, mockTgBot, mockQqClient)

    // Test not personal mode
    spyOn(feature as any, 'isPersonalMode').mockReturnValue(false)
    spyOn(feature as any, 'replyWorkModeMessage').mockResolvedValue(undefined)
    await (feature as any).handleAddQQTargetCommand({} as any, [], 'private')
    expect((feature as any).replyWorkModeMessage).toHaveBeenCalledWith(expect.anything(), '该命令仅在个人模式下可用')

    // Test personal mode but missing args
    spyOn(feature as any, 'isPersonalMode').mockReturnValue(true)
    await (feature as any).handleAddQQTargetCommand({} as any, [], 'private')
    expect((feature as any).replyWorkModeMessage).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('用法：/addfriend <qq_user_id>'))

    // Test personal mode but invalid arg
    await (feature as any).handleAddQQTargetCommand({} as any, ['abc'], 'group')
    expect((feature as any).replyWorkModeMessage).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('用法：/addgroup <qq_group_id>'))

    // Test with provisioner error
    spyOn(feature as any, 'getPersonalPairProvisioner').mockReturnValue(undefined)
    await (feature as any).handleAddQQTargetCommand({} as any, ['12345'], 'group')
    expect((feature as any).replyWorkModeMessage).toHaveBeenCalledWith(expect.anything(), '转发表尚未初始化，无法创建绑定')

    // Test success
    const mockProvisioner = { ensurePairForQQTarget: mock().mockResolvedValue({ tgChatId: 999 }) }
    spyOn(feature as any, 'getPersonalPairProvisioner').mockReturnValue(mockProvisioner)
    await (feature as any).handleAddQQTargetCommand({} as any, ['12345'], 'group')
    expect((feature as any).replyWorkModeMessage).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('TG: 999'))

    // Test failure
    mockProvisioner.ensurePairForQQTarget.mockResolvedValue(undefined)
    await (feature as any).handleAddQQTargetCommand({} as any, ['12345'], 'group')
    expect((feature as any).replyWorkModeMessage).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('创建 Telegram 群'))
  })

  it('tests handleQqMessage', async () => {
    const mockInstance = { id: 1, config: {} } as any
    const mockTgBot = { on: mock(), addNewMessageEventHandler: mock() } as any
    const mockQqClient = { on: mock(), off: mock(), recallMessage: mock() } as any
    const feature = new CommandsFeature(mockInstance, mockTgBot, mockQqClient)

    // Register command
    const mockHandler = mock().mockResolvedValue(undefined)
    feature.registerCommand({ name: 'cmd', description: 'test command', handler: mockHandler })

    // Valid msg
    let msg = {
      id: '1',
      chat: { id: 'c1' },
      sender: { id: 's1', name: 'user' },
      content: [{ type: 'text', data: { text: '/cmd arg1' } }],
    } as any

    spyOn(feature as any, 'blockUntilWorkModeConfigured').mockResolvedValue(false)
    spyOn(feature as any, 'checkPermission').mockResolvedValue({ allowed: true })
    spyOn(feature as any, 'logAudit').mockResolvedValue(undefined)

    await (feature as any).handleQqMessage(msg)
    expect(mockHandler).toHaveBeenCalledWith(msg, ['arg1'])

    // No permission
    spyOn(feature as any, 'checkPermission').mockResolvedValue({ allowed: false, reason: 'no' })
    await (feature as any).handleQqMessage(msg)

    // rm command recall
    feature.registerCommand({ name: 'rm', description: 'recall message', handler: mock() })
    msg = { ...msg, content: [{ type: 'text', data: { text: '/rm' } }] }
    spyOn(feature as any, 'checkPermission').mockResolvedValue({ allowed: true })
    await (feature as any).handleQqMessage(msg)
    expect(mockQqClient.recallMessage).toHaveBeenCalledWith('1')
  })

  it('tests workmode and registerDefaultCommands', async () => {
    const feature = new CommandsFeature({ id: 1, config: {} } as any, { on: mock(), addNewMessageEventHandler: mock() } as any, { on: mock(), off: mock() } as any)

    // test isWorkModeConfigured
    expect((feature as any).isWorkModeConfigured()).toBe(false)
    ;(feature as any).instance.workMode = 'group'
    expect((feature as any).isWorkModeConfigured()).toBe(true)

    // test parseWorkMode
    expect((feature as any).parseWorkMode('GROUP')).toBe('group')
    expect((feature as any).parseWorkMode('invalid')).toBeUndefined()

    // test registerDefaultCommands
    spyOn(feature as any, 'loadPluginCommands').mockResolvedValue(undefined)
    await (feature as any).registerDefaultCommands()
    expect((feature as any).registry.get('help')).toBeDefined()
    expect((feature as any).registry.get('start')).toBeDefined()
    expect((feature as any).registry.get('bind')).toBeDefined()
    expect((feature as any).registry.get('unbind')).toBeDefined()
    expect((feature as any).registry.get('rm')).toBeDefined()
    expect((feature as any).registry.get('forwardoff')).toBeDefined()
    expect((feature as any).registry.get('info')).toBeDefined()

    // test handleWorkModeCommand
    const msg = { chat: { id: 1 }, sender: { id: 1 }, platform: 'telegram' } as any
    spyOn(feature as any, 'replyWorkModeMessage').mockResolvedValue(undefined)
    ;(feature as any).instance.setWorkMode = mock().mockResolvedValue(undefined)

    await (feature as any).handleWorkModeCommand(msg, [])
    expect((feature as any).replyWorkModeMessage).toHaveBeenCalledWith(msg, expect.stringContaining('/start group'))

    ;(feature as any).permissionChecker = { isAdmin: mock().mockReturnValue(true) }

    await (feature as any).handleWorkModeCommand(msg, ['group'])
    expect((feature as any).instance.setWorkMode).toHaveBeenCalledWith('group')
    expect((feature as any).replyWorkModeMessage).toHaveBeenCalledWith(msg, expect.stringContaining('群模式'))
  })
})
