import { describe, expect, it, vi } from 'vitest'
import { PermissionLevel } from '../../types/index.js'
import { PermissionService } from '../PermissionService.js'

function createService(instanceResolver?: (instanceId: number) => Promise<any> | any) {
  const db = {
    select: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
    execute: vi.fn(),
  }

  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
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
