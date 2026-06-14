import { describe, expect, it, vi } from 'vitest'
import { CommandsFeature } from '../CommandsFeature.js'

vi.mock('@napgram/message-kit', async () => {
  const actual = await vi.importActual<any>('@napgram/message-kit')
  return {
    ...actual,
    messageConverter: {
      fromTelegram: vi.fn().mockReturnValue({ id: '1', content: [] }),
    },
  }
})

vi.mock('../../../../../shared/utils/index.js', async () => {
  const actual = await vi.importActual<any>('../../../../../shared/utils/index.js')
  return {
    ...actual,
    getLogger: vi.fn().mockReturnValue({ info: vi.fn(), warn: vi.fn(), error: console.error, debug: vi.fn() }),
  }
})

describe('commandsFeature additional coverage', () => {
  it('tests handleAddQQTargetCommand', async () => {
    const mockInstance = { id: 1, config: {} } as any
    const mockTgBot = { on: vi.fn(), addNewMessageEventHandler: vi.fn() } as any
    const mockQqClient = { on: vi.fn(), off: vi.fn() } as any
    const feature = new CommandsFeature(mockInstance, mockTgBot, mockQqClient)

    // Test not personal mode
    vi.spyOn(feature as any, 'isPersonalMode').mockReturnValue(false)
    vi.spyOn(feature as any, 'replyWorkModeMessage').mockResolvedValue(undefined)
    await (feature as any).handleAddQQTargetCommand({} as any, [], 'private')
    expect((feature as any).replyWorkModeMessage).toHaveBeenCalledWith(expect.anything(), '该命令仅在个人模式下可用')

    // Test personal mode but missing args
    vi.spyOn(feature as any, 'isPersonalMode').mockReturnValue(true)
    await (feature as any).handleAddQQTargetCommand({} as any, [], 'private')
    expect((feature as any).replyWorkModeMessage).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('用法：/addfriend <qq_user_id>'))

    // Test personal mode but invalid arg
    await (feature as any).handleAddQQTargetCommand({} as any, ['abc'], 'group')
    expect((feature as any).replyWorkModeMessage).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('用法：/addgroup <qq_group_id>'))

    // Test with provisioner error
    vi.spyOn(feature as any, 'getPersonalPairProvisioner').mockReturnValue(undefined)
    await (feature as any).handleAddQQTargetCommand({} as any, ['12345'], 'group')
    expect((feature as any).replyWorkModeMessage).toHaveBeenCalledWith(expect.anything(), '转发表尚未初始化，无法创建绑定')

    // Test success
    const mockProvisioner = { ensurePairForQQTarget: vi.fn().mockResolvedValue({ tgChatId: 999 }) }
    vi.spyOn(feature as any, 'getPersonalPairProvisioner').mockReturnValue(mockProvisioner)
    await (feature as any).handleAddQQTargetCommand({} as any, ['12345'], 'group')
    expect((feature as any).replyWorkModeMessage).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('TG: 999'))

    // Test failure
    mockProvisioner.ensurePairForQQTarget.mockResolvedValue(undefined)
    await (feature as any).handleAddQQTargetCommand({} as any, ['12345'], 'group')
    expect((feature as any).replyWorkModeMessage).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('创建 Telegram 群'))
  })

  it('tests handleQqMessage', async () => {
    const mockInstance = { id: 1, config: {} } as any
    const mockTgBot = { on: vi.fn(), addNewMessageEventHandler: vi.fn() } as any
    const mockQqClient = { on: vi.fn(), off: vi.fn(), recallMessage: vi.fn() } as any
    const feature = new CommandsFeature(mockInstance, mockTgBot, mockQqClient)

    // Register command
    const mockHandler = vi.fn().mockResolvedValue(undefined)
    feature.registerCommand({ name: 'cmd', description: 'test command', handler: mockHandler })

    // Valid msg
    let msg = {
      id: '1',
      chat: { id: 'c1' },
      sender: { id: 's1', name: 'user' },
      content: [{ type: 'text', data: { text: '/cmd arg1' } }],
    } as any

    vi.spyOn(feature as any, 'blockUntilWorkModeConfigured').mockResolvedValue(false)
    vi.spyOn(feature as any, 'checkPermission').mockResolvedValue({ allowed: true })
    vi.spyOn(feature as any, 'logAudit').mockResolvedValue(undefined)

    await (feature as any).handleQqMessage(msg)
    expect(mockHandler).toHaveBeenCalledWith(msg, ['arg1'])

    // No permission
    vi.spyOn(feature as any, 'checkPermission').mockResolvedValue({ allowed: false, reason: 'no' })
    await (feature as any).handleQqMessage(msg)

    // rm command recall
    feature.registerCommand({ name: 'rm', description: 'recall message', handler: vi.fn() })
    msg = { ...msg, content: [{ type: 'text', data: { text: '/rm' } }] }
    vi.spyOn(feature as any, 'checkPermission').mockResolvedValue({ allowed: true })
    await (feature as any).handleQqMessage(msg)
    expect(mockQqClient.recallMessage).toHaveBeenCalledWith('1')
  })

  it('tests workmode and registerDefaultCommands', async () => {
    const feature = new CommandsFeature({ id: 1, config: {} } as any, { on: vi.fn(), addNewMessageEventHandler: vi.fn() } as any, { on: vi.fn(), off: vi.fn() } as any)

    // test isWorkModeConfigured
    expect((feature as any).isWorkModeConfigured()).toBe(false)
    ;(feature as any).instance.workMode = 'group'
    expect((feature as any).isWorkModeConfigured()).toBe(true)

    // test parseWorkMode
    expect((feature as any).parseWorkMode('GROUP')).toBe('group')
    expect((feature as any).parseWorkMode('invalid')).toBeUndefined()

    // test registerDefaultCommands
    vi.spyOn(feature as any, 'loadPluginCommands').mockResolvedValue(undefined)
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
    vi.spyOn(feature as any, 'replyWorkModeMessage').mockResolvedValue(undefined)
    ;(feature as any).instance.setWorkMode = vi.fn().mockResolvedValue(undefined)

    await (feature as any).handleWorkModeCommand(msg, [])
    expect((feature as any).replyWorkModeMessage).toHaveBeenCalledWith(msg, expect.stringContaining('/start group'))

    ;(feature as any).permissionChecker = { isAdmin: vi.fn().mockReturnValue(true) }

    await (feature as any).handleWorkModeCommand(msg, ['group'])
    expect((feature as any).instance.setWorkMode).toHaveBeenCalledWith('group')
    expect((feature as any).replyWorkModeMessage).toHaveBeenCalledWith(msg, expect.stringContaining('群模式'))
  })
})
