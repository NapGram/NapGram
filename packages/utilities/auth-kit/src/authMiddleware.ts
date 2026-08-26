import '@fastify/cookie'
import type { FastifyReply, FastifyRequest } from 'fastify'
import '@fastify/cookie'
import type { AdminPermission, AdminRole } from './authorization.js'
import { hasAdminPermission } from './authorization.js'
import { AuthService } from './AuthService.js'
import { TokenManager } from './TokenManager.js'

function getRequestToken(request: FastifyRequest): string | undefined {
  const authHeader = request.headers.authorization
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length).trim()
    if (token)
      return token
  }

  const cookieToken = request.cookies?.admin_token
  return cookieToken ? String(cookieToken) : undefined
}

/**
 * 认证中间件 - 只接受 Authorization Bearer 或 HttpOnly cookie。
 * token 不再从 query 参数读取，避免出现在 URL、代理和访问日志中。
 */
export async function authMiddleware(request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  const token = getRequestToken(request)

  if (!token) {
    await reply.code(401).send({
      error: 'Unauthorized',
      message: 'No authentication token provided',
    })
    return false
  }

  const authResult = await TokenManager.verifyToken(token)

  if (!authResult) {
    await reply.code(401).send({
      error: 'Unauthorized',
      message: 'Invalid or expired token',
    })
    return false
  }

  ;(request as any).auth = {
    type: authResult.type,
    userId: authResult.userId,
    role: authResult.role,
    token,
  }

  if (authResult.userId) {
    const action = `api:${request.method}:${request.url}`
    await AuthService.logAudit(
      authResult.userId,
      action,
      undefined,
      undefined,
      undefined,
      request.ip,
      request.headers['user-agent'],
    )
  }

  return true
}

/**
 * 细粒度管理员授权中间件。
 */
export function requirePermission(permission: AdminPermission) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<boolean> => {
    if (!await authMiddleware(request, reply))
      return false

    const auth = (request as any).auth as { role?: AdminRole } | undefined
    if (!hasAdminPermission(auth?.role, permission)) {
      await reply.code(403).send({
        error: 'Forbidden',
        message: `Missing permission: ${permission}`,
      })
      return false
    }

    return true
  }
}

/**
 * 可选认证中间件 - token 有效时附加认证信息，无效时继续。
 */
export async function optionalAuthMiddleware(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const token = getRequestToken(request)
  if (!token)
    return

  const authResult = await TokenManager.verifyToken(token)
  if (authResult) {
    ;(request as any).auth = {
      type: authResult.type,
      userId: authResult.userId,
      role: authResult.role,
      token,
    }
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    auth?: {
      type: 'access' | 'session' | 'env'
      userId?: number
      role: AdminRole
      token: string
    }
  }
}
