import { SpanStatusCode, trace, type Attributes } from '@opentelemetry/api'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { BasicTracerProvider, BatchSpanProcessor } from '@opentelemetry/sdk-trace-base/build/src/index-shim.js'
import {
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
  ATTR_SERVICE_INSTANCE_ID,
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions'
import { env } from '@napgram/env-kit'
import getLogger from './logger.js'

interface BunTelemetryRuntime {
  env: Record<string, string | undefined>
  spawnSync(command: string[], options?: { stdin?: string | Uint8Array, stdout?: 'pipe', stderr?: 'pipe' }): {
    exitCode: number
    stdout?: Uint8Array
  }
}

const bunRuntime = (globalThis as typeof globalThis & { Bun: BunTelemetryRuntime }).Bun
const decoder = new TextDecoder()

function runBun(command: string[], options?: { stdin?: string | Uint8Array, stdout?: 'pipe', stderr?: 'pipe' }) {
  return bunRuntime.spawnSync(command, options)
}

const pathUtils = {
  dirname(filePath: string) {
    const index = filePath.lastIndexOf('/')
    return index > 0 ? filePath.slice(0, index) : '.'
  },
  join(...parts: string[]) {
    return parts.filter(Boolean).join('/')
  },
}

function readText(filePath: string): string {
  const result = runBun(['cat', filePath], { stdout: 'pipe' })
  if (result.exitCode !== 0) throw new Error(`Failed to read file: ${filePath}`)
  return decoder.decode(result.stdout ?? new Uint8Array())
}

function writeText(filePath: string, content: string): void {
  const result = runBun(['tee', filePath], { stdin: new TextEncoder().encode(content), stdout: 'pipe' })
  if (result.exitCode !== 0) throw new Error(`Failed to write file: ${filePath}`)
  const chmod = runBun(['chmod', '600', filePath])
  if (chmod.exitCode !== 0) throw new Error(`Failed to secure file: ${filePath}`)
}

function ensureDirectory(directory: string): void {
  const result = runBun(['mkdir', '-p', directory])
  if (result.exitCode !== 0) throw new Error(`Failed to create directory: ${directory}`)
}

function removePath(filePath: string): void {
  runBun(['rm', '-f', filePath])
}

function acquireDirectoryLock(lockPath: string): boolean {
  return runBun(['mkdir', lockPath]).exitCode === 0
}

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

let provider: BasicTracerProvider | undefined
let initialized = false
let instanceId = ''
let exceptionFilter: ExceptionFilter = () => true

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value == null || value.trim() === '') return undefined
  return ['true', '1', 'yes'].includes(value.trim().toLowerCase())
}

function isEnabled(): boolean {
  return parseBoolean(bunRuntime.env.TELEMETRY_ENABLED) ?? env.ERROR_REPORTING
}

function canonicalUuid(value: string | undefined): string | undefined {
  if (!value) return undefined
  const candidate = value.trim().toLowerCase()
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(candidate)
    ? candidate
    : undefined
}

function dataPath(name: string): string {
  return pathUtils.join(String(env.DATA_DIR || bunRuntime.env.DATA_DIR || './data'), name)
}

function readUuidFile(path: string): string | undefined {
  try {
    return canonicalUuid(readText(path))
  }
  catch {
    return undefined
  }
}

function waitForUuidFile(path: string): string | undefined {
  const waitBuffer = new Int32Array(new SharedArrayBuffer(4))
  for (let attempt = 0; attempt < 100; attempt++) {
    const raced = readUuidFile(path)
    if (raced) return raced
    if (attempt < 99) Atomics.wait(waitBuffer, 0, 0, 1)
  }
  return undefined
}

export function resolveServiceInstanceId(): string {
  const override = canonicalUuid(bunRuntime.env.OTEL_SERVICE_INSTANCE_ID)
  if (override) return override
  if (bunRuntime.env.OTEL_SERVICE_INSTANCE_ID) {
    logger.warn('Ignoring invalid OTEL_SERVICE_INSTANCE_ID')
  }

  const path = dataPath(ID_FILE)
  const existing = readUuidFile(path)
  if (existing) return existing

  ensureDirectory(pathUtils.dirname(path))
  const generated = crypto.randomUUID()
  const lockPath = `${path}.lock`
  for (let attempt = 0; attempt < 100; attempt++) {
    if (acquireDirectoryLock(lockPath)) {
      try {
        const lockedExisting = readUuidFile(path)
        if (lockedExisting) return lockedExisting
        writeText(path, `${generated}\n`)
        return generated
      }
      finally {
        removePath(lockPath)
      }
    }
    const raced = readUuidFile(path)
    if (raced) return raced
    if (attempt < 99) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1)
  }
  throw new Error(`Unable to acquire telemetry instance lock: ${lockPath}`)
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
    const parsed = JSON.parse(readText(path))
    if (parsed && typeof parsed === 'object') state = parsed as Record<string, string>
  }
  catch {}

  const claimed = activeWindows(now).filter(item => state[item.window] !== item.bucket)
  if (claimed.length > 0) {
    claimed.forEach((item) => { state[item.window] = item.bucket })
    ensureDirectory(pathUtils.dirname(path))
    writeText(path, `${JSON.stringify(state)}\n`)
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
    url: bunRuntime.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || DEFAULT_ENDPOINT,
  })
  provider = new BasicTracerProvider({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: SERVICE_NAME,
      [ATTR_SERVICE_INSTANCE_ID]: instanceId,
      [ATTR_SERVICE_VERSION]: String((env as any).COMMIT || 'unknown'),
      [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: bunRuntime.env.NODE_ENV || 'production',
      'gitlab.project.id': PROJECT_ID,
      'gitlab.project.name': PROJECT_NAME,
      'git.repository': String((env as any).REPO || ''),
      'git.ref': String((env as any).REF || ''),
      'git.commit': String((env as any).COMMIT || ''),
    }),
    spanProcessors: [new BatchSpanProcessor(exporter)],
  })
  trace.setGlobalTracerProvider(provider)
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
