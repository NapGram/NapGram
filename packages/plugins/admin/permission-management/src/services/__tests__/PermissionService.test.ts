import { describe, expect, it, mock } from 'bun:test'
import { PermissionLevel } from '../../types/index.js'
import { PermissionService } from '../PermissionService.js'

function createService(instanceResolver?: (instanceId: number) => Promise<any> | any) {
  const db = {
    select: mock(),
    insert: mock(),
    delete: mock(),
    execute: mock(),
  }

  const logger = {
    debug: mock(),
    info: mock(),
    warn: mock(),
    error: mock(),
  }

  return {
    db,
    logger,
    service: new PermissionService(db as any, logger as any, instanceResolver, {
      systemOwners: {
        qq: '111',
        tg: '222',
      },
    }),
  }
}

describe('PermissionService', () => {
  it('treats system owners as super admins', async () => {
    const { service, db } = createService()

    await expect(service.getPermissionLevel('qq:u:111')).resolves.toBe(PermissionLevel.SUPER_ADMIN)
    expect(db.select).not.toHaveBeenCalled()
  })

  it('treats instance owners as admins', async () => {
    const { service, db } = createService(async () => ({ owner: '333' }))

    await expect(service.getPermissionLevel('tg:u:333', 7)).resolves.toBe(PermissionLevel.ADMIN)
    expect(db.select).not.toHaveBeenCalled()
  })

  it('treats owner tg ids as admins', async () => {
    const { service, db } = createService(async () => ({ ownerTgId: '444' }))

    await expect(service.getPermissionLevel('tg:u:444', 7)).resolves.toBe(PermissionLevel.ADMIN)
    expect(db.select).not.toHaveBeenCalled()
  })
})
