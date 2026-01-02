import { describe, expect, it, vi } from 'vitest'
import * as message from '../index'

vi.mock('@napgram/infra-kit', () => ({
  env: { DATA_DIR: '/tmp', CACHE_DIR: '/tmp/cache' },
  getLogger: vi.fn(() => ({ debug: vi.fn(), info: vi.fn() })),
  temp: { TEMP_PATH: '/tmp/napgram', file: vi.fn(), createTempFile: vi.fn() },
  hashing: { md5Hex: vi.fn((s) => 'hashed-' + s) },
  sentry: { captureException: vi.fn() },
  ForwardMap: { load: vi.fn().mockResolvedValue({ map: true }) },
  qface: { 14: '/微笑' },
}))

describe('message index', () => {
  it('re-exports converter API', () => {
    expect(typeof message.MessageConverter).toBe('function')
    expect(message.messageConverter).toBeTruthy()
    expect((message as any).__coverage_anchor__).toBe(true)
  })
})
