#!/usr/bin/env bash
set -euo pipefail

echo "Running database migrations with Drizzle..."

# Resolve repo root from this script location to avoid cwd issues.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Check if database is accessible
if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL environment variable is not set" >&2
  exit 1
fi

run_drizzle_migrate() {
  local config_path="${SCRIPT_DIR}/drizzle.config.ts"
  local status
  local candidates=(
    "${ROOT_DIR}/main/node_modules/.bin/drizzle-kit"
    "${ROOT_DIR}/node_modules/.bin/drizzle-kit"
  )
  local candidate
  for candidate in "${candidates[@]}"; do
    if [ -x "${candidate}" ]; then
      bun "${candidate}" migrate --config "${config_path}"
      return $?
    fi
  done

  echo "ERROR: drizzle-kit not found under ${ROOT_DIR}" >&2
  return 1
}

# Run Drizzle migrations (from installed package)
echo "Applying Drizzle migrations..."
if ! run_drizzle_migrate; then
  echo "Database migration failed; aborting." >&2
  exit 1
fi

echo "✅ Database migrations completed successfully"
