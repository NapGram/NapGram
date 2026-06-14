import Fastify from 'fastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { registerFileManagerRoutes } from '../fileManager.js'

vi.mock('@napgram/auth-kit', () => ({
  authMiddleware: vi.fn(async (req, _reply) => {
    (req as any).auth = { type: 'token' }
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

  it('handles sanitizePath throwing error', async () => {
    const path = await import('node:path')
    const spy = vi.spyOn(path.default, 'normalize').mockImplementation(() => {
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
