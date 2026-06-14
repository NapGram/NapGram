import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import random from '../random'

describe('random utility', () => {
  describe('int()', () => {
    it('returns a value within the specified range', () => {
      const min = 5
      const max = 10
      for (let i = 0; i < 100; i++) {
        const result = random.int(min, max)
        expect(result).toBeGreaterThanOrEqual(min)
        expect(result).toBeLessThanOrEqual(max)
      }
    })

    it('returns the only possible value when min equals max', () => {
      expect(random.int(7, 7)).toBe(7)
    })

    it('handles negative ranges', () => {
      for (let i = 0; i < 50; i++) {
        const result = random.int(-10, -5)
        expect(result).toBeGreaterThanOrEqual(-10)
        expect(result).toBeLessThanOrEqual(-5)
      }
    })

    it('returns an integer value', () => {
      for (let i = 0; i < 50; i++) {
        const result = random.int(0, 100)
        expect(Number.isInteger(result)).toBe(true)
      }
    })
  })

  describe('pick()', () => {
    it('returns an element from the provided arguments', () => {
      const items = ['a', 'b', 'c', 'd', 'e']
      for (let i = 0; i < 50; i++) {
        const result = random.pick(...items)
        expect(items).toContain(result)
      }
    })

    it('returns the only element when given a single item', () => {
      expect(random.pick('only')).toBe('only')
    })

    it('works with numeric values', () => {
      const nums = [1, 2, 3]
      const result = random.pick(...nums)
      expect(nums).toContain(result)
    })
  })

  describe('fakeUuid()', () => {
    it('matches UUID v4 format (8-4-4-4-12 hex pattern)', () => {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      for (let i = 0; i < 20; i++) {
        const result = random.fakeUuid()
        expect(result).toMatch(uuidRegex)
      }
    })

    it('produces different values on successive calls', () => {
      const results = new Set(Array.from({ length: 10 }, () => random.fakeUuid()))
      expect(results.size).toBeGreaterThan(1)
    })
  })

  describe('imei()', () => {
    it('produces a 15-digit string', () => {
      for (let i = 0; i < 20; i++) {
        const result = random.imei()
        expect(result).toMatch(/^\d{15}$/)
      }
    })

    it('starts with either 86 or 35', () => {
      const prefixes = new Set<string>()
      for (let i = 0; i < 100; i++) {
        prefixes.add(random.imei().substring(0, 2))
      }
      for (const prefix of prefixes) {
        expect(['86', '35']).toContain(prefix)
      }
    })

    it('passes Luhn checksum validation', () => {
      function luhnCheck(imei: string): boolean {
        let sum = 0
        for (let i = 0; i < imei.length; i++) {
          let digit = Number.parseInt(imei[i])
          if (i % 2 === 1) {
            digit *= 2
            if (digit > 9)
              digit -= 9
          }
          sum += digit
        }
        return sum % 10 === 0
      }

      for (let i = 0; i < 50; i++) {
        const result = random.imei()
        expect(luhnCheck(result)).toBe(true)
      }
    })
  })
})

/**
 * Property-based tests for random utility
 * **Validates: Requirements 6.2, 7.1**
 */
describe('random property-based tests', () => {
  it('property 1: Random Range Containment - random.int(min, max) always produces min <= v <= max', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1000000, max: 1000000 }).chain(min =>
          fc.integer({ min, max: min + 2000000 }).map(max => ({ min, max })),
        ),
        ({ min, max }) => {
          const result = random.int(min, max)
          expect(result).toBeGreaterThanOrEqual(min)
          expect(result).toBeLessThanOrEqual(max)
          expect(Number.isInteger(result)).toBe(true)
        },
      ),
      { numRuns: 200 },
    )
  })
})
