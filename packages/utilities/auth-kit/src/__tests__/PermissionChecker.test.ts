import { describe, expect, it, vi, beforeEach } from 'vitest'

describe('PermissionChecker', () => {
  describe('isGroupAdmin', () => {
    it('should return true for admin', async () => {
      const { PermissionChecker } = await import('../PermissionChecker.js')
      const mockQqClient = {
        getGroupMemberInfo: vi.fn().mockResolvedValue({ role: 'admin' }),
      } as any

      const result = await PermissionChecker.isGroupAdmin(mockQqClient, '123', '456')
      expect(result).toBe(true)
    })

    it('should return true for owner', async () => {
      const { PermissionChecker } = await import('../PermissionChecker.js')
      const mockQqClient = {
        getGroupMemberInfo: vi.fn().mockResolvedValue({ role: 'owner' }),
      } as any

      const result = await PermissionChecker.isGroupAdmin(mockQqClient, '123', '456')
      expect(result).toBe(true)
    })

    it('should return false for member', async () => {
      const { PermissionChecker } = await import('../PermissionChecker.js')
      const mockQqClient = {
        getGroupMemberInfo: vi.fn().mockResolvedValue({ role: 'member' }),
      } as any

      const result = await PermissionChecker.isGroupAdmin(mockQqClient, '123', '456')
      expect(result).toBe(false)
    })

    it('should return false for null member info', async () => {
      const { PermissionChecker } = await import('../PermissionChecker.js')
      const mockQqClient = {
        getGroupMemberInfo: vi.fn().mockResolvedValue(null),
      } as any

      const result = await PermissionChecker.isGroupAdmin(mockQqClient, '123', '456')
      expect(result).toBe(false)
    })

    it('should return false on error', async () => {
      const { PermissionChecker } = await import('../PermissionChecker.js')
      const mockQqClient = {
        getGroupMemberInfo: vi.fn().mockRejectedValue(new Error('Network error')),
      } as any

      const result = await PermissionChecker.isGroupAdmin(mockQqClient, '123', '456')
      expect(result).toBe(false)
    })
  })

  describe('isGroupOwner', () => {
    it('should return true for owner', async () => {
      const { PermissionChecker } = await import('../PermissionChecker.js')
      const mockQqClient = {
        getGroupMemberInfo: vi.fn().mockResolvedValue({ role: 'owner' }),
      } as any

      const result = await PermissionChecker.isGroupOwner(mockQqClient, '123', '456')
      expect(result).toBe(true)
    })

    it('should return false for admin', async () => {
      const { PermissionChecker } = await import('../PermissionChecker.js')
      const mockQqClient = {
        getGroupMemberInfo: vi.fn().mockResolvedValue({ role: 'admin' }),
      } as any

      const result = await PermissionChecker.isGroupOwner(mockQqClient, '123', '456')
      expect(result).toBe(false)
    })

    it('should return false for member', async () => {
      const { PermissionChecker } = await import('../PermissionChecker.js')
      const mockQqClient = {
        getGroupMemberInfo: vi.fn().mockResolvedValue({ role: 'member' }),
      } as any

      const result = await PermissionChecker.isGroupOwner(mockQqClient, '123', '456')
      expect(result).toBe(false)
    })
  })

  describe('canManageUser', () => {
    it('owner can manage anyone', async () => {
      const { PermissionChecker } = await import('../PermissionChecker.js')
      const mockQqClient = {
        getGroupMemberInfo: vi.fn().mockImplementation(async (groupId: string, userId: string) => {
          if (userId === 'operator') return { role: 'owner' }
          if (userId === 'target') return { role: 'admin' }
          return null
        }),
      } as any

      const result = await PermissionChecker.canManageUser(mockQqClient, '123', 'operator', 'target')
      expect(result.canManage).toBe(true)
    })

    it('admin can manage member', async () => {
      const { PermissionChecker } = await import('../PermissionChecker.js')
      const mockQqClient = {
        getGroupMemberInfo: vi.fn().mockImplementation(async (groupId: string, userId: string) => {
          if (userId === 'operator') return { role: 'admin' }
          if (userId === 'target') return { role: 'member' }
          return null
        }),
      } as any

      const result = await PermissionChecker.canManageUser(mockQqClient, '123', 'operator', 'target')
      expect(result.canManage).toBe(true)
    })

    it('admin cannot manage other admin', async () => {
      const { PermissionChecker } = await import('../PermissionChecker.js')
      const mockQqClient = {
        getGroupMemberInfo: vi.fn().mockImplementation(async (groupId: string, userId: string) => {
          if (userId === 'operator') return { role: 'admin' }
          if (userId === 'target') return { role: 'admin' }
          return null
        }),
      } as any

      const result = await PermissionChecker.canManageUser(mockQqClient, '123', 'operator', 'target')
      expect(result.canManage).toBe(false)
      expect(result.reason).toContain('权限不足')
    })

    it('member cannot manage anyone', async () => {
      const { PermissionChecker } = await import('../PermissionChecker.js')
      const mockQqClient = {
        getGroupMemberInfo: vi.fn().mockImplementation(async (groupId: string, userId: string) => {
          if (userId === 'operator') return { role: 'member' }
          if (userId === 'target') return { role: 'member' }
          return null
        }),
      } as any

      const result = await PermissionChecker.canManageUser(mockQqClient, '123', 'operator', 'target')
      expect(result.canManage).toBe(false)
      expect(result.reason).toContain('权限不足')
    })

    it('should return error when operator not found', async () => {
      const { PermissionChecker } = await import('../PermissionChecker.js')
      const mockQqClient = {
        getGroupMemberInfo: vi.fn().mockResolvedValue(null),
      } as any

      const result = await PermissionChecker.canManageUser(mockQqClient, '123', 'operator', 'target')
      expect(result.canManage).toBe(false)
      expect(result.reason).toContain('操作者')
    })

    it('should return error when target not found', async () => {
      const { PermissionChecker } = await import('../PermissionChecker.js')
      const mockQqClient = {
        getGroupMemberInfo: vi.fn().mockImplementation(async (groupId: string, userId: string) => {
          if (userId === 'operator') return { role: 'admin' }
          return null
        }),
      } as any

      const result = await PermissionChecker.canManageUser(mockQqClient, '123', 'operator', 'target')
      expect(result.canManage).toBe(false)
      expect(result.reason).toContain('目标用户')
    })
  })
})
