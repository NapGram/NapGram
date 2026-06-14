import { getSystemOwners, matchesAnyIdentity, type AdminIdentityValue } from '@napgram/env-kit'

export function isInstanceAdmin(userId: string, owner?: AdminIdentityValue): boolean {
  const systemOwners = getSystemOwners()
  return matchesAnyIdentity(userId, [
    owner,
    systemOwners.qq,
    systemOwners.tg,
  ])
}
