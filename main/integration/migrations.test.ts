import { $ } from 'bun'
import { expect, onTestFinished, test } from 'bun:test'

const toolsDir = new URL('../tools/', import.meta.url).pathname
const mainDir = new URL('../', import.meta.url).pathname
const journal: { entries: readonly { tag: string }[] } = await Bun.file(`${toolsDir}/drizzle/meta/_journal.json`).json()

async function createDatabase(through = -1) {
  const databaseUrl = Bun.env.DATABASE_URL
  if (!databaseUrl)
    throw new Error('DATABASE_URL must point to a PostgreSQL server with CREATE DATABASE permission')

  const root = (await $`mktemp -d`.env(Bun.env).quiet().text()).trim()
  const name = `napgram_migrations_${crypto.randomUUID().replaceAll('-', '')}`
  const admin = new Bun.SQL(databaseUrl)
  await admin.unsafe(`CREATE DATABASE "${name}"`)
  const url = new URL(databaseUrl)
  url.pathname = name
  const db = new Bun.SQL(url.toString(), { max: 4 })
  onTestFinished(async () => {
    await db.close()
    await admin.unsafe(`DROP DATABASE "${name}" WITH (FORCE)`)
    await admin.close()
    await $`rm -rf ${root}`.env(Bun.env).quiet()
  })
  await $`mkdir -p ${root}/main`.env(Bun.env).quiet()
  await $`cp -R ${toolsDir} ${root}/main/tools`.env(Bun.env).quiet()
  await $`ln -s ${mainDir}/node_modules ${root}/main/node_modules`.env(Bun.env).quiet()
  await $`ln -s ${mainDir}/../node_modules ${root}/node_modules`.env(Bun.env).quiet()
  const run = async () => await $`bash ${root}/main/tools/run-drizzle-migrations.sh`
    .cwd('/tmp').env({ ...Bun.env, DATABASE_URL: url.toString() }).nothrow().quiet()

  if (through >= 0) {
    const path = `${root}/main/tools/drizzle/meta/_journal.json`
    await Bun.write(path, JSON.stringify({ ...journal, entries: journal.entries.slice(0, through + 1) }))
    const result = await run()
    expect(result.exitCode, result.stderr.toString()).toBe(0)
    await Bun.write(path, JSON.stringify(journal))
  }
  return { db, run }
}

interface Binding {
  readonly id: number
  readonly qq: number
  readonly tg: number
  readonly instance?: number
  readonly thread?: number
}

async function seed(db: Bun.SQL, bindings: readonly Binding[]) {
  await db`INSERT INTO "Instance" (id) VALUES (1), (2)`
  for (const { id, qq, tg, instance = 1, thread = null } of bindings) {
    await db`INSERT INTO "ForwardPair" (id, "qqRoomId", "tgChatId", "tgThreadId", "instanceId", "apiKey")
      VALUES (${id}, ${qq}, ${tg}, ${thread}, ${instance}, ${`fixture-${id}`})`
    await db`INSERT INTO "AvatarCache" ("forwardPairId", hash) VALUES (${id}, ${new Uint8Array([id])})`
    await db`INSERT INTO "ForwardMultiple" (id, "resId", "fileName", "fromPairId")
      VALUES (${`multiple-${id}`}, ${`resource-${id}`}, ${`file-${id}`}, ${id})`
    await db`INSERT INTO "Message" (id, "qqRoomId", "qqSenderId", time, seq, rand, pktnum, "tgChatId", "tgMsgId", "instanceId")
      VALUES (${id}, ${qq}, 1, 1, ${id}, 1, 1, ${tg}, ${id}, ${instance})`
  }
}

async function snapshot(db: Bun.SQL) {
  return Array.from(await db`SELECT jsonb_build_object(
    'pairs', (SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM "ForwardPair" p),
    'avatars', (SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM "AvatarCache" a),
    'multiples', (SELECT jsonb_agg(to_jsonb(f) ORDER BY id) FROM "ForwardMultiple" f),
    'messages', (SELECT jsonb_agg(to_jsonb(m) ORDER BY id) FROM "Message" m)
  ) AS state`)
}

test('migrates a fresh PostgreSQL database', async () => {
  const { db, run } = await createDatabase()
  const result = await run()
  expect(result.exitCode, result.stderr.toString()).toBe(0)
  expect(Array.from(await db`SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations`))
    .toEqual([{ count: journal.entries.length }])
})

test('does not reapply completed migrations', async () => {
  const { db, run } = await createDatabase(journal.entries.length - 1)
  const result = await run()
  expect(result.exitCode, result.stderr.toString()).toBe(0)
  expect(Array.from(await db`SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations`))
    .toEqual([{ count: journal.entries.length }])
})

test.each([
  { conflict: 'Telegram null-thread', through: 3, bindings: [{ id: 10, qq: 101, tg: -100 }, { id: 11, qq: 102, tg: -100 }] },
  { conflict: 'signed QQ group', through: 2, bindings: [{ id: 10, qq: 101, tg: -100 }, { id: 11, qq: -101, tg: -200 }] },
])('preserves all records and reports $conflict conflicts', async ({ through, bindings }) => {
  const { db, run } = await createDatabase(through)
  await seed(db, bindings)
  const before = await snapshot(db)
  const result = await run()
  expect(await snapshot(db)).toEqual(before)
  expect(result.exitCode).toBe(1)
  const diagnostics = result.stderr.toString() + result.stdout.toString()
  expect(diagnostics).toContain('pairIds=[10, 11]')
  expect(diagnostics).toContain('Resolve conflicting ForwardPair bindings')
  expect(Array.from(await db`SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations`))
    .toEqual([{ count: through + 1 }])
})

