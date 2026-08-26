export type AdminRole = 'super_admin' | 'admin' | 'moderator' | 'viewer'

export type AdminPermission =
  | 'admin:read'
  | 'admin:write'
  | 'users:manage'
  | 'files:read'
  | 'files:write'
  | 'files:delete'
  | 'instances:read'
  | 'instances:write'
  | 'database:read'
  | 'database:write'
  | 'logs:read'
  | 'messages:read'
  | 'messages:write'
  | 'monitoring:read'
  | 'statistics:read'
  | 'pairs:read'
  | 'pairs:write'
  | 'settings:read'
  | 'settings:write'
  | 'tokens:manage'
  | 'plugins:manage'
  | 'marketplaces:manage'
  | 'permissions:manage'

const ROLE_LEVEL: Record<AdminRole, number> = {
  super_admin: 0,
  admin: 1,
  moderator: 2,
  viewer: 3,
}

const PERMISSION_LEVEL: Record<AdminPermission, number> = {
  'admin:read': 1,
  'admin:write': 1,
  'users:manage': 0,
  'files:read': 3,
  'files:write': 2,
  'files:delete': 1,
  'instances:read': 3,
  'instances:write': 1,
  'database:read': 1,
  'database:write': 0,
  'logs:read': 2,
  'messages:read': 2,
  'messages:write': 2,
  'monitoring:read': 3,
  'statistics:read': 3,
  'pairs:read': 2,
  'pairs:write': 1,
  'settings:read': 3,
  'settings:write': 1,
  'tokens:manage': 1,
  'plugins:manage': 0,
  'marketplaces:manage': 1,
  'permissions:manage': 0,
}

export function normalizeAdminRole(value: unknown): AdminRole {
  if (value === 'super_admin' || value === 'admin' || value === 'moderator' || value === 'viewer') {
    return value
  }
  return 'admin'
}

export function hasAdminPermission(role: AdminRole | undefined, permission: AdminPermission): boolean {
  if (!role) {
    return false
  }
  return ROLE_LEVEL[normalizeAdminRole(role)] <= PERMISSION_LEVEL[permission]
}
