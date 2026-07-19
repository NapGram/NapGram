#!/usr/bin/env bash
set -euo pipefail

version="${1:-}"
version="${version#pnpm@}"
if [[ -z "$version" ]]; then
  echo "Usage: $0 <pnpm-version>" >&2
  exit 2
fi

registry="${PNPM_CONFIG_REGISTRY:-https://registry.npmjs.org}"
global_root="$(npm root --global)"
installed_version=""
if [[ -f "$global_root/pnpm/package.json" ]]; then
  installed_version="$(node -p "require(process.argv[1]).version" "$global_root/pnpm/package.json")"
fi

if [[ "$installed_version" != "$version" ]]; then
  npm install --global --no-audit --no-fund \
    --registry="$registry" \
    "pnpm@$version"
fi

actual_version="$(pnpm --version)"
if [[ "$actual_version" != "$version" ]]; then
  echo "Expected pnpm $version, got $actual_version" >&2
  exit 1
fi
