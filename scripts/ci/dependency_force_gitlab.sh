#!/usr/bin/env bash
# GitLab maintenance job for managed pnpm override remediation.
# Mirrors .github/workflows/dependency-force-manager.yml, but opens a GitLab MR.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

ALERTS_JSON="${DEPENDENCY_FORCE_ALERTS_JSON:-/tmp/dependabot-alerts.json}"
REMOVABLE_JSON="${DEPENDENCY_FORCE_REMOVABLE_JSON:-/tmp/removable-overrides.json}"
COOLDOWN_HOURS="${DEPENDENCY_FORCE_HISTORICAL_ALERT_COOLDOWN_HOURS:-168}"
BRANCH="${DEPENDENCY_FORCE_BRANCH:-chore/dependency-force-update}"
BASE_REF="${DEPENDENCY_FORCE_BASE:-${CI_DEFAULT_BRANCH:-beta}}"
GITHUB_REPO="${DEPENDENCY_FORCE_GITHUB_REPO:-NapGram/NapGram}"
# pnpm version follows package.json's packageManager (single source of truth);
# magisk-ci-toolkit's ci/ensure_pnpm.sh resolves and installs it (see ensure_tools).

mkdir -p "$(dirname "$ALERTS_JSON")" "$(dirname "$REMOVABLE_JSON")"

