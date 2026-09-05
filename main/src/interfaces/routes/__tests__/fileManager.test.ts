import { beforeEach, describe, expect, it, mock, spyOn } from 'bun:test'
import * as pathUtils from '../../../shared/utils/path.js'
import Fastify from 'fastify'
import { registerFileManagerRoutes } from '../fileManager.js'

mock.module('@napgram/auth-kit', () => ({
  authMiddleware: mock(async (req, _reply) => {
    (req as any).auth = { type: 'token', role: 'admin' }
  }),
  requirePermission: mock(() => async (req: any) => {
    req.auth = { type: 'access', role: 'super_admin' }
  }),
}))

describe('fileManager Routes', () => {
  let app: any

  beforeEach(async () => {
    app = Fastify()
    registerFileManagerRoutes(app)
    await app.ready()
  })

  it('rejects path outside allowed root for list', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/files/list?path=../../etc/passwd',
    })

    expect(response.statusCode).toBe(403)
    expect(JSON.parse(response.payload).error).toContain('Access denied')
  })

  it('rejects a sibling path that only shares the data root prefix', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/files/list?path=../data-evil',
    })

    expect(response.statusCode).toBe(403)
    expect(JSON.parse(response.payload).error).toContain('Access denied')
  })

  it('handles sanitizePath throwing error', async () => {
    const spy = spyOn(pathUtils, 'normalizePath').mockImplementation(() => {
      throw new Error('Invalid path')
    })

    const response = await app.inject({
      method: 'GET',
      url: '/api/files/list?path=test',
    })

    expect(response.statusCode).toBe(403)
    expect(JSON.parse(response.payload).error).toBe('Invalid path')

    spy.mockRestore()
  })
})
