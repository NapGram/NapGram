import { drizzle } from 'drizzle-orm/bun-sql'
import * as schema from './schema/main.js'

const bunEnv = (globalThis as typeof globalThis & { Bun: { env: Record<string, string | undefined> } }).Bun.env
const connectionString = bunEnv.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/napgram'

export const db = drizzle(connectionString, { schema })
export const drizzleDb = db

// Export schema for easy access
export { schema }