test('preserves distinct Telegram threads and instances when enforcing uniqueness', async () => {
  const { db, run } = await createDatabase(3)
  await seed(db, [
    { id: 10, qq: 101, tg: -100 },
    { id: 11, qq: 102, tg: -100, thread: 100 },
    { id: 12, qq: 103, tg: -100, instance: 2 },
  ])
  const result = await run()
  expect(result.exitCode, result.stderr.toString()).toBe(0)
  expect(Array.from(await db`SELECT id FROM "ForwardPair" ORDER BY id`)).toEqual([{ id: 10 }, { id: 11 }, { id: 12 }])
  const error = await db`INSERT INTO "ForwardPair" ("qqRoomId", "tgChatId", "instanceId", "apiKey")
    VALUES (104, -100, 1, 'conflicting-target')`.then(() => null, (error: unknown) => error)
  expect(error).toBeInstanceOf(Bun.SQL.PostgresError)
})

test('normalizes group bindings and messages without conflating private chats or instances', async () => {
  const { db, run } = await createDatabase(2)
  await seed(db, [
    { id: 10, qq: -101, tg: -100 },
    { id: 11, qq: 101, tg: -200 },
    { id: 12, qq: -101, tg: -300, instance: 2 },
  ])
  await db`ALTER TABLE "ForwardPair" ADD COLUMN "qqChatType" text NOT NULL DEFAULT 'group'`
  await db`ALTER TABLE "Message" ADD COLUMN "qqChatType" text NOT NULL DEFAULT 'group'`
  await db`UPDATE "ForwardPair" SET "qqChatType" = 'private' WHERE id = 11`
  await db`UPDATE "Message" SET "qqChatType" = 'private' WHERE id = 11`
  const result = await run()
  expect(result.exitCode, result.stderr.toString()).toBe(0)
  const expected = [
    { id: 10, qq: '101', type: 'group', instance: 1 },
    { id: 11, qq: '101', type: 'private', instance: 1 },
    { id: 12, qq: '101', type: 'group', instance: 2 },
  ]
  expect(Array.from(await db`SELECT id, "qqRoomId"::text AS qq, "qqChatType" AS type, "instanceId" AS instance
    FROM "ForwardPair" ORDER BY id`)).toEqual(expected)
  expect(Array.from(await db`SELECT id, "qqRoomId"::text AS qq, "qqChatType" AS type, "instanceId" AS instance
    FROM "Message" ORDER BY id`)).toEqual(expected)
  expect(Array.from(await db`SELECT "forwardPairId" AS id FROM "AvatarCache" ORDER BY id`)).toEqual([{ id: 10 }, { id: 11 }, { id: 12 }])
  expect(Array.from(await db`SELECT "fromPairId" AS id FROM "ForwardMultiple" ORDER BY id`)).toEqual([{ id: 10 }, { id: 11 }, { id: 12 }])
})

test('retries successfully after an operator resolves a conflicting target without deleting data', async () => {
  const { db, run } = await createDatabase(3)
  await seed(db, [{ id: 10, qq: 101, tg: -100 }, { id: 11, qq: 102, tg: -100 }])
  expect((await run()).exitCode).toBe(1)
  await db`UPDATE "ForwardPair" SET "tgChatId" = -200 WHERE id = 11`
  const result = await run()
  expect(result.exitCode, result.stderr.toString()).toBe(0)
  expect(Array.from(await db`SELECT id FROM "ForwardPair" ORDER BY id`)).toEqual([{ id: 10 }, { id: 11 }])
  expect(Array.from(await db`SELECT "fromPairId" AS id FROM "ForwardMultiple" ORDER BY id`)).toEqual([{ id: 10 }, { id: 11 }])
  expect(Array.from(await db`SELECT "forwardPairId" AS id FROM "AvatarCache" ORDER BY id`)).toEqual([{ id: 10 }, { id: 11 }])
})

test('serializes concurrent replicas before inspecting pending migrations', async () => {
  const { db, run } = await createDatabase(1)
  await db.unsafe(`CREATE FUNCTION block_permission_migration() RETURNS event_trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF current_query() LIKE '%CREATE TABLE "CommandPermissions"%' THEN
        PERFORM pg_advisory_xact_lock(4242);
      END IF;
    END $$;
    CREATE EVENT TRIGGER migration_barrier ON ddl_command_start EXECUTE FUNCTION block_permission_migration();`).simple()
  using barrier = await db.reserve()
  await barrier`SELECT pg_advisory_lock(4242)`
  const signal = AbortSignal.timeout(10000)
  const ready = (async () => {
    while (!signal.aborted) {
      const rows = await db<{ count: number }[]>`SELECT count(*)::int AS count FROM pg_locks
        WHERE locktype = 'advisory' AND NOT granted
          AND database = (SELECT oid FROM pg_database WHERE datname = current_database())`
      if (rows[0]?.count === 2)
        return
    }
    signal.throwIfAborted()
  })().finally(async () => { await barrier`SELECT pg_advisory_unlock(4242)` })
  const [first, second] = await Promise.all([run(), run(), ready])
  expect([first.exitCode, second.exitCode], [first.stderr.toString(), second.stderr.toString()].join('\n')).toEqual([0, 0])
  expect(Array.from(await db`SELECT count(*)::int AS count, count(DISTINCT created_at)::int AS distinct_count
    FROM drizzle.__drizzle_migrations`)).toEqual([{ count: journal.entries.length, distinct_count: journal.entries.length }])
})
