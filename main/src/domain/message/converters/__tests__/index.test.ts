import { describe, it, expect } from 'vitest'
import * as converters from '../index'

describe('converters index', () => {
    it('should export modules', () => {
        expect(converters).toBeDefined()
    })
})
