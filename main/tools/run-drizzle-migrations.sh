#!/usr/bin/env bash
set -euo pipefail

echo "Running database migrations with Drizzle..."

# Resolve the tools directory from this script location to avoid cwd issues.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Check if database is accessible
if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL environment variable is not set"
  exit 1
fi

# Run Drizzle migrations on a locked database connection.
echo "Applying Drizzle migrations..."
bun "${SCRIPT_DIR}/migrate.ts"

echo "✅ Database migrations completed successfully"
exit 0
