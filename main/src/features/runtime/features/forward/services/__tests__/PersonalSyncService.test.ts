import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PersonalSyncService } from '../PersonalSyncService.js'

const loggerMocks = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}))

vi.mock('../../../../shared-types.js', () => ({
  getLogger: vi.fn(() => loggerMocks),
}))

const fetchMock = vi.fn().mockImplementation(() => {
  return Promise.resolve({
    ok: true,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)),
  })
})
global.fetch = fetchMock as any

describe('PersonalSyncService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock.mockClear()
  })

  it('skips sync if workMode is not personal', async () => {
    const instance = {
      id: 7,
      workMode: 'normal',
    } as any
    const forwardMap = {
      getAll: vi.fn().mockReturnValue([]),
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
      getAll: vi.fn().mockReturnValue([]),
    } as any
    const qqClient = {} as any

    const service = new PersonalSyncService(instance, forwardMap, qqClient)
    await service.syncAll()

    expect(forwardMap.getAll).not.toHaveBeenCalled()
  })

  it('runs sync for private and autoCreated pairs, updating title and avatar', async () => {
    const editTitleMock = vi.fn()
    const setProfilePhotoMock = vi.fn()
    const tgChat = {
      chat: {
        title: 'QQ 好友 OldName',
      },
      editTitle: editTitleMock,
      setProfilePhoto: setProfilePhotoMock,
    }

    const tgBot = {
      getChat: vi.fn().mockResolvedValue(tgChat),
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
      getAll: vi.fn().mockReturnValue([
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
      getFriendInfo: vi.fn().mockResolvedValue({ name: 'NewName' }),
    } as any

    const service = new PersonalSyncService(instance, forwardMap, qqClient)
    await service.syncAll()

    expect(qqClient.getFriendInfo).toHaveBeenCalledWith('22222')
    expect(tgBot.getChat).toHaveBeenCalledWith(-10020002)
    expect(editTitleMock).toHaveBeenCalledWith('QQ 好友 NewName')
    expect(fetchMock).toHaveBeenCalled()
    expect(setProfilePhotoMock).toHaveBeenCalled()
  })
})
