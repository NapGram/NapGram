import { describe, expect, it, vi, beforeEach } from 'vitest'

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
