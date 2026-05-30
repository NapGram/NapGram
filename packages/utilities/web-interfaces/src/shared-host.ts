import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import * as infraKit from '@napgram/infra-kit'
import * as runtimeKit from '@napgram/runtime-kit'
import convert from '@napgram/runtime-kit'
import { ApiResponse as actualApiResponse, InstanceRegistry as actualInstanceRegistry, getGlobalRuntime as actualGetGlobalRuntime } from '@napgram/runtime-kit'
import { and as actualAnd, count as actualCount, db as actualDb, desc as actualDesc, drizzleDb as actualDrizzleDb, eq as actualEq, gte as actualGte, inArray as actualInArray, like as actualLike, lt as actualLt, lte as actualLte, or as actualOr, schema as actualSchema, sql as actualSql } from '@napgram/db-kit'
import { env as actualEnv } from '@napgram/env-kit'
import { getLogger as actualGetLogger, sentry as actualSentry } from '@napgram/logger-kit'
import path from 'node:path'

const infra = infraKit as Record<string, any>
const runtime = runtimeKit as Record<string, any>

function getCompatExport<T>(fallback: T, ...keys: string[]): T {
  for (const key of keys) {
    if (key in infra)
      return infra[key] as T
    if (key in runtime)
      return runtime[key] as T
  }
  return fallback
}

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

const noopPerformanceMonitor = {
  recordMessage(..._args: any[]) {},
  recordError(..._args: any[]) {},
  recordCacheHit(..._args: any[]) {},
  recordCacheMiss(..._args: any[]) {},
  updateMemoryUsage(..._args: any[]) {},
  getStats() {
    return {
      uptime: 0,
      totalMessages: 0,
      messagesPerSecond: 0,
      avgLatency: 0,
      p50Latency: 0,
      p95Latency: 0,
      p99Latency: 0,
      totalErrors: 0,
      errorRate: 0,
      cacheHits: 0,
      cacheMisses: 0,
      cacheHitRate: 0,
      memoryUsageMB: 0,
    }
  },
  printStats(..._args: any[]) {},
}

export const env = getCompatExport(actualEnv, 'env')
export const ApiResponse = getCompatExport(actualApiResponse, 'ApiResponse')
export const db = getCompatExport(actualDb, 'db')
export const drizzleDb = getCompatExport(actualDrizzleDb, 'drizzleDb')
export const schema = getCompatExport(actualSchema, 'schema')
export const eq = getCompatExport(actualEq, 'eq')
export const and = getCompatExport(actualAnd, 'and')
export const or = getCompatExport(actualOr, 'or')
export const lt = getCompatExport(actualLt, 'lt')
export const lte = getCompatExport(actualLte, 'lte')
export const gte = getCompatExport(actualGte, 'gte')
export const count = getCompatExport(actualCount, 'count')
export const desc = getCompatExport(actualDesc, 'desc')
export const sql = getCompatExport(actualSql, 'sql')
export const like = getCompatExport(actualLike, 'like')
export const inArray = getCompatExport(actualInArray, 'inArray')
export const getLogger = getCompatExport(actualGetLogger, 'getLogger')
export const sentry = getCompatExport(actualSentry, 'sentry')
export const InstanceRegistry = getCompatExport(actualInstanceRegistry, 'InstanceRegistry')
export const getGlobalRuntime = getCompatExport(actualGetGlobalRuntime, 'getGlobalRuntime')
export const groupInfoCache = getCompatExport(new TTLCache<string, any>(300_000), 'groupInfoCache')
export const configCache = getCompatExport(new TTLCache<string, any>(300_000), 'configCache')
export const mediaCache = getCompatExport(new TTLCache<string, any>(300_000), 'mediaCache')
export const userInfoCache = getCompatExport(new TTLCache<string, any>(300_000), 'userInfoCache')
export const performanceMonitor = getCompatExport(noopPerformanceMonitor, 'performanceMonitor')
export const TEMP_PATH = getCompatExport(path.join(env.DATA_DIR, 'temp'), 'TEMP_PATH')
export { convert }

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
