import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { GroupAPIImpl } from '../../api/group.js'

// Mock logger
mock.module('@napgram/logger-kit', () => ({
  getLogger: mock(() => ({
    info: mock(),
    debug: mock(),
    error: mock(),
    warn: mock(),
  })),
}))

describe('groupAPIImpl', () => {
  let groupAPI: GroupAPIImpl

  beforeEach(() => {
    groupAPI = new GroupAPIImpl()
  })

  it('should initialize correctly', () => {
    expect(groupAPI).toBeInstanceOf(GroupAPIImpl)
  })

  it('should get group info', async () => {
    const mockInstanceResolver = mock().mockReturnValue({
      // Mock instance with necessary properties
    })

    groupAPI = new GroupAPIImpl(mockInstanceResolver)
    ; (groupAPI as any).getQQGroupInfo = mock().mockResolvedValue({
      groupId: 'qq:group:123456',
      groupName: 'Test Group',
    })

    await expect(groupAPI.getInfo({
      instanceId: 1,
      groupId: 'qq:group:123456',
    })).resolves.toEqual({
      groupId: 'qq:group:123456',
      groupName: 'Test Group',
    })
  })

  it('should get group members', async () => {
    const mockInstanceResolver = mock().mockReturnValue({
      // Mock instance with necessary properties
    })

    groupAPI = new GroupAPIImpl(mockInstanceResolver)
    ; (groupAPI as any).getQQGroupMembers = mock().mockResolvedValue([
      { userId: 'qq:user:1', userName: 'User1', role: 'member' },
    ])

    const members = await groupAPI.getMembers({
      instanceId: 1,
      groupId: 'qq:group:123456',
    })

    expect(Array.isArray(members)).toBe(true)
    expect(members).toHaveLength(1)
  })

  it('should return empty members for qq by default', async () => {
    const mockInstanceResolver = mock().mockReturnValue({})

    groupAPI = new GroupAPIImpl(mockInstanceResolver)

    await expect(groupAPI.getMembers({
      instanceId: 1,
      groupId: 'qq:group:123456',
    })).resolves.toEqual([])
  })

  it('should get tg group members', async () => {
    const mockInstanceResolver = mock().mockReturnValue({})

    groupAPI = new GroupAPIImpl(mockInstanceResolver)
    ; (groupAPI as any).getTGGroupMembers = mock().mockResolvedValue([
      { userId: 'tg:user:1', userName: 'User1', role: 'member' },
    ])

    const members = await groupAPI.getMembers({
      instanceId: 1,
      groupId: 'tg:group:123456',
    })

    expect(members).toHaveLength(1)
  })

  it('should return empty members for tg by default', async () => {
    const mockInstanceResolver = mock().mockReturnValue({})

    groupAPI = new GroupAPIImpl(mockInstanceResolver)

    await expect(groupAPI.getMembers({
      instanceId: 1,
      groupId: 'tg:group:123456',
    })).resolves.toEqual([])
  })

  it('should set admin', async () => {
    const mockInstanceResolver = mock().mockReturnValue({})

    groupAPI = new GroupAPIImpl(mockInstanceResolver)
    ; (groupAPI as any).setQQAdmin = mock().mockResolvedValue(undefined)

    await expect(groupAPI.setAdmin({
      instanceId: 1,
      groupId: 'qq:group:123456',
      userId: 'qq:user:789012',
      enable: true,
    })).resolves.toBeUndefined()
  })

  it('should mute user', async () => {
    const mockInstanceResolver = mock().mockReturnValue({})

    groupAPI = new GroupAPIImpl(mockInstanceResolver)
    ; (groupAPI as any).muteQQUser = mock().mockResolvedValue(undefined)

    await expect(groupAPI.muteUser({
      instanceId: 1,
      groupId: 'qq:group:123456',
      userId: 'qq:user:789012',
      duration: 3600,
    })).resolves.toBeUndefined()
  })

  it('should kick user', async () => {
    const mockInstanceResolver = mock().mockReturnValue({})

    groupAPI = new GroupAPIImpl(mockInstanceResolver)
    ; (groupAPI as any).kickQQUser = mock().mockResolvedValue(undefined)

    await expect(groupAPI.kickUser({
      instanceId: 1,
      groupId: 'qq:group:123456',
      userId: 'qq:user:789012',
    })).resolves.toBeUndefined()
  })

  it('should set admin for tg group', async () => {
    const mockInstanceResolver = mock().mockReturnValue({})

    groupAPI = new GroupAPIImpl(mockInstanceResolver)
    ; (groupAPI as any).setTGAdmin = mock().mockResolvedValue(undefined)

    await expect(groupAPI.setAdmin({
      instanceId: 1,
      groupId: 'tg:group:123456',
      userId: 'tg:user:789012',
      enable: true,
    })).resolves.toBeUndefined()
  })

  it('should mute user for tg group', async () => {
    const mockInstanceResolver = mock().mockReturnValue({})

    groupAPI = new GroupAPIImpl(mockInstanceResolver)
    ; (groupAPI as any).muteTGUser = mock().mockResolvedValue(undefined)

    await expect(groupAPI.muteUser({
      instanceId: 1,
      groupId: 'tg:group:123456',
      userId: 'tg:user:789012',
      duration: 3600,
    })).resolves.toBeUndefined()
  })

  it('should kick user for tg group', async () => {
    const mockInstanceResolver = mock().mockReturnValue({})

    groupAPI = new GroupAPIImpl(mockInstanceResolver)
    ; (groupAPI as any).kickTGUser = mock().mockResolvedValue(undefined)

    await expect(groupAPI.kickUser({
      instanceId: 1,
      groupId: 'tg:group:123456',
      userId: 'tg:user:789012',
    })).resolves.toBeUndefined()
  })

  it('should handle missing instance resolver', async () => {
    await expect(groupAPI.getInfo({
      instanceId: 1,
      groupId: 'qq:group:123456',
    })).rejects.toThrow('Instance resolver not configured (Phase 4)')

    await expect(groupAPI.getMembers({
      instanceId: 1,
      groupId: 'qq:group:123456',
    })).rejects.toThrow('Instance resolver not configured (Phase 4)')

    await expect(groupAPI.setAdmin({
      instanceId: 1,
      groupId: 'qq:group:123456',
      userId: 'qq:user:789012',
      enable: true,
    })).rejects.toThrow('Instance resolver not configured (Phase 4)')

    await expect(groupAPI.muteUser({
      instanceId: 1,
      groupId: 'qq:group:123456',
      userId: 'qq:user:789012',
      duration: 3600,
    })).rejects.toThrow('Instance resolver not configured (Phase 4)')

    await expect(groupAPI.kickUser({
      instanceId: 1,
      groupId: 'qq:group:123456',
      userId: 'qq:user:789012',
    })).rejects.toThrow('Instance resolver not configured (Phase 4)')
  })

  it('should handle missing instance', async () => {
    const mockInstanceResolver = mock().mockReturnValue(null)
    groupAPI = new GroupAPIImpl(mockInstanceResolver)

    await expect(groupAPI.getInfo({
      instanceId: 1,
      groupId: 'qq:group:123456',
    })).rejects.toThrow('Instance 1 not found')

    await expect(groupAPI.getMembers({
      instanceId: 1,
      groupId: 'qq:group:123456',
    })).rejects.toThrow('Instance 1 not found')

    await expect(groupAPI.setAdmin({
      instanceId: 1,
      groupId: 'qq:group:123456',
      userId: 'qq:user:789012',
      enable: true,
    })).rejects.toThrow('Instance 1 not found')

    await expect(groupAPI.muteUser({
      instanceId: 1,
      groupId: 'qq:group:123456',
      userId: 'qq:user:789012',
      duration: 3600,
    })).rejects.toThrow('Instance 1 not found')

    await expect(groupAPI.kickUser({
      instanceId: 1,
      groupId: 'qq:group:123456',
      userId: 'qq:user:789012',
    })).rejects.toThrow('Instance 1 not found')
  })

  it('should parse group ID correctly', () => {
    // The parseGroupId method is private, but we can test the expected behavior
    // by ensuring the public methods handle the parsing correctly
    const mockInstanceResolver = mock().mockReturnValue({})
    groupAPI = new GroupAPIImpl(mockInstanceResolver)

    // Test that methods accept properly formatted group IDs
    expect(() => groupAPI.getInfo({
      instanceId: 1,
      groupId: 'qq:group:123456',
    })).not.toThrow()

    expect(() => groupAPI.getInfo({
      instanceId: 1,
      groupId: 'tg:group:789012',
    })).not.toThrow()
  })

  it('should throw for invalid group ID format', async () => {
    const mockInstanceResolver = mock().mockReturnValue({})
    groupAPI = new GroupAPIImpl(mockInstanceResolver)

    await expect(groupAPI.getInfo({
      instanceId: 1,
      groupId: 'invalid',
    })).rejects.toThrow('Invalid groupId format')
  })

  it('should throw for invalid user ID format', async () => {
    const mockInstanceResolver = mock().mockReturnValue({})
    groupAPI = new GroupAPIImpl(mockInstanceResolver)

    await expect(groupAPI.setAdmin({
      instanceId: 1,
      groupId: 'qq:group:123456',
      userId: 'invalid',
      enable: true,
    })).rejects.toThrow('Invalid userId format')
  })

  it('should throw for unknown platform in group id', async () => {
    const mockInstanceResolver = mock().mockReturnValue({})
    groupAPI = new GroupAPIImpl(mockInstanceResolver)

    await expect(groupAPI.getInfo({
      instanceId: 1,
      groupId: 'wx:group:123456',
    })).rejects.toThrow('Unknown platform')

    await expect(groupAPI.getMembers({
      instanceId: 1,
      groupId: 'wx:group:123456',
    })).rejects.toThrow('Unknown platform')
  })

  it('should throw when group and user platforms differ', async () => {
    const mockInstanceResolver = mock().mockReturnValue({})
    groupAPI = new GroupAPIImpl(mockInstanceResolver)

    await expect(groupAPI.setAdmin({
      instanceId: 1,
      groupId: 'qq:group:123456',
      userId: 'tg:user:789012',
      enable: true,
    })).rejects.toThrow('Group and user must be on the same platform')

    await expect(groupAPI.muteUser({
      instanceId: 1,
      groupId: 'qq:group:123456',
      userId: 'tg:user:789012',
      duration: 3600,
    })).rejects.toThrow('Group and user must be on the same platform')

    await expect(groupAPI.kickUser({
      instanceId: 1,
      groupId: 'qq:group:123456',
      userId: 'tg:user:789012',
    })).rejects.toThrow('Group and user must be on the same platform')
  })

  it('should throw for unknown platform in setAdmin, muteUser, kickUser', async () => {
    const mockInstanceResolver = mock().mockReturnValue({})
    groupAPI = new GroupAPIImpl(mockInstanceResolver)

    await expect(groupAPI.setAdmin({
      instanceId: 1,
      groupId: 'wx:group:123456',
      userId: 'wx:user:789012',
      enable: true,
    })).rejects.toThrow('Unknown platform')

    await expect(groupAPI.muteUser({
      instanceId: 1,
      groupId: 'wx:group:123456',
      userId: 'wx:user:789012',
      duration: 3600,
    })).rejects.toThrow('Unknown platform')

    await expect(groupAPI.kickUser({
      instanceId: 1,
      groupId: 'wx:group:123456',
      userId: 'wx:user:789012',
    })).rejects.toThrow('Unknown platform')
  })
})

