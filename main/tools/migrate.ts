import { SQL } from 'bun'
import { drizzle } from 'drizzle-orm/bun-sql'
import { migrate } from 'drizzle-orm/bun-sql/migrator'

const databaseUrl = Bun.env.DATABASE_URL
if (!databaseUrl)
  throw new Error('DATABASE_URL environment variable is not set')

await using client = new SQL(databaseUrl, { max: 1, idleTimeout: 0, maxLifetime: 0 })
using connection = await client.reserve()
// Keep the lock on the migration connection, including the journal read before its transaction.
// Closing the client releases the session lock on both success and failure.
await connection`SELECT pg_advisory_lock(hashtext('napgram:drizzle-migrations'))`
await migrate(drizzle(connection), {
  migrationsFolder: new URL('./drizzle/', import.meta.url).pathname,
})
