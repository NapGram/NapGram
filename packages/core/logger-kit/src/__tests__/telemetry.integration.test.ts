import { execFile } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)

describe('telemetry OTLP integration', () => {
  const originalEnv = { ...process.env }
  let dataDir = ''

  afterEach(() => {
    process.env = { ...originalEnv }
    if (dataDir) rmSync(dataDir, { force: true, recursive: true })
  })

  it('exports resource, active, event, and exception spans to an HTTP collector', async () => {
    const requests: Array<{ body: Buffer, contentType: string | undefined }> = []
    const server = createServer((request, response) => {
      const chunks: Buffer[] = []
      request.on('data', chunk => chunks.push(Buffer.from(chunk)))
      request.on('end', () => {
        requests.push({
          body: Buffer.concat(chunks),
          contentType: request.headers['content-type'],
        })
        response.writeHead(200)
        response.end()
      })
    })
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })

    try {
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('Collector did not bind to a TCP port')

      dataDir = mkdtempSync(join(tmpdir(), 'napgram-otlp-integration-'))
      process.env.DATA_DIR = dataDir
      process.env.ERROR_REPORTING = '1'
      process.env.LOG_FILE = join(dataDir, 'app.log')
      process.env.LOG_FILE_LEVEL = 'off'
      process.env.LOG_LEVEL = 'off'
      process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT = `http://127.0.0.1:${address.port}/v1/traces`
      process.env.TELEMETRY_ENABLED = 'true'

      const { telemetry } = await import('../telemetry.js')
      telemetry.event('integration.event', { stage: 'collector-test' })
      telemetry.captureException(new Error('integration failure'), { stage: 'collector-test' })

      await expect(telemetry.flush(5_000)).resolves.toBe(true)
      await expect(telemetry.shutdown(5_000)).resolves.toBe(true)

      expect(requests).not.toHaveLength(0)
      expect(requests.every(request => request.contentType === 'application/json')).toBe(true)

      const payloads = requests.map(request => JSON.parse(request.body.toString('utf8')))
      const resourceSpans = payloads.flatMap(payload => payload.resourceSpans ?? [])
      const spans = resourceSpans.flatMap(resource =>
        (resource.scopeSpans ?? []).flatMap((scope: any) => scope.spans ?? []),
      )
      const instanceId = readFileSync(join(dataDir, '.telemetry-instance-id'), 'utf8').trim()
      const resourceAttributes = resourceSpans.flatMap(resource => resource.resource?.attributes ?? [])
      expect(resourceAttributes).toContainEqual({
        key: 'service.instance.id',
        value: { stringValue: instanceId },
      })
      expect(spans.filter((span: any) => span.name === 'app.active')).toHaveLength(3)
      expect(spans.map((span: any) => span.name)).toEqual(expect.arrayContaining([
        'integration.event',
        'app.exception',
      ]))

      const serialized = JSON.stringify(payloads)
      for (const value of ['daily', 'weekly', 'monthly', 'collector-test', 'integration failure']) {
        expect(serialized).toContain(value)
      }
    }
    finally {
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  }, 15_000)

  it('returns one UUID when multiple processes initialize the same data directory', async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'napgram-uuid-race-'))
    const telemetryUrl = new URL('../telemetry.ts', import.meta.url).href
    const script = `
      import(${JSON.stringify(telemetryUrl)}).then(({ resolveServiceInstanceId }) => {
        process.stdout.write(resolveServiceInstanceId());
      });
    `
    const childEnv = {
      ...process.env,
      DATA_DIR: dataDir,
      ERROR_REPORTING: '1',
      LOG_FILE: join(dataDir, 'app.log'),
      LOG_FILE_LEVEL: 'off',
      LOG_LEVEL: 'off',
      NODE_ENV: 'test',
    }

    const results = await Promise.all(Array.from({ length: 6 }, () =>
      execFileAsync('bun', ['--eval', script], {
        env: childEnv,
      }),
    ))
    const ids = results.map(result => result.stdout.trim())

    expect([...new Set(ids)]).toHaveLength(1)
    expect(ids[0]).toMatch(/^[0-9a-f-]{36}$/)
    expect(readFileSync(join(dataDir, '.telemetry-instance-id'), 'utf8').trim()).toBe(ids[0])
  }, 15_000)
})
