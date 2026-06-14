import env from './env.js'

export type AdminIdentityValue = string | number | null | undefined

export interface SystemOwners {
  qq?: number
  tg?: number
}

export function normalizeUserIdentity(value: AdminIdentityValue): string {
  return String(value ?? '')
    .trim()
    .replace(/^(?:tg|qq):u:/i, '')
}

export function isConfiguredIdentity(value: AdminIdentityValue): boolean {
  return value !== undefined && value !== null && String(value).trim() !== ''
}

export function matchesUserIdentity(userId: string, identity: AdminIdentityValue): boolean {
  return isConfiguredIdentity(identity) && normalizeUserIdentity(userId) === normalizeUserIdentity(identity)
}

export function matchesAnyIdentity(userId: string, identities: AdminIdentityValue[]): boolean {
  return identities.some(identity => matchesUserIdentity(userId, identity))
}

export function getSystemOwners(): SystemOwners {
  return {
    qq: env.ADMIN_QQ,
    tg: env.ADMIN_TG,
  }
}
