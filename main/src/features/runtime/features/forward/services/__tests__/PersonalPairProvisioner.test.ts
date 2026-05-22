import type { UnifiedMessage } from '@napgram/message-kit'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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

describe('PersonalPairProvisioner', () => {
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
})

