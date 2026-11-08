# Startup migrations

Run `bash main/tools/run-drizzle-migrations.sh` with `DATABASE_URL` set.
The Bun SQL runner reserves one PostgreSQL connection and holds the
`napgram:drizzle-migrations` advisory lock before Drizzle reads its journal.
Concurrent replicas wait for that lock and then read the updated journal.
The connection closes and releases the lock when migration succeeds or fails.

## Conflicting legacy bindings

Migrations 0003 and 0004 stop with the conflicting instance, chat/group and
`ForwardPair` IDs when existing bindings cannot satisfy the current unique
keys. They do not choose a routing destination or delete bindings.
The pending migration transaction rolls back, preserving bindings, messages,
API keys, avatar caches and multi-forward records.

Use the `pairIds` from the error to inspect the affected bindings:

```sql
SELECT "id", "instanceId", "qqRoomId", "tgChatId", "tgThreadId"
FROM "ForwardPair"
WHERE "id" IN (10, 11);
```

For a 0004 conflict, assign the bindings to the intended distinct Telegram
chats or existing forum threads. For a 0003 conflict, decide which binding
should represent the QQ group. If the records actually represent different
QQ chat types, explicitly correct their `qqChatType` metadata; the migration
adds that column with a `group` default if it is absent. A positive and a
negative group ID with the same absolute value identify the same group.
These decisions require the database owner's knowledge of the intended
routes; the migration cannot infer them.

After resolving the reported conflicts, rerun the same migration command.
Completed migrations remain recorded in the journal.

## PostgreSQL regression tests

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres \
  bun test --timeout 30000 ./main/integration/migrations.test.ts
```

The test server user needs permission to create databases and event triggers.
Each test creates and removes its own randomly named database. The suite
checks data preservation, valid upgrades, operator recovery, repeated runs,
and concurrent replicas using the real startup command.
