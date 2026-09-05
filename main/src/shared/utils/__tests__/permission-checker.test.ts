import type { IQQClient } from '../../../infrastructure/clients/qq'
import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { PermissionChecker } from '../permission-checker'

// Mock QQ Client
function createMockQQClient(): IQQClient {
  return {
    uin: 123456,
    nickname: 'TestBot',
    clientType: 'napcat',
    isOnline: mock().mockResolvedValue(true),
    sendMessage: mock(),
    recallMessage: mock(),
    getMessage: mock(),
    getFriendList: mock(),
    getGroupList: mock(),
    getGroupMemberList: mock(),
    getGroupMemberInfo: mock(),
    getFriendInfo: mock(),
    getGroupInfo: mock(),
    on: mock(),
    once: mock(),
    off: mock(),
    removeListener: mock(),
    removeAllListeners: mock(),
    emit: mock(),
    login: mock(),
    logout: mock(),
    destroy: mock(),
  } as any
}

describe('permissionChecker', () => {
  let mockQQClient: IQQClient

  beforeEach(() => {
    mockQQClient = createMockQQClient()
  })

  describe('isGroupAdmin()', () => {
    it('should return true for group owner', async () => {
      mockQQClient.getGroupMemberInfo.mockResolvedValue({
        uin: '123456',
        nickname: 'Owner',
        role: 'owner',
      } as any)

      const result = await PermissionChecker.isGroupAdmin(
        mockQQClient,
        '789',
        '123456',
      )

      expect(result).toBe(true)
      expect(mockQQClient.getGroupMemberInfo).toHaveBeenCalledWith('789', '123456')
    })

    it('should return true for group admin', async () => {
      mockQQClient.getGroupMemberInfo.mockResolvedValue({
        uin: '123456',
        nickname: 'Admin',
        role: 'admin',
      } as any)

      const result = await PermissionChecker.isGroupAdmin(
        mockQQClient,
        '789',
        '123456',
      )

      expect(result).toBe(true)
    })

    it('should return false for regular member', async () => {
      mockQQClient.getGroupMemberInfo.mockResolvedValue({
        uin: '123456',
        nickname: 'Member',
        role: 'member',
      } as any)

      const result = await PermissionChecker.isGroupAdmin(
        mockQQClient,
        '789',
        '123456',
      )

      expect(result).toBe(false)
    })

    it('should return false when member info is null', async () => {
      mockQQClient.getGroupMemberInfo.mockResolvedValue(null as any)

      const result = await PermissionChecker.isGroupAdmin(
        mockQQClient,
        '789',
        '123456',
      )

      expect(result).toBe(false)
    })

    it('should handle API errors gracefully for owner', async () => {
      mockQQClient.getGroupMemberInfo.mockRejectedValue(
        new Error('API Error'),
      )

      const result = await PermissionChecker.isGroupAdmin(
        mockQQClient,
        '789',
        '123456',
      )

      expect(result).toBe(false)
    })

    it('should handle API errors gracefully', async () => {
      mockQQClient.getGroupMemberInfo.mockRejectedValue(
        new Error('API Error'),
      )

      const result = await PermissionChecker.isGroupOwner(
        mockQQClient,
        '789',
        '123456',
      )

      expect(result).toBe(false)
    })
  })

  describe('isGroupOwner()', () => {
    it('should return true for group owner', async () => {
      mockQQClient.getGroupMemberInfo.mockResolvedValue({
        uin: '123456',
        nickname: 'Owner',
        role: 'owner',
      } as any)

      const result = await PermissionChecker.isGroupOwner(
        mockQQClient,
        '789',
        '123456',
      )

      expect(result).toBe(true)
    })

    it('should return false for group admin', async () => {
      mockQQClient.getGroupMemberInfo.mockResolvedValue({
        uin: '123456',
        nickname: 'Admin',
        role: 'admin',
      } as any)

      const result = await PermissionChecker.isGroupOwner(
        mockQQClient,
        '789',
        '123456',
      )

      expect(result).toBe(false)
    })

    it('should return false for regular member', async () => {
      mockQQClient.getGroupMemberInfo.mockResolvedValue({
        uin: '123456',
        nickname: 'Member',
        role: 'member',
      } as any)

      const result = await PermissionChecker.isGroupOwner(
        mockQQClient,
        '789',
        '123456',
      )

      expect(result).toBe(false)
    })

    it('should return false when member info is null', async () => {
      mockQQClient.getGroupMemberInfo.mockResolvedValue(null as any)

      const result = await PermissionChecker.isGroupOwner(
        mockQQClient,
        '789',
        '123456',
      )

      expect(result).toBe(false)
    })
  })

  describe('canManageUser()', () => {
    it('should allow owner to manage anyone', async () => {
      // Operator is owner
      mockQQClient.getGroupMemberInfo
        .mockResolvedValueOnce({
          uin: '123',
          nickname: 'Owner',
          role: 'owner',
        } as any)
      // Target is admin
        .mockResolvedValueOnce({
          uin: '456',
          nickname: 'Admin',
          role: 'admin',
        } as any)

      const result = await PermissionChecker.canManageUser(
        mockQQClient,
        '789',
        '123',
        '456',
      )

      expect(result.canManage).toBe(true)
      expect(result.reason).toBeUndefined()
    })

    it('should allow admin to manage regular members', async () => {
      // Operator is admin
      mockQQClient.getGroupMemberInfo
        .mockResolvedValueOnce({
          uin: '123',
          nickname: 'Admin',
          role: 'admin',
        } as any)
      // Target is member
        .mockResolvedValueOnce({
          uin: '456',
          nickname: 'Member',
          role: 'member',
        } as any)

      const result = await PermissionChecker.canManageUser(
        mockQQClient,
        '789',
        '123',
        '456',
      )

      expect(result.canManage).toBe(true)
      expect(result.reason).toBeUndefined()
    })

    it('should prevent admin from managing owner', async () => {
      // Operator is admin
      mockQQClient.getGroupMemberInfo
        .mockResolvedValueOnce({
          uin: '123',
          nickname: 'Admin',
          role: 'admin',
        } as any)
      // Target is owner
        .mockResolvedValueOnce({
          uin: '456',
          nickname: 'Owner',
          role: 'owner',
        } as any)

      const result = await PermissionChecker.canManageUser(
        mockQQClient,
        '789',
        '123',
        '456',
      )

      expect(result.canManage).toBe(false)
      expect(result.reason).toBe('权限不足：无法管理群主或其他管理员')
    })

    it('should prevent admin from managing other admins', async () => {
      // Operator is admin
      mockQQClient.getGroupMemberInfo
        .mockResolvedValueOnce({
          uin: '123',
          nickname: 'Admin1',
          role: 'admin',
        } as any)
      // Target is also admin
        .mockResolvedValueOnce({
          uin: '456',
          nickname: 'Admin2',
          role: 'admin',
        } as any)

      const result = await PermissionChecker.canManageUser(
        mockQQClient,
        '789',
        '123',
        '456',
      )

      expect(result.canManage).toBe(false)
      expect(result.reason).toBe('权限不足：无法管理群主或其他管理员')
    })

    it('should prevent regular members from managing anyone', async () => {
      // Operator is member
      mockQQClient.getGroupMemberInfo
        .mockResolvedValueOnce({
          uin: '123',
          nickname: 'Member1',
          role: 'member',
        } as any)
      // Target is also member
        .mockResolvedValueOnce({
          uin: '456',
          nickname: 'Member2',
          role: 'member',
        } as any)

      const result = await PermissionChecker.canManageUser(
        mockQQClient,
        '789',
        '123',
        '456',
      )

      expect(result.canManage).toBe(false)
      expect(result.reason).toBe('权限不足：需要管理员或群主权限')
    })

    it('should handle missing operator info', async () => {
      mockQQClient.getGroupMemberInfo
        .mockResolvedValueOnce(null as any)
        .mockResolvedValueOnce({
          uin: '456',
          nickname: 'Target',
          role: 'member',
        } as any)

      const result = await PermissionChecker.canManageUser(
        mockQQClient,
        '789',
        '123',
        '456',
      )

      expect(result.canManage).toBe(false)
      expect(result.reason).toBe('无法获取操作者信息')
    })

    it('should handle missing target info', async () => {
      mockQQClient.getGroupMemberInfo
        .mockResolvedValueOnce({
          uin: '123',
          nickname: 'Admin',
          role: 'admin',
        } as any)
        .mockResolvedValueOnce(null as any)

      const result = await PermissionChecker.canManageUser(
        mockQQClient,
        '789',
        '123',
        '456',
      )

      expect(result.canManage).toBe(false)
      expect(result.reason).toBe('目标用户不在群内')
    })

    it('should handle API errors', async () => {
      mockQQClient.getGroupMemberInfo.mockRejectedValue(
        new Error('Network error'),
      )

      // Since the actual implementation doesn't catch errors in canManageUser,
      // the error will propagate
      await expect(
        PermissionChecker.canManageUser(mockQQClient, '789', '123', '456'),
      ).rejects.toThrow('Network error')
    })
  })
})
