import { closeSync, mkdirSync, openSync, readFileSync, writeFileSync, writeSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { SpanStatusCode, trace, type Attributes } from '@opentelemetry/api'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { BatchSpanProcessor, NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
import {
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
  ATTR_SERVICE_INSTANCE_ID,
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions'
import { env } from '@napgram/env-kit'
import getLogger from './logger.js'

const logger = getLogger('Telemetry')
const DEFAULT_ENDPOINT = 'https://136325658.otel.gitlab-o11y.com:14318/v1/traces'
const ID_FILE = '.telemetry-instance-id'
const ACTIVE_FILE = '.telemetry-active.json'
const SERVICE_NAME = 'napgram'
const PROJECT_ID = '84583729'
const PROJECT_NAME = 'NapGram'
const MAX_ATTRIBUTE_LENGTH = 256

type Scalar = string | number | boolean
type ExceptionFilter = (error: unknown) => boolean
type ActiveWindow = { window: 'daily' | 'weekly' | 'monthly', bucket: string }

let provider: NodeTracerProvider | undefined
let initialized = false
let instanceId = ''
let exceptionFilter: ExceptionFilter = () => true

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value == null || value.trim() === '') return undefined
  return ['true', '1', 'yes'].includes(value.trim().toLowerCase())
}

function isEnabled(): boolean {
  return parseBoolean(process.env.TELEMETRY_ENABLED) ?? env.ERROR_REPORTING
}

function canonicalUuid(value: string | undefined): string | undefined {
  if (!value) return undefined
  const candidate = value.trim().toLowerCase()
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(candidate)
    ? candidate
    : undefined
}

function dataPath(name: string): string {
  return join(String(env.DATA_DIR || process.env.DATA_DIR || './data'), name)
}

function readUuidFile(path: string): string | undefined {
  try {
    return canonicalUuid(readFileSync(path, 'utf8'))
  }
  catch {
    return undefined
  }
}

export function resolveServiceInstanceId(): string {
  const override = canonicalUuid(process.env.OTEL_SERVICE_INSTANCE_ID)
  if (override) return override
  if (process.env.OTEL_SERVICE_INSTANCE_ID) {
    logger.warn('Ignoring invalid OTEL_SERVICE_INSTANCE_ID')
  }

  const path = dataPath(ID_FILE)
  const existing = readUuidFile(path)
  if (existing) return existing

  mkdirSync(dirname(path), { recursive: true })
  const generated = randomUUID()
  try {
    const descriptor = openSync(path, 'wx', 0o600)
    try {
      writeSync(descriptor, `${generated}\n`)
    }
    finally {
      closeSync(descriptor)
    }
    return generated
  }
  catch {
    const raced = readUuidFile(path)
    if (raced) return raced
    writeFileSync(path, `${generated}\n`, { encoding: 'utf8', mode: 0o600 })
    return generated
  }
}

function isoWeek(date: Date): { year: number, week: number } {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const day = utc.getUTCDay() || 7
  utc.setUTCDate(utc.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1))
  return {
    year: utc.getUTCFullYear(),
    week: Math.ceil((((utc.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7),
  }
}

export function activeWindows(now = new Date()): ActiveWindow[] {
  const year = now.getUTCFullYear()
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')
  const day = String(now.getUTCDate()).padStart(2, '0')
  const iso = isoWeek(now)
  return [
    { window: 'daily', bucket: `${year}-${month}-${day}` },
    { window: 'weekly', bucket: `${iso.year}-W${String(iso.week).padStart(2, '0')}` },
    { window: 'monthly', bucket: `${year}-${month}` },
  ]
}

function claimActiveWindows(now = new Date()): ActiveWindow[] {
  const path = dataPath(ACTIVE_FILE)
  let state: Record<string, string> = {}
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'))
    if (parsed && typeof parsed === 'object') state = parsed as Record<string, string>
  }
  catch {}

  const claimed = activeWindows(now).filter(item => state[item.window] !== item.bucket)
  if (claimed.length > 0) {
    claimed.forEach((item) => { state[item.window] = item.bucket })
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, `${JSON.stringify(state)}\n`, { encoding: 'utf8', mode: 0o600 })
  }
  return claimed
}

function scalarAttributes(extra?: Record<string, unknown>): Attributes {
  if (!extra) return {}
  const attributes: Attributes = {}
  for (const [key, value] of Object.entries(extra)) {
    if (!key || key.length > 64) continue
    if (typeof value === 'string') attributes[key] = value.slice(0, MAX_ATTRIBUTE_LENGTH)
    else if (typeof value === 'number' && Number.isFinite(value)) attributes[key] = value
    else if (typeof value === 'boolean') attributes[key] = value
  }
  return attributes
}

function emitSpan(
  name: string,
  attributes?: Record<string, unknown>,
  error?: unknown,
): void {
  const tracer = trace.getTracer('napgram.runtime', String((env as any).COMMIT || 'unknown'))
  const span = tracer.startSpan(name, { attributes: scalarAttributes(attributes) })
  if (error != null) {
    const normalized = error instanceof Error ? error : new Error(String(error))
    span.recordException(normalized)
    span.setStatus({ code: SpanStatusCode.ERROR, message: normalized.message.slice(0, MAX_ATTRIBUTE_LENGTH) })
  }
  else {
    span.setStatus({ code: SpanStatusCode.OK })
  }
  span.end()
}

function markActive(): void {
  claimActiveWindows().forEach(item => emitSpan('app.active', item))
}

export function initTelemetry(): void {
  if (!isEnabled() || initialized) return
  instanceId = resolveServiceInstanceId()
  const exporter = new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || DEFAULT_ENDPOINT,
  })
  provider = new NodeTracerProvider({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: SERVICE_NAME,
      [ATTR_SERVICE_INSTANCE_ID]: instanceId,
      [ATTR_SERVICE_VERSION]: String((env as any).COMMIT || 'unknown'),
      [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: process.env.NODE_ENV || 'production',
      'gitlab.project.id': PROJECT_ID,
      'gitlab.project.name': PROJECT_NAME,
      'git.repository': String((env as any).REPO || ''),
      'git.ref': String((env as any).REF || ''),
      'git.commit': String((env as any).COMMIT || ''),
    }),
    spanProcessors: [new BatchSpanProcessor(exporter)],
  })
  provider.register()
  initialized = true
  logger.info({ serviceInstanceId: instanceId }, 'OpenTelemetry initialized')
}

