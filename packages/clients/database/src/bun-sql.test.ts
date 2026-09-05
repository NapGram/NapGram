import { describe, expect, test } from 'bun:test'
import { createBunSqlDrizzle, isBunSqlAvailable } from './bun-sql.js'
import * as schema from './schema/main.js'

describe('Drizzle Bun SQL adapter spike', () => {
  test('detects the Bun SQL runtime', () => {
    expect(isBunSqlAvailable()).toBe(true)
  })

  test('constructs a Drizzle Bun SQL database without connecting', async () => {
    const db = await createBunSqlDrizzle('postgresql://postgres:password@localhost:5432/napgram', schema)
    expect(typeof db.select).toBe('function')
    expect(db.$client).toBeDefined()
  })
})
