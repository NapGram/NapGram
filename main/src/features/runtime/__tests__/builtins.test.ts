import { describe, expect, it } from 'vitest'
import { coreFeatureBuiltins } from '../builtins.js'

describe('builtins', () => {
  it('should have valid load functions for all core features', async () => {
    for (const builtin of coreFeatureBuiltins) {
      if (builtin.load) {
        const promise = builtin.load()
        expect(promise).toBeInstanceOf(Promise)
        await promise
      }
    }
  }, 10000)
})
