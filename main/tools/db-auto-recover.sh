#!/bin/sh
set -eu

DB_AUTO_RECOVER="${DB_AUTO_RECOVER:-0}"
DB_BACKUP_DIR="${DB_BACKUP_DIR:-/app/data/backup}"
DB_BACKUP_KEEP="${DB_BACKUP_KEEP:-5}"
DB_BACKUP_PREFIX="${DB_BACKUP_PREFIX:-napgram}"

if [ "$DB_AUTO_RECOVER" != "1" ]; then
  echo "[db-recover] disabled (DB_AUTO_RECOVER=$DB_AUTO_RECOVER)"
  exit 0
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[db-recover] ERROR: DATABASE_URL is not set" >&2
  exit 1
fi

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "[db-recover] ERROR: pg_dump not found (install postgresql-client)" >&2
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "[db-recover] ERROR: psql not found (install postgresql-client)" >&2
  exit 1
fi

if ! command -v pg_isready >/dev/null 2>&1; then
  echo "[db-recover] ERROR: pg_isready not found (install postgresql-client)" >&2
  exit 1
fi

mkdir -p "$DB_BACKUP_DIR"

echo "[db-recover] checking database..."
if ! pg_isready -d "$DATABASE_URL" >/dev/null 2>&1; then
  echo "[db-recover] ERROR: database not ready" >&2
  exit 1
fi

MISSING_COUNT="$(psql "$DATABASE_URL" -qtAX <<'SQL'
SELECT COUNT(*) FROM (VALUES
  ('QqBot'),
  ('Instance'),
  ('AccessToken')
) AS t(name)
WHERE to_regclass('public.' || quote_ident(t.name)) IS NULL;
SQL
)"
MISSING_COUNT="$(echo "$MISSING_COUNT" | tr -d '[:space:]')"

if [ -z "$MISSING_COUNT" ]; then
  echo "[db-recover] ERROR: failed to detect database state" >&2
  exit 1
fi

if [ "$MISSING_COUNT" -gt 0 ]; then
  LATEST_BACKUP="$(ls -1t "$DB_BACKUP_DIR"/${DB_BACKUP_PREFIX}-backup-*.sql 2>/dev/null | head -n 1 || true)"
  if [ -z "$LATEST_BACKUP" ]; then
    echo "[db-recover] WARNING: database looks empty but no backups found"
  else
    echo "[db-recover] restoring from $LATEST_BACKUP"
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$LATEST_BACKUP"
    echo "[db-recover] restore completed"
  fi
else
  echo "[db-recover] database looks healthy"
fi

BACKUP_TS="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_FILE="$DB_BACKUP_DIR/${DB_BACKUP_PREFIX}-backup-$BACKUP_TS.sql"
echo "[db-recover] creating backup $BACKUP_FILE"
pg_dump "$DATABASE_URL" --no-owner --no-privileges --clean --if-exists > "$BACKUP_FILE"
echo "[db-recover] backup completed"

if [ "$DB_BACKUP_KEEP" -gt 0 ]; then
  ls -1t "$DB_BACKUP_DIR"/${DB_BACKUP_PREFIX}-backup-*.sql 2>/dev/null | tail -n +"$((DB_BACKUP_KEEP + 1))" | xargs -r rm -f
fi
