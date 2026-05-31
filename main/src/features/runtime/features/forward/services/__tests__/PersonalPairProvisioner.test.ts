import type { UnifiedMessage } from '@napgram/message-kit'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addForwardPairWithChatType, findPairByQQWithChatType } from '../../../commands/utils/ForwardPairChatType.js'
import { PersonalPairProvisioner } from '../PersonalPairProvisioner.js'

const loggerMocks = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}))

const pairHelperMocks = vi.hoisted(() => ({
  findPairByQQWithChatType: vi.fn(),
  addForwardPairWithChatType: vi.fn(),
}))

vi.mock('../../../../shared-types.js', () => ({
  getLogger: vi.fn(() => loggerMocks),
}))

vi.mock('../../../commands/utils/ForwardPairChatType.js', () => ({
  findPairByQQWithChatType: pairHelperMocks.findPairByQQWithChatType,
  addForwardPairWithChatType: pairHelperMocks.addForwardPairWithChatType,
}))

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function createQQMessage(overrides: Partial<UnifiedMessage> = {}): UnifiedMessage {
  return {
    id: 'm1',
    platform: 'qq',
    sender: { id: '10001', name: 'Alice' },
    chat: { id: '20002', type: 'group', name: 'Fallback Group' },
    content: [{ type: 'text', data: { text: 'hello' } }],
    timestamp: Date.now(),
    ...overrides,
  }
}

function createRuntime(overrides: Record<string, unknown> = {}) {
  const tgUserClient = {
    createSupergroup: vi.fn().mockResolvedValue({ id: -10020002 }),
    addChatMembers: vi.fn().mockResolvedValue([]),
    editAdminRights: vi.fn().mockResolvedValue(undefined),
    resolvePeer: vi.fn().mockResolvedValue({ _: 'inputPeerChannel', channelId: 10020002, accessHash: 0 }),
    call: vi.fn().mockResolvedValue({ filters: [] }),
  }
  const tgBot = {
    isOnline: true,
    me: { id: 90001, username: 'NapGramBot' },
    getChat: vi.fn().mockResolvedValue({ id: -10020002 }),
  }
  const instance = {
    id: 7,
    workMode: 'personal',
    userSessionId: 66,
    tgBot,
    tgUserBot: {
      isOnline: true,
      client: tgUserClient,
    },
    getPersonalModeDiagnostics: vi.fn(() => ({
      workMode: 'personal',
      userBotRequired: true,
      userSessionId: 66,
      userBotStatus: 'running',
      hasTgUserBot: true,
      canAutoProvisionPairs: true,
      manualPairingAvailable: true,
    })),
    ...overrides,
  } as any
  const forwardMap = { reload: vi.fn() } as any
  const qqClient = {
    getFriendInfo: vi.fn().mockResolvedValue({ id: '10001', name: 'Alice' }),
    getGroupInfo: vi.fn().mockResolvedValue({ id: '20002', type: 'group', name: 'Group Name' }),
  } as any

  return { instance, forwardMap, qqClient, tgBot, tgUserClient }
}

