export type BunSqlSchema = Record<string, unknown>

interface BunSqlRuntime {
  env: Record<string, string | undefined>
}

const bunRuntime = (globalThis as typeof globalThis & { Bun: BunSqlRuntime }).Bun

export function isBunSqlAvailable(): boolean {
  return (globalThis as typeof globalThis & { Bun?: BunSqlRuntime }).Bun !== undefined
}

export async function createBunSqlDrizzle<TSchema extends BunSqlSchema = BunSqlSchema>(
  connectionString = bunRuntime.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/napgram',
  schema?: TSchema,
) {
  if (!isBunSqlAvailable()) {
    throw new Error('Bun SQL is unavailable; run the Bun SQL spike under Bun')
  }

  const { drizzle } = await import('drizzle-orm/bun-sql')
  if (schema) {
    return drizzle(connectionString, { schema })
  }
  return drizzle(connectionString)
}
