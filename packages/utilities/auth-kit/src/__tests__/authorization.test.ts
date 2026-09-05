import { describe, expect, it } from 'bun:test'
import { hasAdminPermission } from '../authorization.js'

describe('admin authorization', () => {
  it('allows viewers to read files but not modify or delete them', () => {
    expect(hasAdminPermission('viewer', 'files:read')).toBe(true)
    expect(hasAdminPermission('viewer', 'files:write')).toBe(false)
    expect(hasAdminPermission('viewer', 'files:delete')).toBe(false)
  })

  it('allows moderators to write messages but not manage instances', () => {
    expect(hasAdminPermission('moderator', 'messages:write')).toBe(true)
    expect(hasAdminPermission('moderator', 'instances:write')).toBe(false)
  })

  it('restricts destructive administration to super admins', () => {
    expect(hasAdminPermission('admin', 'plugins:manage')).toBe(false)
    expect(hasAdminPermission('super_admin', 'plugins:manage')).toBe(true)
    expect(hasAdminPermission(undefined, 'admin:read')).toBe(false)
  })
})
