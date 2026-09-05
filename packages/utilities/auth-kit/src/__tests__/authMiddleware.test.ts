import { beforeEach, describe, expect, it, mock } from 'bun:test'

const verifyToken = mock()
const logAudit = mock()

mock.module('../TokenManager.js', () => ({
  TokenManager: { verifyToken },
}))
mock.module('../AuthService.js', () => ({
  AuthService: { logAudit },
}))

describe('authMiddleware', () => {
  beforeEach(() => {
    verifyToken.mockReset()
    logAudit.mockReset()
  })

  it('does not authenticate from a query token', async () => {
    const { authMiddleware } = await import('../authMiddleware.js')
    const request = {
      headers: {},
      cookies: {},
      query: { token: 'query-token' },
      method: 'GET',
      url: '/api/files/download?token=query-token',
      ip: '127.0.0.1',
    } as any
    const reply = {
      code: mock().mockReturnThis(),
      send: mock().mockResolvedValue(undefined),
    } as any

    await expect(authMiddleware(request, reply)).resolves.toBe(false)
    expect(reply.code).toHaveBeenCalledWith(401)
    expect(verifyToken).not.toHaveBeenCalled()
  })

  it('propagates the role into the request auth context', async () => {
    verifyToken.mockResolvedValue({ type: 'session', userId: 7, role: 'moderator' })
    const { authMiddleware } = await import('../authMiddleware.js')
    const request = {
      headers: { authorization: 'Bearer session-token' },
      cookies: {},
      method: 'GET',
      url: '/api/admin/messages',
      ip: '127.0.0.1',
    } as any
    const reply = {
      code: mock().mockReturnThis(),
      send: mock().mockResolvedValue(undefined),
    } as any

    await expect(authMiddleware(request, reply)).resolves.toBe(true)
    expect(request.auth).toMatchObject({ userId: 7, role: 'moderator', token: 'session-token' })
    expect(logAudit).toHaveBeenCalledWith(7, 'api:GET:/api/admin/messages', undefined, undefined, undefined, '127.0.0.1', undefined)
  })
})
