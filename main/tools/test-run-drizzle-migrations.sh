#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

output_file="$(mktemp)"
trap 'rm -f "${output_file}"' EXIT

if env -u DATABASE_URL bash "${SCRIPT_DIR}/run-drizzle-migrations.sh" >"${output_file}" 2>&1; then
  cat "${output_file}"
  echo "Expected a missing DATABASE_URL to fail." >&2
  exit 1
fi
if ! grep -q 'DATABASE_URL environment variable is not set' "${output_file}"; then
  cat "${output_file}"
  echo "Missing DATABASE_URL failed for an unexpected reason." >&2
  exit 1
fi

# Use a closed loopback port; a rejected connection must never be reported as success.
failed_url='postgresql://repro:repro@127.0.0.1:1/napgram_repro'
if DATABASE_URL="${failed_url}" bash "${SCRIPT_DIR}/run-drizzle-migrations.sh" >"${output_file}" 2>&1; then
  cat "${output_file}"
  echo "A failed database connection was reported as a successful migration." >&2
  exit 1
fi
if grep -q 'Database migrations completed successfully' "${output_file}"; then
  cat "${output_file}"
  echo "Migration wrapper printed a false success message." >&2
  exit 1
fi

cat "${output_file}"
echo "Migration wrapper failure-propagation checks passed."
