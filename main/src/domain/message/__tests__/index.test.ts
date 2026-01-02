import { describe, expect, it, vi } from 'vitest'
import * as message from '../index'

vi.mock('@napgram/infra-kit', () => ({
  env: { DATA_DIR: '/tmp', CACHE_DIR: '/tmp/cache' },
  getLogger: vi.fn(() => ({ debug: vi.fn(), info: vi.fn() })),
  temp: { TEMP_PATH: '/tmp/napgram', file: vi.fn(), createTempFile: vi.fn() },
}))

describe('message index', () => {
  it('re-exports converter API', () => {
    expect(typeof message.MessageConverter).toBe('function')
    expect(message.messageConverter).toBeTruthy()
  })
})
