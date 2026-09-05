import { afterAll, beforeAll, describe, expect, it } from 'bun:test'

const bunRuntime = (globalThis as typeof globalThis & {
  Bun: { env: Record<string, string | undefined> }
}).Bun
const originalEnv = { ...bunRuntime.env }
const envKeysToReset = [
  'DATA_DIR', 'CACHE_DIR', 'DATABASE_URL', 'LOG_LEVEL', 'LOG_FILE_LEVEL', 'LOG_FILE',
  'LOG_RETENTION_DAYS', 'OICQ_LOG_LEVEL', 'TG_LOG_LEVEL', 'FFMPEG_PATH', 'FFPROBE_PATH',
  'NAPCAT_WS_URL', 'NAPCAT_WS_TOKEN', 'SIGN_API', 'SIGN_VER', 'TG_API_ID', 'TG_API_HASH',
  'TG_BOT_TOKEN', 'TG_CONNECTION', 'TG_INITIAL_DCID', 'TG_INITIAL_SERVER', 'TG_USE_TEST_DC',
  'TG_MEDIA_TTL_SECONDS', 'IPV6', 'ADMIN_QQ', 'ADMIN_TG', 'PROXY_IP', 'PROXY_PORT',
  'PROXY_USERNAME', 'PROXY_PASSWORD', 'TGS_TO_GIF', 'DISABLE_FILE_UPLOAD_TIP', 'IMAGE_SUMMARY',
  'ENABLE_FEATURE_MANAGER', 'LISTEN_PORT', 'ADMIN_TOKEN', 'UI_PATH', 'UI_PROXY', 'WEB_ENDPOINT',
  'RICH_HEADER_VERSION', 'INTERNAL_WEB_ENDPOINT', 'ERROR_REPORTING', 'SHOW_NICKNAME_MODE',
  'FORWARD_MODE', 'COMMAND_REPLY_BOTH_SIDES', 'ENABLE_AUTO_RECALL', 'ENABLE_OFFLINE_NOTIFICATION',
  'OFFLINE_NOTIFICATION_COOLDOWN', 'REPO', 'REF', 'COMMIT',
]

beforeAll(() => {
  bunRuntime.env.NODE_ENV = 'test'
  for (const key of envKeysToReset) delete bunRuntime.env[key]
})

afterAll(() => {
  for (const key of Object.keys(bunRuntime.env)) delete bunRuntime.env[key]
  Object.assign(bunRuntime.env, originalEnv)
})

describe('env', () => {
  it('should export parsed environment config in test mode', async () => {
    const env = (await import('../env.js')).default

    expect(env.TG_API_ID).toBeDefined()
    expect(env.TG_API_HASH).toBeDefined()
    expect(env.TG_BOT_TOKEN).toBeDefined()
    expect(env.LOG_LEVEL).toBe('info')
    expect(env.TG_CONNECTION).toBe('tcp')
  })

  it('should have correct default values', async () => {
    const env = (await import('../env.js')).default

    expect(env.LOG_FILE_LEVEL).toBe('debug')
    expect(env.TG_USE_TEST_DC).toBe(false)
    expect(env.IPV6).toBe(false)
    expect(env.LISTEN_PORT).toBe(8080)
    expect(env.ERROR_REPORTING).toBe(true)
    expect(env.COMMAND_REPLY_BOTH_SIDES).toBe(false)
    expect(env.ENABLE_AUTO_RECALL).toBe(true)
  })

  it('should handle emptyStringToUndefined preprocessing', async () => {
    const env = (await import('../env.js')).default

    // These fields use emptyStringToUndefined and should be undefined if not set
    expect(env.PROXY_IP).toBeUndefined()
    expect(env.ADMIN_TOKEN).toBeUndefined()
    expect(env.FFMPEG_PATH).toBeUndefined()
    expect(env.NAPCAT_WS_URL).toBeUndefined()
  })

  it('should transform boolean strings correctly', async () => {
    const env = (await import('../env.js')).default

    // TG_USE_TEST_DC defaults to 'false' which transforms to false
    expect(typeof env.TG_USE_TEST_DC).toBe('boolean')
    expect(typeof env.IPV6).toBe('boolean')
    expect(typeof env.ERROR_REPORTING).toBe('boolean')
    expect(typeof env.COMMAND_REPLY_BOTH_SIDES).toBe('boolean')
    expect(typeof env.ENABLE_AUTO_RECALL).toBe('boolean')
  })

  it('should transform numeric strings correctly', async () => {
    const env = (await import('../env.js')).default

    expect(typeof env.LOG_RETENTION_DAYS).toBe('number')
    expect(typeof env.LISTEN_PORT).toBe('number')
    expect(typeof env.OFFLINE_NOTIFICATION_COOLDOWN).toBe('number')
    expect(typeof env.TG_API_ID).toBe('number')
  })

  it('should validate required fields exist', async () => {
    const env = (await import('../env.js')).default

    // These are required and should be defined
    expect(env.TG_API_ID).toBeDefined()
    expect(env.TG_API_HASH).toBeDefined()
    expect(env.TG_BOT_TOKEN).toBeDefined()
  })

  it('should validate enum fields', async () => {
    const env = (await import('../env.js')).default

    const validLogLevels = ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'mark', 'off']
    expect(validLogLevels).toContain(env.LOG_LEVEL)
    expect(validLogLevels).toContain(env.LOG_FILE_LEVEL)

    const validTgConnections = ['websocket', 'tcp']
    expect(validTgConnections).toContain(env.TG_CONNECTION)
  })

  it('should validate SHOW_NICKNAME_MODE format', async () => {
    const env = (await import('../env.js')).default

    expect(env.SHOW_NICKNAME_MODE).toMatch(/^[01]{2}$/)
    expect(env.FORWARD_MODE).toMatch(/^[01]{2}$/)
  })

  it('should have REPO, REF, COMMIT defaults', async () => {
    const env = (await import('../env.js')).default

    expect(env.REPO).toBeDefined()
    expect(env.REF).toBeDefined()
    expect(env.COMMIT).toBeDefined()
  })
})