describe('personalPairProvisioner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    pairHelperMocks.findPairByQQWithChatType.mockResolvedValue(undefined)
    pairHelperMocks.addForwardPairWithChatType.mockResolvedValue({
      id: 10,
      instanceId: 7,
      qqRoomId: BigInt(20002),
      qqChatType: 'group',
      tgChatId: BigInt(-10020002),
      tgThreadId: null,
      flags: 0,
      apiKey: 'api-key',
      autoCreated: true,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does nothing when personal auto provisioning is unavailable', async () => {
    const runtime = createRuntime({
      getPersonalModeDiagnostics: vi.fn(() => ({
        workMode: 'personal',
        canAutoProvisionPairs: false,
      })),
    })
    const provisioner = new PersonalPairProvisioner(runtime.instance, runtime.forwardMap, runtime.qqClient)

    const pair = await provisioner.ensurePairForQQMessage(createQQMessage(), 'group')

    expect(pair).toBeUndefined()
    expect(findPairByQQWithChatType).not.toHaveBeenCalled()
    expect(runtime.tgUserClient.createSupergroup).not.toHaveBeenCalled()
  })

  it('creates a TG supergroup, invites the bot, and stores a typed auto-created pair', async () => {
    const runtime = createRuntime()
    const provisioner = new PersonalPairProvisioner(runtime.instance, runtime.forwardMap, runtime.qqClient)

    const pair = await provisioner.ensurePairForQQMessage(createQQMessage(), 'group')

    expect(runtime.qqClient.getGroupInfo).toHaveBeenCalledWith('20002')
    expect(runtime.tgUserClient.createSupergroup).toHaveBeenCalledWith({
      title: 'QQ 群 Group Name',
      description: 'NapGram personal mode auto-created for QQ 群 20002',
      forum: false,
    })
    expect(runtime.tgUserClient.addChatMembers).toHaveBeenCalledWith(-10020002, ['NapGramBot'], { forwardCount: 0 })
    expect(runtime.tgUserClient.editAdminRights).toHaveBeenCalledWith(expect.objectContaining({
      chatId: -10020002,
      userId: 'NapGramBot',
      rank: 'NapGram',
    }))
    expect(runtime.tgBot.getChat).toHaveBeenCalledWith(-10020002)
    expect(runtime.tgUserClient.resolvePeer).toHaveBeenCalledWith(-10020002)
    expect(runtime.tgUserClient.call).toHaveBeenCalledWith(expect.objectContaining({
      _: 'messages.hidePeerSettingsBar',
    }))
    expect(runtime.tgUserClient.call).toHaveBeenCalledWith({
      _: 'messages.getDialogFilters',
    })
    expect(runtime.tgUserClient.call).toHaveBeenCalledWith({
      _: 'messages.updateDialogFilter',
      id: 3,
      filter: {
        _: 'dialogFilter',
        id: 3,
        title: 'QQ',
        emoticon: '💬',
        includePeers: [{ _: 'inputPeerChannel', channelId: 10020002, accessHash: 0 }],
        excludePeers: [],
        pinnedPeers: [],
      },
    })
    expect(addForwardPairWithChatType).toHaveBeenCalledWith(
      runtime.forwardMap,
      7,
      '20002',
      BigInt(-10020002),
      undefined,
      'group',
      {
        qqDisplayName: 'Group Name',
        tgProvisionedByUserSessionId: 66,
        autoCreated: true,
      },
    )
    expect(pair?.autoCreated).toBe(true)
  })

  it('creates a pair from an explicit QQ target without requiring a message object', async () => {
    const runtime = createRuntime()
    const provisioner = new PersonalPairProvisioner(runtime.instance, runtime.forwardMap, runtime.qqClient)

    await provisioner.ensurePairForQQTarget('10001', 'private', 'Fallback Alice')

    expect(runtime.qqClient.getFriendInfo).toHaveBeenCalledWith('10001')
    expect(addForwardPairWithChatType).toHaveBeenCalledWith(
      runtime.forwardMap,
      7,
      '10001',
      BigInt(-10020002),
      undefined,
      'private',
      {
        qqDisplayName: 'Alice',
        tgProvisionedByUserSessionId: 66,
        autoCreated: true,
      },
    )
  })

  it('reuses one provisioning task for concurrent messages from the same QQ chat', async () => {
    const runtime = createRuntime()
    const deferred = createDeferred<{ id: number }>()
    runtime.tgUserClient.createSupergroup.mockReturnValueOnce(deferred.promise)
    const provisioner = new PersonalPairProvisioner(runtime.instance, runtime.forwardMap, runtime.qqClient)
    const msg = createQQMessage()

    const first = provisioner.ensurePairForQQMessage(msg, 'group')
    const second = provisioner.ensurePairForQQMessage(msg, 'group')
    deferred.resolve({ id: -10020002 })

    await expect(Promise.all([first, second])).resolves.toHaveLength(2)
    expect(runtime.tgUserClient.createSupergroup).toHaveBeenCalledTimes(1)
    expect(addForwardPairWithChatType).toHaveBeenCalledTimes(1)
  })

  it('returns an existing pair without creating a Telegram group', async () => {
    const existingPair = {
      id: 22,
      instanceId: 7,
      qqRoomId: BigInt(20002),
      qqChatType: 'group',
      tgChatId: BigInt(-10030003),
      tgThreadId: null,
      flags: 0,
      apiKey: 'existing',
    }
    pairHelperMocks.findPairByQQWithChatType.mockResolvedValueOnce(existingPair)
    const runtime = createRuntime()
    const provisioner = new PersonalPairProvisioner(runtime.instance, runtime.forwardMap, runtime.qqClient)

    const pair = await provisioner.ensurePairForQQTarget('20002', 'group', 'Fallback Group')

    expect(pair).toBe(existingPair)
    expect(runtime.tgUserClient.createSupergroup).not.toHaveBeenCalled()
    expect(addForwardPairWithChatType).not.toHaveBeenCalled()
  })

  it('falls back to clean display names when QQ lookups fail', async () => {
    const runtime = createRuntime()
    runtime.qqClient.getFriendInfo.mockRejectedValueOnce(new Error('friend lookup failed'))
    const provisioner = new PersonalPairProvisioner(runtime.instance, runtime.forwardMap, runtime.qqClient)

    await provisioner.ensurePairForQQTarget('10001', 'private', '  Fallback   Alice  ')

    expect(runtime.tgUserClient.createSupergroup).toHaveBeenCalledWith({
      title: 'QQ 好友 Fallback Alice',
      description: 'NapGram personal mode auto-created for QQ 好友 10001',
      forum: false,
    })
    expect(loggerMocks.debug).toHaveBeenCalledWith(
      expect.objectContaining({ userId: '10001' }),
      'Failed to resolve QQ friend name',
    )
  })

  it('uses raw id when QQ name lookup and fallback name are unavailable', async () => {
    const runtime = createRuntime()
    runtime.qqClient.getGroupInfo.mockResolvedValueOnce({ id: '20002', name: '   ' })
    const provisioner = new PersonalPairProvisioner(runtime.instance, runtime.forwardMap, runtime.qqClient)

    await provisioner.ensurePairForQQTarget('20002', 'group')

    expect(runtime.tgUserClient.createSupergroup).toHaveBeenCalledWith({
      title: 'QQ 群 20002',
      description: 'NapGram personal mode auto-created for QQ 群 20002',
      forum: false,
    })
  })

  it('adds auto-created chats to an existing QQ folder only when absent', async () => {
    const runtime = createRuntime()
    const inputPeer = { _: 'inputPeerChannel', channelId: 10020002, accessHash: 0 }
    runtime.tgUserClient.resolvePeer.mockResolvedValueOnce(inputPeer)
    runtime.tgUserClient.call.mockImplementation(async (request: any) => {
      if (request._ === 'messages.getDialogFilters') {
        return {
          filters: [{
            _: 'dialogFilter',
            id: 5,
            title: 'QQ',
            includePeers: [{ userId: 123 }],
            excludePeers: [],
            pinnedPeers: [],
          }],
        }
      }
      return {}
    })
    const provisioner = new PersonalPairProvisioner(runtime.instance, runtime.forwardMap, runtime.qqClient)

    await provisioner.ensurePairForQQTarget('20002', 'group')

    expect(runtime.tgUserClient.call).toHaveBeenCalledWith({
      _: 'messages.updateDialogFilter',
      id: 5,
      filter: expect.objectContaining({
        includePeers: [{ userId: 123 }, inputPeer],
      }),
    })
  })

  it('does not duplicate existing folder peers', async () => {
    const runtime = createRuntime()
    const inputPeer = { _: 'inputPeerUser', userId: 90001, accessHash: 0 }
    runtime.tgUserClient.resolvePeer.mockResolvedValueOnce(inputPeer)
    runtime.tgUserClient.call.mockImplementation(async (request: any) => {
      if (request._ === 'messages.getDialogFilters') {
        return {
          filters: [{
            _: 'dialogFilter',
            id: 5,
            title: 'QQ',
            includePeers: [{ userId: 90001 }],
            excludePeers: [],
            pinnedPeers: [],
          }],
        }
      }
      return {}
    })
    const provisioner = new PersonalPairProvisioner(runtime.instance, runtime.forwardMap, runtime.qqClient)

    await provisioner.ensurePairForQQTarget('20002', 'group')

    expect(runtime.tgUserClient.call).not.toHaveBeenCalledWith(expect.objectContaining({
      _: 'messages.updateDialogFilter',
      id: 5,
    }))
  })

  it('continues when hiding settings bar or folder update fails', async () => {
    const runtime = createRuntime()
    runtime.tgUserClient.call.mockImplementation(async (request: any) => {
      if (request._ === 'messages.hidePeerSettingsBar')
        throw new Error('hide failed')
      if (request._ === 'messages.getDialogFilters')
        throw new Error('folder failed')
      return {}
    })
    const provisioner = new PersonalPairProvisioner(runtime.instance, runtime.forwardMap, runtime.qqClient)

    const pair = await provisioner.ensurePairForQQTarget('20002', 'group')

    expect(pair?.autoCreated).toBe(true)
    expect(loggerMocks.warn).toHaveBeenCalledWith(
      expect.objectContaining({ chatId: -10020002 }),
      'Failed to hide peer settings bar',
    )
    expect(loggerMocks.warn).toHaveBeenCalledWith(
      expect.objectContaining({ chatId: -10020002 }),
      'Failed to update QQ folder',
    )
  })

  it('skips settings and folder RPCs when UserBot client lacks RPC methods', async () => {
    const runtime = createRuntime()
    runtime.instance.tgUserBot.client.resolvePeer = undefined
    const provisioner = new PersonalPairProvisioner(runtime.instance, runtime.forwardMap, runtime.qqClient)

    await provisioner.ensurePairForQQTarget('20002', 'group')

    expect(runtime.tgUserClient.call).not.toHaveBeenCalled()
  })

  it('swallows already-participant invite errors and continues without promotion support', async () => {
    const runtime = createRuntime()
    runtime.tgUserClient.addChatMembers.mockRejectedValueOnce(new Error('USER_ALREADY_PARTICIPANT'))
    runtime.tgUserClient.editAdminRights = undefined
    const provisioner = new PersonalPairProvisioner(runtime.instance, runtime.forwardMap, runtime.qqClient)

    const pair = await provisioner.ensurePairForQQTarget('20002', 'group')

    expect(pair?.autoCreated).toBe(true)
    expect(addForwardPairWithChatType).toHaveBeenCalled()
  })

  it('logs and returns undefined when provisioning cannot create a group', async () => {
    const runtime = createRuntime()
    runtime.instance.tgUserBot.client.createSupergroup = undefined
    const provisioner = new PersonalPairProvisioner(runtime.instance, runtime.forwardMap, runtime.qqClient)

    const pair = await provisioner.ensurePairForQQTarget('20002', 'group')

    expect(pair).toBeUndefined()
    expect(loggerMocks.warn).toHaveBeenCalledWith(
      expect.objectContaining({ instanceId: 7, qqChatType: 'group', qqRoomId: '20002' }),
      'Personal pair auto provisioning failed',
    )
  })

  it('logs and returns undefined when bot identity is unavailable', async () => {
    const runtime = createRuntime()
    runtime.instance.tgBot.me = {}
    const provisioner = new PersonalPairProvisioner(runtime.instance, runtime.forwardMap, runtime.qqClient)

    const pair = await provisioner.ensurePairForQQTarget('20002', 'group')

    expect(pair).toBeUndefined()
    expect(loggerMocks.warn).toHaveBeenCalledWith(
      expect.objectContaining({ instanceId: 7, qqChatType: 'group', qqRoomId: '20002' }),
      'Personal pair auto provisioning failed',
    )
  })

  it('logs and returns undefined when the bot cannot observe the auto-created chat', async () => {
    const runtime = createRuntime()
    runtime.tgBot.getChat.mockRejectedValueOnce(new Error('not visible'))
    const provisioner = new PersonalPairProvisioner(runtime.instance, runtime.forwardMap, runtime.qqClient)

    const pair = await provisioner.ensurePairForQQTarget('20002', 'group')

    expect(pair).toBeUndefined()
    expect(addForwardPairWithChatType).not.toHaveBeenCalled()
    expect(loggerMocks.warn).toHaveBeenCalledWith(
      expect.objectContaining({ instanceId: 7, qqChatType: 'group', qqRoomId: '20002' }),
      'Personal pair auto provisioning failed',
    )
  })

  it('logs and returns undefined when addForwardPairWithChatType returns no pair', async () => {
    pairHelperMocks.addForwardPairWithChatType.mockResolvedValueOnce(undefined)
    const runtime = createRuntime()
    const provisioner = new PersonalPairProvisioner(runtime.instance, runtime.forwardMap, runtime.qqClient)

    const pair = await provisioner.ensurePairForQQTarget('20002', 'group')

    expect(pair).toBeUndefined()
    expect(loggerMocks.warn).toHaveBeenCalledWith(
      expect.objectContaining({ instanceId: 7, qqChatType: 'group', qqRoomId: '20002' }),
      'Personal pair auto provisioning failed',
    )
  })
})
