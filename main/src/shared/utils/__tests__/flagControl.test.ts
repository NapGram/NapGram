import type { Flagged } from '../flagControl'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { editFlags } from '../flagControl'

describe('flagControl', () => {
  describe('displayFlag (via editFlags with empty params)', () => {
    it('displays 0b0 and no flag names when flags is 0', async () => {
      // Arrange
      const target: Flagged = { flags: 0 }

      // Act
      const result = await editFlags([], target)

      // Assert
      expect(result).toBe('0b0')
    })

    it('displays a single flag name when one bit is set', async () => {
      // Arrange
      const target: Flagged = { flags: 1 } // DISABLE_FORWARD

      // Act
      const result = await editFlags([], target)

      // Assert
      expect(result).toContain('0b1')
      expect(result).toContain('DISABLE_FORWARD')
    })

    it('displays multiple flag names when multiple bits are set', async () => {
      // Arrange
      const target: Flagged = { flags: 0b111 } // DISABLE_FORWARD | DISABLE_TG2Q | DISABLE_JOIN_NOTICE

      // Act
      const result = await editFlags([], target)

      // Assert
      expect(result).toContain('0b111')
      expect(result).toContain('DISABLE_FORWARD')
      expect(result).toContain('DISABLE_TG2Q')
      expect(result).toContain('DISABLE_JOIN_NOTICE')
    })

    it('displays binary representation for large flag values', async () => {
      // Arrange
      const target: Flagged = { flags: 64 } // COLOR_EMOJI_PREFIX = 64 = 0b1000000

      // Act
      const result = await editFlags([], target)

      // Assert
      expect(result).toContain('0b1000000')
      expect(result).toContain('COLOR_EMOJI_PREFIX')
    })
  })

  describe('editFlags — add/set command', () => {
    it('adds a flag using numeric value', async () => {
      // Arrange
      const target: Flagged = { flags: 0b001 }

      // Act
      await editFlags(['add', '2'], target)

      // Assert
      expect(target.flags).toBe(0b011)
    })

    it('adds a flag using "set" alias', async () => {
      // Arrange
      const target: Flagged = { flags: 0 }

      // Act
      await editFlags(['set', '4'], target)

      // Assert
      expect(target.flags).toBe(4)
    })

    it('adds a flag using flag name (case-insensitive)', async () => {
      // Arrange
      const target: Flagged = { flags: 0 }

      // Act
      await editFlags(['add', 'disable_forward'], target)

      // Assert
      expect(target.flags).toBe(1)
    })

    it('is idempotent — adding an already-set flag does not change value', async () => {
      // Arrange
      const target: Flagged = { flags: 0b011 }

      // Act
      await editFlags(['add', '2'], target)

      // Assert
      expect(target.flags).toBe(0b011)
    })
  })

  describe('editFlags — rm/remove/del/delete command', () => {
    it('removes a flag using "rm"', async () => {
      // Arrange
      const target: Flagged = { flags: 0b111 }

      // Act
      await editFlags(['rm', '4'], target)

      // Assert
      expect(target.flags).toBe(0b011)
    })

    it('removes a flag using "remove" alias', async () => {
      // Arrange
      const target: Flagged = { flags: 0b111 }

      // Act
      await editFlags(['remove', '2'], target)

      // Assert
      expect(target.flags).toBe(0b101)
    })

    it('removes a flag using "del" alias', async () => {
      // Arrange
      const target: Flagged = { flags: 0b111 }

      // Act
      await editFlags(['del', '1'], target)

      // Assert
      expect(target.flags).toBe(0b110)
    })

    it('removes a flag using "delete" alias', async () => {
      // Arrange
      const target: Flagged = { flags: 0b111 }

      // Act
      await editFlags(['delete', '4'], target)

      // Assert
      expect(target.flags).toBe(0b011)
    })

    it('removing a flag that is not set does not change value', async () => {
      // Arrange
      const target: Flagged = { flags: 0b001 }

      // Act
      await editFlags(['rm', '4'], target)

      // Assert
      expect(target.flags).toBe(0b001)
    })
  })

  describe('editFlags — put command', () => {
    it('replaces flags entirely with the given value', async () => {
      // Arrange
      const target: Flagged = { flags: 0b111 }

      // Act
      await editFlags(['put', '16'], target)

      // Assert
      expect(target.flags).toBe(16)
    })

    it('can set flags to 0 using put', async () => {
      // Arrange
      const target: Flagged = { flags: 0b111 }

      // Act
      await editFlags(['put', '0'], target)

      // Assert
      expect(target.flags).toBe(0)
    })
  })

  describe('editFlags — error handling', () => {
    it('returns error for wrong param count (1 param)', async () => {
      // Arrange
      const target: Flagged = { flags: 0 }

      // Act
      const result = await editFlags(['add'], target)

      // Assert
      expect(result).toBe('参数格式错误')
    })

    it('returns error for wrong param count (3 params)', async () => {
      // Arrange
      const target: Flagged = { flags: 0 }

      // Act
      const result = await editFlags(['add', '1', 'extra'], target)

      // Assert
      expect(result).toBe('参数格式错误')
    })

    it('returns error for invalid numeric value (NaN)', async () => {
      // Arrange
      const target: Flagged = { flags: 0 }

      // Act
      const result = await editFlags(['add', 'not_a_flag_name'], target)

      // Assert
      expect(result).toBe('flag 格式错误')
    })

    it('does not modify target when param count is wrong', async () => {
      // Arrange
      const target: Flagged = { flags: 5 }

      // Act
      await editFlags(['add'], target)

      // Assert
      expect(target.flags).toBe(5)
    })

    it('does not modify target when flag value is invalid', async () => {
      // Arrange
      const target: Flagged = { flags: 5 }

      // Act
      await editFlags(['add', 'invalid_name'], target)

      // Assert
      expect(target.flags).toBe(5)
    })
  })

  describe('editFlags — unknown command', () => {
    it('does not modify flags for an unknown command', async () => {
      // Arrange
      const target: Flagged = { flags: 0b101 }

      // Act
      await editFlags(['unknown', '2'], target)

      // Assert
      expect(target.flags).toBe(0b101)
    })
  })
})

/**
 * Property-Based Tests for flagControl
 * **Validates: Requirements 7.3**
 */
describe('flagControl — Property-Based Tests', () => {
  it('property 4: adding then removing a flag restores the original value', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 0x7FFFFFFF }),
        fc.integer({ min: 0, max: 30 }),
        async (initialFlags, bitPosition) => {
          const bit = 1 << bitPosition
          // Ensure the bit is NOT already set so the round-trip is meaningful
          const flags = initialFlags & ~bit
          const bitValue = bit.toString()
          const target: Flagged = { flags }

          // Add the flag
          await editFlags(['add', bitValue], target)
          // The bit should now be set
          expect(target.flags & bit).toBe(bit)
          // Remove the flag
          await editFlags(['rm', bitValue], target)

          // The flags should be restored to the original value
          expect(target.flags).toBe(flags)
        },
      ),
      { numRuns: 200 },
    )
  })
})
