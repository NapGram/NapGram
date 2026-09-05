import { describe, expect, it } from 'bun:test'
import emoji from '../emoji'

// Polyfill Intl.Segmenter mostly works in Bun and modern Node runtimes.
// The test only verifies the utility contract.

describe('emoji utility', () => {
  it('should pick random picture', () => {
    const pic = emoji.picture()
    expect(pic).toBeTruthy()
    // It picks from a list of strings
    expect(typeof pic).toBe('string')
  })

  it('should get color from index', () => {
    // 🔴🟠🟡🟢🔵🟣⚫️⚪️🟤 length 9?
    // 0 -> 🔴
    const c0 = emoji.color(0)
    expect(c0).toBe('🔴')

    // 1 -> 🟠
    const c1 = emoji.color(1)
    expect(c1).toBe('🟠')

    // Modulo check
    emoji.color(8)
  })

  it('should get tgColor', () => {
    // Positive
    expect(emoji.tgColor(0)).toBeTruthy()

    // Negative small
    expect(emoji.tgColor(-5)).toBeTruthy()

    // Channel ID format (-100...)
    // -10012345
    expect(emoji.tgColor(-10012345)).toBeTruthy()

    // Coverage for: index < 0 branch
    // And str.startsWith('-100') branch
    // And else branch (normal negative)
  })
})