function ensureInitialized(): boolean {
  if (!isEnabled()) return false
  if (!initialized) initTelemetry()
  return initialized
}

export function setExceptionFilter(filter: ExceptionFilter): void {
  exceptionFilter = filter
}

export function event(name: string, attributes?: Record<string, Scalar>): void {
  if (!ensureInitialized()) return
  if (name !== 'app.active') markActive()
  emitSpan(name.trim() || 'app.event', attributes)
}

export function captureException(error: unknown, extra?: Record<string, unknown>): void {
  if (!ensureInitialized() || !exceptionFilter(error)) return
  markActive()
  emitSpan('app.exception', extra, error)
}

export function captureMessage(message: string, extra?: Record<string, unknown>): void {
  if (!ensureInitialized()) return
  markActive()
  emitSpan('app.message', { ...extra, message: message.slice(0, MAX_ATTRIBUTE_LENGTH) })
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | false> {
  return Promise.race([
    promise,
    new Promise<false>(resolve => setTimeout(() => resolve(false), timeoutMs)),
  ])
}

export async function flush(timeoutMs = 2000): Promise<boolean> {
  if (!provider) return true
  return await withTimeout(provider.forceFlush().then(() => true), timeoutMs) !== false
}

export async function shutdown(timeoutMs = 3000): Promise<boolean> {
  if (!provider) return true
  const result = await withTimeout(provider.shutdown().then(() => true), timeoutMs)
  provider = undefined
  initialized = false
  return result !== false
}

export const telemetry = {
  init: initTelemetry,
  event,
  captureException,
  captureMessage,
  setExceptionFilter,
  flush,
  shutdown,
}

export default telemetry
