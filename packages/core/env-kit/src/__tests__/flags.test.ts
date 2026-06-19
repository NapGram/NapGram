import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

describe('flags', () => {
  it('should export all flag values as powers of 2', async () => {
    const flags = (await import('../flags.js')).default

    const expectedFlags = [
      ['DISABLE_FORWARD', 1],
      ['DISABLE_TG2Q', 2],
      ['DISABLE_JOIN_NOTICE', 4],
      ['DISABLE_POKE', 8],
      ['DISABLE_DELETE_MESSAGE', 16],
      ['DISABLE_AUTO_CREATE_PM', 32],
      ['COLOR_EMOJI_PREFIX', 64],
      ['DISABLE_QUOTE_PIN', 256],
      ['DISABLE_FORWARD_OTHER_BOT', 512],
      ['DISABLE_SEAMLESS', 2048],
      ['DISABLE_FLASH_PIC', 4096],
      ['DISABLE_SLASH_COMMAND', 8192],
      ['DISABLE_RICH_HEADER', 16384],
      ['DISABLE_OFFLINE_NOTICE', 32768],
      ['HIDE_ALL_QQ_NUMBER', 65536],
      ['NAME_LOCKED', 131072],
      ['ALWAYS_FORWARD_TG_FILE', 262144],
      ['QQ_HEADER_IMAGE', 524288],
      ['DISABLE_ERROR_NOTIFY', 1048576],
    ]

    for (const [name, value] of expectedFlags) {
      expect(flags[name as keyof typeof flags]).toBe(value)
    }
  })

  it('should have unique values for all flags', async () => {
    const flags = (await import('../flags.js')).default
    const values = Object.values(flags) as number[]
    const uniqueValues = new Set(values)
    expect(uniqueValues.size).toBe(values.length)
  })

  it('should support bitmask operations', async () => {
    const flags = (await import('../flags.js')).default

    // Combine multiple flags
    const combined = flags.DISABLE_FORWARD | flags.DISABLE_TG2Q | flags.DISABLE_POKE
    expect(combined & flags.DISABLE_FORWARD).toBeTruthy()
    expect(combined & flags.DISABLE_TG2Q).toBeTruthy()
    expect(combined & flags.DISABLE_POKE).toBeTruthy()
    expect(combined & flags.DISABLE_JOIN_NOTICE).toBeFalsy()
  })
})
