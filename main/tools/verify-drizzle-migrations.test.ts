import { afterEach, describe, expect, it } from 'bun:test'
import { PGlite } from '@electric-sql/pglite'
import { splitSqlStatements } from './split-drizzle-sql.js'

const migrationFolder = new URL('./drizzle/', import.meta.url)

async function applyCurrentMigrations(database: PGlite) {
  const journalFile = Bun.file(new URL('meta/_journal.json', migrationFolder))
  const journal = await journalFile.json() as { entries: Array<{ tag: string }> }

  let executed = 0
  for (const entry of journal.entries) {
    const sql = await Bun.file(new URL(`${entry.tag}.sql`, migrationFolder)).text()
    for (const statement of splitSqlStatements(sql)) {
      await database.exec(statement)
      executed++
    }
  }
  return { migrationCount: journal.entries.length, statementCount: executed }
}

describe('Drizzle PostgreSQL migrations', () => {
  let database: PGlite | undefined

  afterEach(async () => {
    await database?.close()
    database = undefined
  })

  it('creates the application schema and Instance table on an empty database', async () => {
    database = new PGlite('memory://')
    await database.waitReady

    const applied = await applyCurrentMigrations(database)
    const [state] = (await database.query(`
      SELECT current_database() AS database_name,
             current_schema() AS schema_name,
             current_setting('search_path') AS search_path,
             to_regclass('"Instance"')::text AS instance
    `)).rows

    expect(applied.migrationCount).toBeGreaterThan(0)
    expect(applied.statementCount).toBeGreaterThan(0)
    expect(state).toMatchObject({ schema_name: 'public', search_path: 'public', instance: '"Instance"' })
  })

})
