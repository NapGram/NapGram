/// <reference types="bun-types" />
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'

const joinPath = (...parts: string[]) => parts.filter(Boolean).join('/')
const tempDirectory = () => {
  const result = Bun.spawnSync(['mktemp', '-d', '-t', 'napgram-telemetry-XXXXXX'], { stdout: 'pipe' })
  return new TextDecoder().decode(result.stdout).trim()
}
const removePath = (path: string) => Bun.spawnSync(['rm', '-rf', path])

const mocks = (() => {
  const spans: Array<{ name: string, attributes?: Record<string, unknown>, error?: unknown }> = []
  const provider = {
    forceFlush: mock().mockResolvedValue(undefined),
    register: mock(),
    shutdown: mock().mockResolvedValue(undefined),
  }
  return {
    exporter: mock(),
    provider,
    providerConstructor: mock(function NodeTracerProvider() { return provider }),
    resourceFromAttributes: mock((attributes: Record<string, unknown>) => ({ attributes })),
    spans,
  }
})()

const envMock = (() => ({
  env: {
    COMMIT: 'abc123',
    DATA_DIR: '',
    ERROR_REPORTING: true,
    LOG_FILE: '/tmp/napgram-telemetry-test.log',
    LOG_FILE_LEVEL: 'off',
    LOG_LEVEL: 'off',
    LOG_RETENTION_DAYS: 0,
    REF: 'refs/heads/beta',
    REPO: 'magisk3171/NapGram',
  },
}))()

mock.module('@napgram/env-kit', () => envMock)
mock.module('@opentelemetry/exporter-trace-otlp-http', () => ({
  OTLPTraceExporter: mocks.exporter,
}))
mock.module('@opentelemetry/resources', () => ({
  resourceFromAttributes: mocks.resourceFromAttributes,
}))
mock.module('@opentelemetry/sdk-trace-base/build/src/index-shim.js', () => ({
  BasicTracerProvider: mocks.providerConstructor,
  BatchSpanProcessor: mock(),
}))
mock.module('@opentelemetry/api', () => ({
  SpanStatusCode: { ERROR: 2, OK: 1 },
  trace: {
    setGlobalTracerProvider: mock(),
    getTracer: () => ({
      startSpan: (name: string, options: { attributes?: Record<string, unknown> }) => {
        const entry = { name, attributes: options.attributes } as {
          name: string
          attributes?: Record<string, unknown>
          error?: unknown
        }
        mocks.spans.push(entry)
        return {
          end: mock(),
          recordException: (error: unknown) => { entry.error = error },
          setStatus: mock(),
        }
      },
    }),
  },
}))

describe('telemetry', () => {
  let dataDir: string

  beforeEach(() => {
    mock.restore()
    mock.clearAllMocks()
    mocks.spans.length = 0
    dataDir = tempDirectory()
    envMock.env.DATA_DIR = dataDir
    envMock.env.ERROR_REPORTING = true
    delete Bun.env.OTEL_SERVICE_INSTANCE_ID
    delete Bun.env.TELEMETRY_ENABLED
  })

  afterEach(() => {
    removePath(dataDir)
    delete Bun.env.OTEL_SERVICE_INSTANCE_ID
    delete Bun.env.TELEMETRY_ENABLED
  })

  it('creates and persists an installation UUID', async () => {
    const { resolveServiceInstanceId } = await import('../telemetry.js')
    const first = resolveServiceInstanceId()
    const second = resolveServiceInstanceId()

    expect(first).toMatch(/^[0-9a-f-]{36}$/)
    expect(second).toBe(first)
    expect((await Bun.file(joinPath(dataDir, '.telemetry-instance-id')).text()).trim()).toBe(first)
  })

  it('regenerates an invalid persisted UUID and honors a valid override', async () => {
    const path = joinPath(dataDir, '.telemetry-instance-id')
    await Bun.write(path, 'invalid\n')
    const { resolveServiceInstanceId } = await import('../telemetry.js')
    const regenerated = resolveServiceInstanceId()
    expect(regenerated).toMatch(/^[0-9a-f-]{36}$/)
    expect(regenerated).not.toBe('invalid')

    Bun.env.OTEL_SERVICE_INSTANCE_ID = '123e4567-e89b-42d3-a456-426614174000'
    expect(resolveServiceInstanceId()).toBe(Bun.env.OTEL_SERVICE_INSTANCE_ID)
  })

  it('uses UTC daily, ISO-weekly, and monthly buckets', async () => {
    const { activeWindows } = await import('../telemetry.js')
    expect(activeWindows(new Date('2027-01-01T00:30:00+08:00'))).toEqual([
      { window: 'daily', bucket: '2026-12-31' },
      { window: 'weekly', bucket: '2026-W53' },
      { window: 'monthly', bucket: '2026-12' },
    ])
  })

  it('initializes OTEL resources and emits active markers once per bucket', async () => {
    const { telemetry } = await import('../telemetry.js')
    telemetry.init()
    telemetry.event('push.forwarded', { channel: 'telegram' })
    telemetry.event('push.forwarded', { channel: 'telegram' })

    expect(mocks.resourceFromAttributes).toHaveBeenCalledWith(expect.objectContaining({
      'gitlab.project.id': '84583729',
      'service.instance.id': expect.stringMatching(/^[0-9a-f-]{36}$/),
      'service.name': 'napgram',
      'service.version': 'abc123',
    }))
    expect(mocks.spans.filter(span => span.name === 'app.active')).toHaveLength(3)
    expect(mocks.spans.filter(span => span.name === 'push.forwarded')).toHaveLength(2)
  })

  it('does nothing when telemetry is disabled', async () => {
    Bun.env.TELEMETRY_ENABLED = 'false'
    const { telemetry } = await import('../telemetry.js')
    telemetry.init()
    telemetry.captureMessage('ignored')

    expect(mocks.providerConstructor).not.toHaveBeenCalled()
    expect(mocks.spans).toHaveLength(0)
  })

  it('filters exceptions and flushes and shuts down the provider', async () => {
    const { telemetry } = await import('../telemetry.js')
    telemetry.setExceptionFilter(error => !(error instanceof Error && error.message === 'transient'))
    telemetry.captureException(new Error('transient'))
    telemetry.captureException(new Error('persistent'), { stage: 'test' })

    expect(mocks.spans.filter(span => span.name === 'app.exception')).toHaveLength(1)
    expect(mocks.spans.find(span => span.name === 'app.exception')?.error).toEqual(new Error('persistent'))
    await expect(telemetry.flush()).resolves.toBe(true)
    await expect(telemetry.shutdown()).resolves.toBe(true)
    expect(mocks.provider.forceFlush).toHaveBeenCalled()
    expect(mocks.provider.shutdown).toHaveBeenCalled()
  })
})