describe('createGroupAPI', () => {
  it('should create group API instance', () => {
    const groupAPI = new GroupAPIImpl()

    expect(groupAPI).toBeDefined()
    expect(groupAPI.getInfo).toBeDefined()
    expect(groupAPI.getMembers).toBeDefined()
    expect(groupAPI.setAdmin).toBeDefined()
    expect(groupAPI.muteUser).toBeDefined()
    expect(groupAPI.kickUser).toBeDefined()
  })

  it('should create group API with instance resolver', () => {
    const instanceResolver = mock()
    const groupAPI = new GroupAPIImpl(instanceResolver)

    expect(groupAPI).toBeDefined()
  })
})

describe('groupAPIImpl private methods coverage', () => {
  let groupAPI: GroupAPIImpl
  const mockInstanceResolver = mock().mockReturnValue({})

  beforeEach(() => {
    groupAPI = new GroupAPIImpl(mockInstanceResolver)
  })

  // QQ Methods
  it('should call real getQQGroupInfo', async () => {
    // We don't mock getQQGroupInfo, so it runs the real code which returns null
    await expect(groupAPI.getInfo({
      instanceId: 1,
      groupId: 'qq:group:123',
    })).resolves.toBeNull()
  })

  it('should call real getQQGroupMembers', async () => {
    await expect(groupAPI.getMembers({
      instanceId: 1,
      groupId: 'qq:group:123',
    })).resolves.toEqual([])
  })

  it('should call real setQQAdmin', async () => {
    await expect(groupAPI.setAdmin({
      instanceId: 1,
      groupId: 'qq:group:123',
      userId: 'qq:user:456',
      enable: true,
    })).resolves.toBeUndefined()
  })

  it('should call real muteQQUser', async () => {
    await expect(groupAPI.muteUser({
      instanceId: 1,
      groupId: 'qq:group:123',
      userId: 'qq:user:456',
      duration: 60,
    })).resolves.toBeUndefined()
  })

  it('should call real kickQQUser', async () => {
    await expect(groupAPI.kickUser({
      instanceId: 1,
      groupId: 'qq:group:123',
      userId: 'qq:user:456',
    })).resolves.toBeUndefined()
  })

  // TG Methods
  it('should call real getTGGroupInfo', async () => {
    await expect(groupAPI.getInfo({
      instanceId: 1,
      groupId: 'tg:group:123',
    })).resolves.toBeNull()
  })

  it('should call real getTGGroupMembers', async () => {
    await expect(groupAPI.getMembers({
      instanceId: 1,
      groupId: 'tg:group:123',
    })).resolves.toEqual([])
  })

  it('should call real setTGAdmin', async () => {
    await expect(groupAPI.setAdmin({
      instanceId: 1,
      groupId: 'tg:group:123',
      userId: 'tg:user:456',
      enable: true,
    })).resolves.toBeUndefined()
  })

  it('should call real muteTGUser', async () => {
    await expect(groupAPI.muteUser({
      instanceId: 1,
      groupId: 'tg:group:123',
      userId: 'tg:user:456',
      duration: 60,
    })).resolves.toBeUndefined()
  })

  it('should call real kickTGUser', async () => {
    await expect(groupAPI.kickUser({
      instanceId: 1,
      groupId: 'tg:group:123',
      userId: 'tg:user:456',
    })).resolves.toBeUndefined()
  })
})