fetch_dependabot_alerts() {
  local token="${RENOVATE_GITHUB_COM_TOKEN:-${GH_TOKEN:-${GITHUB_TOKEN:-}}}"
  if [[ -z "$token" ]]; then
    echo "No GitHub token available for Dependabot alerts; using empty alert set."
    printf '[]\n' >"$ALERTS_JSON"
    return 0
  fi

  if ! DEPENDENCY_FORCE_ALERTS_JSON="$ALERTS_JSON" \
    DEPENDENCY_FORCE_GITHUB_REPO="$GITHUB_REPO" \
    DEPENDENCY_FORCE_GITHUB_TOKEN="$token" \
    python3 - <<'PY'
import json
import os
import sys
import urllib.error
import urllib.request

out_path = os.environ["DEPENDENCY_FORCE_ALERTS_JSON"]
repo = os.environ["DEPENDENCY_FORCE_GITHUB_REPO"]
token = os.environ["DEPENDENCY_FORCE_GITHUB_TOKEN"]
alerts = []
page = 1
while page <= 20:
    url = (
        f"https://api.github.com/repos/{repo}/dependabot/alerts"
        f"?per_page=100&state=all&page={page}"
    )
    req = urllib.request.Request(
        url,
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "napgram-dependency-force",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            chunk = json.load(resp)
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        if exc.code == 403:
            # 403 = authz/rate-limit that hides real security upgrades; fail loud
            # instead of silently writing an empty array and exiting 0.
            print(
                f"ERROR: Dependabot alerts fetch forbidden (HTTP 403): {body[:300]}",
                file=sys.stderr,
            )
            sys.exit(1)
        print(
            f"WARN: Dependabot alerts fetch failed (HTTP {exc.code}): {body[:300]}",
            file=sys.stderr,
        )
        alerts = []
        break
    except Exception as exc:  # noqa: BLE001
        print(f"WARN: Dependabot alerts fetch failed: {exc}", file=sys.stderr)
        alerts = []
        break

    if not isinstance(chunk, list):
        print("WARN: unexpected Dependabot payload; using empty alert set.", file=sys.stderr)
        alerts = []
        break
    alerts.extend(item for item in chunk if isinstance(item, dict))
    if len(chunk) < 100:
        break
    page += 1

with open(out_path, "w", encoding="utf-8") as fh:
    json.dump(alerts, fh)
print(f"Loaded {len(alerts)} Dependabot alerts")
PY
  then
    echo "WARN: alert fetch helper failed; using empty alert set."
    printf '[]\n' >"$ALERTS_JSON"
  fi
}

ensure_tools() {
  local toolkit_dir
  toolkit_dir="$(bash scripts/resolve_ci_toolkit.sh)"
  bash "$toolkit_dir/ci/ensure_pnpm.sh"
  pnpm config set store-dir "${CI_PROJECT_DIR:-$ROOT_DIR}/.pnpm-store" >/dev/null 2>&1 || true
  command -v curl >/dev/null
  command -v python3 >/dev/null
  command -v git >/dev/null
}

create_or_update_mr() {
  local token="${RENOVATE_TOKEN:-${GITLAB_TOKEN:-}}"
  if [[ -z "$token" ]]; then
    echo "RENOVATE_TOKEN or GITLAB_TOKEN is required to publish the dependency-force MR" >&2
    exit 2
  fi

  git config user.name "${DEPENDENCY_FORCE_GIT_NAME:-Magisk317}"
  git config user.email "${DEPENDENCY_FORCE_GIT_EMAIL:-35032111-magisk731@users.noreply.gitlab.com}"

  git checkout -B "$BRANCH"
  git add package.json pnpm-workspace.yaml pnpm-lock.yaml
  if git diff --cached --quiet; then
    echo "No staged dependency-force changes after lockfile refresh."
    return 0
  fi

  git commit -m "build: update forced dependencies"

  local push_url
  if [[ -n "${CI_SERVER_HOST:-}" && -n "${CI_PROJECT_PATH:-}" ]]; then
    # RENOVATE_TOKEN is a personal/project access token; oauth2 username is the GitLab PAT form.
    push_url="https://oauth2:${token}@${CI_SERVER_HOST}/${CI_PROJECT_PATH}.git"
  else
    push_url="origin"
  fi
  git push -f "$push_url" "HEAD:refs/heads/${BRANCH}"

  local api="${CI_API_V4_URL:-https://gitlab.com/api/v4}"
  local project_id="${CI_PROJECT_ID:-}"
  if [[ -z "$project_id" ]]; then
    echo "CI_PROJECT_ID missing; branch pushed but MR creation skipped"
    return 0
  fi

  local existing
  existing="$(
    curl -sS -H "PRIVATE-TOKEN: ${token}" \
      "${api}/projects/${project_id}/merge_requests?state=opened&source_branch=${BRANCH}&target_branch=${BASE_REF}"
  )"
  if python3 -c 'import json,sys; data=json.loads(sys.argv[1] or "[]"); raise SystemExit(0 if isinstance(data,list) and len(data)>0 else 1)' "$existing"; then
    echo "Updated existing dependency-force MR on ${BRANCH}"
    return 0
  fi

  local payload
  payload="$(
    BRANCH_VALUE="$BRANCH" BASE_VALUE="$BASE_REF" python3 - <<'PY'
import json
import os
print(json.dumps({
    "source_branch": os.environ["BRANCH_VALUE"],
    "target_branch": os.environ["BASE_VALUE"],
    "title": "build: update forced dependencies",
    "remove_source_branch": True,
    "labels": "dependencies,javascript,security",
    "description": (
        "Automated dependency override maintenance on GitLab CI:\n\n"
        "- Removed managed pnpm overrides after alert cooldown and audit checks.\n"
        "- Added or updated managed pnpm overrides for open Dependabot npm alerts.\n"
        "- Refreshed the pnpm lockfile after dependency graph changes.\n"
    ),
}))
PY
  )"

  curl -sS -X POST \
    -H "PRIVATE-TOKEN: ${token}" \
    -H "Content-Type: application/json" \
    --data "$payload" \
    "${api}/projects/${project_id}/merge_requests"
  echo
  echo "Created dependency-force MR from ${BRANCH} -> ${BASE_REF}"
}

ensure_tools
fetch_dependabot_alerts

python3 scripts/manage_dependency_overrides.py determine-removable \
  --package-file package.json \
  --workspace-file pnpm-workspace.yaml \
  --lockfile pnpm-lock.yaml \
  --alerts-json "$ALERTS_JSON" \
  --historical-alert-cooldown-hours "$COOLDOWN_HOURS" \
  --verify-pnpm \
  --output "$REMOVABLE_JSON"

python3 scripts/manage_dependency_overrides.py apply-updates \
  --package-file package.json \
  --workspace-file pnpm-workspace.yaml \
  --alerts-json "$ALERTS_JSON" \
  --removable-json "$REMOVABLE_JSON"

if git diff --quiet -- package.json pnpm-workspace.yaml; then
  echo "No managed override changes."
  exit 0
fi

echo "Managed overrides changed; refreshing lockfile."
pnpm install --lockfile-only --ignore-scripts --no-frozen-lockfile

create_or_update_mr
