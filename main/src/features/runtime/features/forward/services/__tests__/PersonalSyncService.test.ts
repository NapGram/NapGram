import { beforeEach, describe, expect, it, jest, mock } from 'bun:test'
import { PersonalSyncService } from '../PersonalSyncService.js'

const loggerMocks = (() => ({
  debug: mock(),
  info: mock(),
  warn: mock(),
  error: mock(),
}))()

mock.module('@napgram/logger-kit', async () => ({
  getLogger: mock(() => loggerMocks),
}))

const fetchMock = mock().mockImplementation(() => {
  return Promise.resolve({
    ok: true,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)),
  })
})
globalThis.fetch = fetchMock as any

describe('personalSyncService', () => {
  beforeEach(() => {
    mock.clearAllMocks()
    fetchMock.mockClear()
  })

  it('skips sync if workMode is not personal', async () => {
    const instance = {
      id: 7,
      workMode: 'normal',
    } as any
    const forwardMap = {
      getAll: mock().mockReturnValue([]),
    } as any
    const qqClient = {} as any

    const service = new PersonalSyncService(instance, forwardMap, qqClient)
    await service.syncAll()

    expect(forwardMap.getAll).not.toHaveBeenCalled()
  })

  it('skips sync if userBot is offline', async () => {
    const instance = {
      id: 7,
      workMode: 'personal',
      tgUserBot: {
        isOnline: false,
      },
    } as any
    const forwardMap = {
      getAll: mock().mockReturnValue([]),
    } as any
    const qqClient = {} as any

    const service = new PersonalSyncService(instance, forwardMap, qqClient)
    await service.syncAll()

    expect(forwardMap.getAll).not.toHaveBeenCalled()
  })

  it('runs sync for private and autoCreated pairs, updating title and avatar', async () => {
    const editTitleMock = mock()
    const setProfilePhotoMock = mock()
    const tgChat = {
      chat: {
        title: 'QQ 好友 OldName',
      },
      editTitle: editTitleMock,
      setProfilePhoto: setProfilePhotoMock,
    }

    const tgBot = {
      getChat: mock().mockResolvedValue(tgChat),
    }

    const instance = {
      id: 7,
      workMode: 'personal',
      tgUserBot: {
        isOnline: true,
      },
      tgBot,
    } as any

    const forwardMap = {
      getAll: mock().mockReturnValue([
        {
          id: 101,
          instanceId: 7,
          qqChatType: 'private',
          qqRoomId: BigInt(22222),
          tgChatId: BigInt(-10020002),
          qqDisplayName: 'NewName',
          autoCreated: true,
        },
      ]),
    } as any

    const qqClient = {
      getFriendInfo: mock().mockResolvedValue({ name: 'NewName' }),
    } as any

    const service = new PersonalSyncService(instance, forwardMap, qqClient)
    await service.syncAll()

    expect(qqClient.getFriendInfo).toHaveBeenCalledWith('22222')
    expect(tgBot.getChat).toHaveBeenCalledWith(-10020002)
    expect(editTitleMock).toHaveBeenCalledWith('QQ 好友 NewName')
    expect(fetchMock).toHaveBeenCalled()
    expect(setProfilePhotoMock).toHaveBeenCalled()
  })

  it('runs sync for group pairs, updating title and avatar', async () => {
    const editTitleMock = mock()
    const setProfilePhotoMock = mock()
    const tgChat = {
      chat: { title: 'old' },
      editTitle: editTitleMock,
      setProfilePhoto: setProfilePhotoMock,
    }
    const tgBot = { getChat: mock().mockResolvedValue(tgChat) }
    const instance = {
      id: 7,
      workMode: 'personal',
      tgUserBot: { isOnline: true },
      tgBot,
    } as any

    const forwardMap = {
      getAll: mock().mockReturnValue([
        {
          id: 102,
          instanceId: 7,
          qqChatType: 'group',
          qqRoomId: BigInt(33333),
          tgChatId: BigInt(-10030003),
          qqDisplayName: '',
          autoCreated: true,
        },
      ]),
    } as any

    const qqClient = {
      getGroupInfo: mock().mockResolvedValue({ name: ' GroupName ' }),
    } as any

    const service = new PersonalSyncService(instance, forwardMap, qqClient)
    await service.syncAll()

    expect(qqClient.getGroupInfo).toHaveBeenCalledWith('33333')
    expect(editTitleMock).toHaveBeenCalledWith('QQ 群 GroupName')
    expect(fetchMock).toHaveBeenCalled()
    expect(setProfilePhotoMock).toHaveBeenCalled()
  })

  it('handles fetch error and does not update photo', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404, statusText: 'Not Found' })
    const tgChat = {
      chat: { title: 'QQ 好友 Name' }, // title matches, so editTitle not called
      editTitle: mock(),
      setProfilePhoto: mock(),
    }
    const tgBot = { getChat: mock().mockResolvedValue(tgChat) }
    const instance = { id: 7, workMode: 'personal', tgUserBot: { isOnline: true }, tgBot } as any
    const forwardMap = {
      getAll: mock().mockReturnValue([
        { id: 103, instanceId: 7, qqChatType: 'private', qqRoomId: BigInt(444), tgChatId: BigInt(555), autoCreated: true },
      ]),
    } as any
    const qqClient = { getFriendInfo: mock().mockResolvedValue({ name: 'Name' }) } as any

    const service = new PersonalSyncService(instance, forwardMap, qqClient)
    await service.syncAll()

    expect(tgChat.setProfilePhoto).not.toHaveBeenCalled()
  })

  it('uses cache to skip photo update if hash is same', async () => {
    const tgChat = { chat: { title: 'QQ 好友 Name' }, editTitle: mock(), setProfilePhoto: mock() }
    const tgBot = { getChat: mock().mockResolvedValue(tgChat) }
    const instance = { id: 7, workMode: 'personal', tgUserBot: { isOnline: true }, tgBot } as any
    const forwardMap = {
      getAll: mock().mockReturnValue([
        { id: 104, instanceId: 7, qqChatType: 'private', qqRoomId: BigInt(444), tgChatId: BigInt(555), autoCreated: true },
      ]),
    } as any
    const qqClient = { getFriendInfo: mock().mockResolvedValue({ name: 'Name' }) } as any

    const service = new PersonalSyncService(instance, forwardMap, qqClient)
    await service.syncAll()
    expect(tgChat.setProfilePhoto).toHaveBeenCalledTimes(1)

    // Second sync should use cache
    tgChat.setProfilePhoto.mockClear()
    await service.syncAll()
    expect(tgChat.setProfilePhoto).not.toHaveBeenCalled()
  })

  it('can start and stop timer', () => {
    jest.useFakeTimers()
    const service = new PersonalSyncService({} as any, {} as any, {} as any)

    service.start(1000)
    expect((service as any).timer).toBeDefined()
    expect((service as any).initialTimer).toBeDefined()

    // start again should ignore
    const timer = (service as any).timer
    const initialTimer = (service as any).initialTimer
    service.start(1000)
    expect((service as any).timer).toBe(timer)
    expect((service as any).initialTimer).toBe(initialTimer)

    service.stop()
    expect((service as any).timer).toBeUndefined()
    expect((service as any).initialTimer).toBeUndefined()

    // stop again should be safe
    service.stop()
    jest.useRealTimers()
  })

  it('skips when getAll returns non-array', async () => {
    const instance = { id: 7, workMode: 'personal', tgUserBot: { isOnline: true } } as any
    const forwardMap = { getAll: mock().mockReturnValue(null) } as any
    const service = new PersonalSyncService(instance, forwardMap, {} as any)
    await service.syncAll()
    // Should return early without crash
  })

  it('skips pairs from different instance', async () => {
    const instance = { id: 7, workMode: 'personal', tgUserBot: { isOnline: true }, tgBot: {} } as any
    const forwardMap = {
      getAll: mock().mockReturnValue([
        { id: 1, instanceId: 99, qqChatType: 'private', qqRoomId: BigInt(111), tgChatId: BigInt(222) },
      ]),
    } as any
    const service = new PersonalSyncService(instance, forwardMap, {} as any)
    await service.syncAll()
    // Should skip this pair
  })

  it('skips non-private non-autoCreated pairs', async () => {
    const instance = { id: 7, workMode: 'personal', tgUserBot: { isOnline: true }, tgBot: {} } as any
    const forwardMap = {
      getAll: mock().mockReturnValue([
        { id: 1, instanceId: 7, qqChatType: 'group', autoCreated: false, qqRoomId: BigInt(111), tgChatId: BigInt(222) },
      ]),
    } as any
    const service = new PersonalSyncService(instance, forwardMap, {} as any)
    await service.syncAll()
    // Should skip
  })

  it('skips syncPair when tgBot is null', async () => {
    const instance = { id: 7, workMode: 'personal', tgUserBot: { isOnline: true }, tgBot: null } as any
    const forwardMap = {
      getAll: mock().mockReturnValue([
        { id: 1, instanceId: 7, qqChatType: 'private', qqRoomId: BigInt(111), tgChatId: BigInt(222), autoCreated: true },
      ]),
    } as any
    const service = new PersonalSyncService(instance, forwardMap, {} as any)
    await service.syncAll()
    // Should return early from syncPair
  })

  it('skips syncPair when tgChat is null', async () => {
    const tgBot = { getChat: mock().mockResolvedValue(null) }
    const instance = { id: 7, workMode: 'personal', tgUserBot: { isOnline: true }, tgBot } as any
    const forwardMap = {
      getAll: mock().mockReturnValue([
        { id: 1, instanceId: 7, qqChatType: 'private', qqRoomId: BigInt(111), tgChatId: BigInt(222), autoCreated: true },
      ]),
    } as any
    const service = new PersonalSyncService(instance, forwardMap, {} as any)
    await service.syncAll()
    // Should return early from syncPair
  })

  it('handles group info error gracefully', async () => {
    const editTitleMock = mock()
    const tgChat = { chat: { title: 'old' }, editTitle: editTitleMock, setProfilePhoto: mock() }
    const tgBot = { getChat: mock().mockResolvedValue(tgChat) }
    const instance = { id: 7, workMode: 'personal', tgUserBot: { isOnline: true }, tgBot } as any
    const forwardMap = {
      getAll: mock().mockReturnValue([
        { id: 1, instanceId: 7, qqChatType: 'group', autoCreated: true, qqRoomId: BigInt(111), tgChatId: BigInt(222) },
      ]),
    } as any
    const qqClient = { getGroupInfo: mock().mockRejectedValue(new Error('offline')) } as any
    const service = new PersonalSyncService(instance, forwardMap, qqClient)
    await service.syncAll()
    // Should still update title with fallback name
    expect(editTitleMock).toHaveBeenCalled()
  })

  it('handles title sync error gracefully', async () => {
    const editTitleMock = mock().mockRejectedValue(new Error('no permission'))
    const setProfilePhotoMock = mock()
    const tgChat = { chat: { title: 'old' }, editTitle: editTitleMock, setProfilePhoto: setProfilePhotoMock }
    const tgBot = { getChat: mock().mockResolvedValue(tgChat) }
    const instance = { id: 7, workMode: 'personal', tgUserBot: { isOnline: true }, tgBot } as any
    const forwardMap = {
      getAll: mock().mockReturnValue([
        { id: 1, instanceId: 7, qqChatType: 'private', qqRoomId: BigInt(111), tgChatId: BigInt(222), qqDisplayName: 'Name', autoCreated: true },
      ]),
    } as any
    const qqClient = { getFriendInfo: mock().mockResolvedValue({ name: 'Name' }) } as any
    const service = new PersonalSyncService(instance, forwardMap, qqClient)
    // Should not throw
    await service.syncAll()
  })

  it('handles setProfilePhoto error gracefully', async () => {
    const editTitleMock = mock()
    const setProfilePhotoMock = mock().mockRejectedValue(new Error('photo error'))
    const tgChat = { chat: { title: 'old' }, editTitle: editTitleMock, setProfilePhoto: setProfilePhotoMock }
    const tgBot = { getChat: mock().mockResolvedValue(tgChat) }
    const instance = { id: 7, workMode: 'personal', tgUserBot: { isOnline: true }, tgBot } as any
    const forwardMap = {
      getAll: mock().mockReturnValue([
        { id: 1, instanceId: 7, qqChatType: 'private', qqRoomId: BigInt(111), tgChatId: BigInt(222), qqDisplayName: 'Name', autoCreated: true },
      ]),
    } as any
    const qqClient = { getFriendInfo: mock().mockResolvedValue({ name: 'Name' }) } as any
    const service = new PersonalSyncService(instance, forwardMap, qqClient)
    // Should not throw
    await service.syncAll()
  })
})
