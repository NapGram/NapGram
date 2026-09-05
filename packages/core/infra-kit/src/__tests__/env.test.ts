import { describe, expect, it } from 'bun:test'
import { env as envKit } from '@napgram/env-kit'
import infraEnv from '../env.js'

describe('infra-kit env compatibility facade', () => {
  it('re-exports the env-kit configuration object', () => {
    expect(infraEnv).toBe(envKit)
  })

  it('exposes the required test-mode configuration', () => {
    expect(infraEnv.TG_API_ID).toBeDefined()
    expect(infraEnv.TG_API_HASH).toBeDefined()
    expect(infraEnv.TG_BOT_TOKEN).toBeDefined()
    expect(infraEnv.LOG_LEVEL).toBe('info')
    expect(infraEnv.TG_CONNECTION).toBe('tcp')
  })

  it('exposes the configured defaults through the compatibility entry point', () => {
    expect(infraEnv.DATA_DIR).toBeDefined()
    expect(infraEnv.CACHE_DIR).toBeDefined()
    expect(infraEnv.LISTEN_PORT).toBe(8080)
    expect(infraEnv.REPO).toBe('Local Build')
    expect(infraEnv.REF).toBe('Local Build')
    expect(infraEnv.COMMIT).toBe('Local Build')
  })
})
