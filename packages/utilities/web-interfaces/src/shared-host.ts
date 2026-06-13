import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import path from 'node:path'
import { and, count, db, desc, drizzleDb, eq, gte, inArray, like, lt, lte, or, schema, sql } from '@napgram/db-kit'
import { env } from '@napgram/env-kit'
import { getLogger, sentry } from '@napgram/logger-kit'
import { performanceMonitor } from '@napgram/infra-kit'
import { convert } from '@napgram/media-kit'
import { getGlobalRuntime, InstanceRegistry } from '@napgram/runtime-kit'
import { ApiResponse } from './api-response.js'

export class TTLCache<K, V> {
  private readonly cache = new Map<K, { value: V, expiresAt: number }>()

  constructor(private readonly defaultTtl = 60_000) {}

  set(key: K, value: V, ttl = this.defaultTtl) {
    this.cache.set(key, { value, expiresAt: Date.now() + ttl })
  }

  get(key: K): V | undefined {
    const entry = this.cache.get(key)
    if (!entry)
      return undefined
    if (entry.expiresAt < Date.now()) {
      this.cache.delete(key)
      return undefined
    }
    return entry.value
  }

  delete(key: K) {
    return this.cache.delete(key)
  }

  clear() {
    this.cache.clear()
  }

  size() {
    return this.cache.size
  }

  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.cache.size,
      totalHits: 0,
      expiredCount: 0,
      utilization: 0,
    }
  }
}

export { env, ApiResponse, db, drizzleDb, schema, eq, and, or, lt, lte, gte, count, desc, sql, like, inArray }
export { getLogger, sentry, InstanceRegistry, getGlobalRuntime, performanceMonitor, convert }

export const groupInfoCache = new TTLCache<string, any>(300_000)
export const configCache = new TTLCache<string, any>(300_000)
export const mediaCache = new TTLCache<string, any>(300_000)
export const userInfoCache = new TTLCache<string, any>(300_000)
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
