import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'

const originalEnv = { ...Bun.env }

function restoreEnv() {
  for (const key of Object.keys(Bun.env)) {
    if (!(key in originalEnv)) delete Bun.env[key]
  }
  Object.assign(Bun.env, originalEnv)
}

describe('env failure', () => {
  beforeEach(() => {
    mock.restore()
    restoreEnv()
    Bun.env.NODE_ENV = 'development'
  })

  afterEach(() => {
    restoreEnv()
    mock.restore()
  })

  it('throws when environment validation fails', async () => {
    Bun.env.TG_API_ID = 'invalid-number'

    await expect(import(`../env.js?failure=${Date.now()}`)).rejects.toThrow()
  })
})
