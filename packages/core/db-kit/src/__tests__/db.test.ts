import { describe, expect, it, vi } from 'vitest'

describe('db', () => {
  it('should export database instance', async () => {
    const db = (await import('../db.js')).default
    expect(db).toBeDefined()
  })

  it('should export schema', async () => {
    const { schema } = await import('../db.js')
    expect(schema).toBeDefined()
  })

  it('should export drizzle-orm functions', async () => {
    const { eq, and, or, lt, lte, gt, gte, like, inArray, isNull, isNotNull, desc, sql, count } = await import('../db.js')

    expect(typeof eq).toBe('function')
    expect(typeof and).toBe('function')
    expect(typeof or).toBe('function')
    expect(typeof lt).toBe('function')
    expect(typeof lte).toBe('function')
    expect(typeof gt).toBe('function')
    expect(typeof gte).toBe('function')
    expect(typeof like).toBe('function')
    expect(typeof inArray).toBe('function')
    expect(typeof isNull).toBe('function')
    expect(typeof isNotNull).toBe('function')
    expect(typeof desc).toBe('function')
    expect(typeof sql).toBe('function')
    expect(typeof count).toBe('function')
  })
})
