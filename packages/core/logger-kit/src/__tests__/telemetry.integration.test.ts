/// <reference types="bun-types" />
import { afterEach, describe, expect, it } from 'bun:test'

const joinPath = (...parts: string[]) => parts.filter(Boolean).join('/')
const tempDirectory = () => {
  const result = Bun.spawnSync(['mktemp', '-d', '-t', 'napgram-telemetry-XXXXXX'], { stdout: 'pipe' })
  return new TextDecoder().decode(result.stdout).trim()
}
const removePath = (path: string) => Bun.spawnSync(['rm', '-rf', path])

async function runBunScript(script: string, env: Record<string, string | undefined>) {
  const child = Bun.spawn(['bun', '--eval', script], { env, stdout: 'pipe', stderr: 'pipe' })
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    child.stdout.text(),
    child.stderr.text(),
  ])
  if (exitCode !== 0) throw new Error(stderr || `Bun child exited with ${exitCode}`)
  return stdout
}

function restoreEnv(originalEnv: Record<string, string | undefined>) {
  for (const key of Object.keys(Bun.env)) {
    if (!(key in originalEnv)) delete Bun.env[key]
  }
  Object.assign(Bun.env, originalEnv)
}

describe('telemetry OTLP integration', () => {
  const originalEnv = { ...Bun.env }
  let dataDir = ''

  afterEach(() => {
    restoreEnv(originalEnv)
    if (dataDir) removePath(dataDir)
  })

  it('exports resource, active, event, and exception spans to an HTTP collector', async () => {
    const requests: Array<{ body: Uint8Array, contentType: string | undefined }> = []
    const server = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      async fetch(request) {
        requests.push({
          body: new Uint8Array(await request.arrayBuffer()),
          contentType: request.headers.get('content-type') ?? undefined,
        })
        return new Response(null, { status: 200 })
      },
    })

    try {
      dataDir = tempDirectory()
      Bun.env.DATA_DIR = dataDir
      Bun.env.ERROR_REPORTING = '1'
      Bun.env.LOG_FILE = joinPath(dataDir, 'app.log')
      Bun.env.LOG_FILE_LEVEL = 'off'
      Bun.env.LOG_LEVEL = 'off'
      Bun.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT = `http://127.0.0.1:${server.port}/v1/traces`
      Bun.env.TELEMETRY_ENABLED = 'true'

      const { telemetry } = await import('../telemetry.js')
      telemetry.event('integration.event', { stage: 'collector-test' })
      telemetry.captureException(new Error('integration failure'), { stage: 'collector-test' })

      await expect(telemetry.flush(5_000)).resolves.toBe(true)
      await expect(telemetry.shutdown(5_000)).resolves.toBe(true)

      expect(requests).not.toHaveLength(0)
      expect(requests.every(request => request.contentType === 'application/json')).toBe(true)

      const payloads = requests.map(request => JSON.parse(new TextDecoder().decode(request.body)))
      const resourceSpans = payloads.flatMap(payload => payload.resourceSpans ?? [])
      const spans = resourceSpans.flatMap(resource =>
        (resource.scopeSpans ?? []).flatMap((scope: any) => scope.spans ?? []),
      )
      const instanceId = (await Bun.file(joinPath(dataDir, '.telemetry-instance-id')).text()).trim()
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
      server.stop()
    }
  }, 15_000)

  it('returns one UUID when multiple processes initialize the same data directory', async () => {
    dataDir = tempDirectory()
    const telemetryUrl = new URL('../telemetry.ts', import.meta.url).href
    const script = `
      import(${JSON.stringify(telemetryUrl)}).then(({ resolveServiceInstanceId }) => {
        Bun.stdout.write(resolveServiceInstanceId());
      });
    `
    const childEnv = {
      ...Bun.env,
      DATA_DIR: dataDir,
      ERROR_REPORTING: '1',
      LOG_FILE: joinPath(dataDir, 'app.log'),
      LOG_FILE_LEVEL: 'off',
      LOG_LEVEL: 'off',
      NODE_ENV: 'test',
    }

    const results = await Promise.all(Array.from({ length: 6 }, () => runBunScript(script, childEnv)))
    const ids = results.map(result => result.trim())

    expect([...new Set(ids)]).toHaveLength(1)
    expect(ids[0]).toMatch(/^[0-9a-f-]{36}$/)
    expect((await Bun.file(joinPath(dataDir, '.telemetry-instance-id')).text()).trim()).toBe(ids[0])
  }, 15_000)
})
