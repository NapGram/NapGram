import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import path from 'node:path'
import { env } from './web-deps.js'

export const TEMP_PATH = path.join(env.DATA_DIR, 'temp')

export function registerDualRoute(
  fastify: FastifyInstance,
  path1: string,
  path2: string,
  handler: (request: FastifyRequest, reply: FastifyReply) => Promise<any> | any,
  opts?: { schema?: any },
) {
  const config = opts?.schema ? { schema: opts.schema } : {}
  fastify.get(path1, config, handler)
  fastify.get(path2, config, handler)
}

export const ErrorResponses = {
  notFound(reply: FastifyReply, message = 'Not Found') {
    return reply.code(404).send({ error: message })
  },
  badRequest(reply: FastifyReply, message = 'Bad Request') {
    return reply.code(400).send({ error: message })
  },
  unauthorized(reply: FastifyReply, message = 'Unauthorized') {
    return reply.code(401).send({ error: message })
  },
  forbidden(reply: FastifyReply, message = 'Forbidden') {
    return reply.code(403).send({ error: message })
  },
  internalError(reply: FastifyReply, message = 'Internal Server Error') {
    return reply.code(500).send({ error: message })
  },
}

export function getMimeType(filename: string) {
  const ext = path.extname(filename).toLowerCase()
  const map: Record<string, string> = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.mp3': 'audio/mpeg',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.ogg': 'audio/ogg',
    '.webp': 'image/webp',
  }
  return map[ext] || 'application/octet-stream'
}

export function formatDate(ts: number | Date, formatStr = 'yyyy-MM-dd HH:mm') {
  const date = typeof ts === 'number' ? new Date(ts) : ts
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const H = String(date.getHours()).padStart(2, '0')
  const M = String(date.getMinutes()).padStart(2, '0')

  return formatStr
    .replace('yyyy', String(y))
    .replace('MM', m)
    .replace('dd', d)
    .replace('HH', H)
    .replace('mm', M)
}

export function stringifyBigInts(obj: any): any {
  if (obj === null || obj === undefined)
    return obj
  if (typeof obj === 'bigint')
    return obj.toString()
  if (Array.isArray(obj))
    return obj.map(item => stringifyBigInts(item))
  if (typeof obj === 'object' && !(obj instanceof Date)) {
    return Object.fromEntries(Object.entries(obj).map(([key, value]) => [key, stringifyBigInts(value)]))
  }
  return obj
}
