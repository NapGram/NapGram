import { beforeEach, describe, expect, it, mock, jest, setSystemTime } from 'bun:test'
import { createInstanceAPI, InstanceAPIImpl } from '../instance.js'
import type { PluginInstancesResolver } from '../../core/interfaces.js'

const loggerMocks = (() => ({
  debug: mock(),
  error: mock(),
}))()

mock.module('@napgram/logger-kit', () => ({
  getLogger: mock(() => loggerMocks),
}))

describe('instanceAPI', () => {
  beforeEach(() => {
    mock.clearAllMocks()
  })

  it('throws when resolver is missing', async () => {
    const api = createInstanceAPI()

    await expect(api.list()).rejects.toThrow('Instances resolver not configured')
    await expect(api.get(1)).rejects.toThrow('Instances resolver not configured')
    await expect(api.getStatus(1)).rejects.toThrow('Instances resolver not configured')
  })

  it('lists instances with mapped info', async () => {
    jest.useFakeTimers()
    setSystemTime(new Date('2020-01-01T00:00:00Z'))
    const resolver: PluginInstancesResolver = () => [
      {
        id: 1,
        name: 'A',
        owner: 456,
        status: 'running',
        qqClient: {
          uin: 123,
          sendMessage: mock(),
          recallMessage: mock(),
          getMessage: mock(),
        },
        tgBot: {
          username: 'tg',
          getChat: mock(),
        },
      },
      {
        id: 2,
        name: 'B',
        status: 'stopped',
        createdAt: new Date('2020-01-02T00:00:00Z'),
      },
    ]
    const api = createInstanceAPI(resolver)

    const result = await api.list()

    expect(result).toEqual([
      {
        id: 1,
        name: 'A',
        ownerTgId: '456',
        status: 'running',
        hasQqClient: true,
        hasTgBot: true,
        hasTgUserBot: false,
        userSessionId: null,
        userBotStatus: 'disabled',
        personalMode: {
          workMode: undefined,
          userBotRequired: false,
          userSessionId: null,
          userBotStatus: 'disabled',
          hasTgUserBot: false,
          canAutoProvisionPairs: false,
          manualPairingAvailable: true,
        },
        qqAccount: '123',
        tgAccount: 'tg',
        createdAt: new Date('2020-01-01T00:00:00Z'),
      },
      {
        id: 2,
        name: 'B',
        ownerTgId: undefined,
        status: 'stopped',
        hasQqClient: false,
        hasTgBot: false,
        hasTgUserBot: false,
        userSessionId: null,
        userBotStatus: 'disabled',
        personalMode: {
          workMode: undefined,
          userBotRequired: false,
          userSessionId: null,
          userBotStatus: 'disabled',
          hasTgUserBot: false,
          canAutoProvisionPairs: false,
          manualPairingAvailable: false,
        },
        qqAccount: undefined,
        tgAccount: undefined,
        createdAt: new Date('2020-01-02T00:00:00Z'),
      },
    ])
    jest.useRealTimers()
  })

  it('gets instance or returns null', async () => {
    const api = createInstanceAPI(() => [{ id: 1, name: 'A' }])

    const found = await api.get(1)
    const missing = await api.get(2)

    expect(found?.id).toBe(1)
    expect(missing).toBeNull()
  })

  it('returns instance status', async () => {
    const resolver: PluginInstancesResolver = () => [
      {
        id: 1,
        qqClient: {
          isConnected: true,
          sendMessage: mock(),
          recallMessage: mock(),
          getMessage: mock(),
        },
        tgBot: {
          isRunning: true,
          getChat: mock(),
        },
      },
      {
        id: 2,
        stopped: true,
      },
      {
        id: 3,
      },
    ]
    const api = createInstanceAPI(resolver)

    await expect(api.getStatus(1)).resolves.toBe('running')
    await expect(api.getStatus(2)).resolves.toBe('stopped')
    await expect(api.getStatus(3)).resolves.toBe('error')
  })

  it('throws when instance not found', async () => {
    const api = createInstanceAPI(() => [])

    await expect(api.getStatus(9)).rejects.toThrow('Instance 9 not found')
  })

  it('returns InstanceAPIImpl instance', () => {
    const api = createInstanceAPI(() => [])
    expect(api).toBeInstanceOf(InstanceAPIImpl)
  })
})
