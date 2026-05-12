"""Manage pnpm overrides owned by the dependency-force-manager workflow."""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

MANAGED_FIELD = "x-managedPnpmOverrides"
WORKSPACE_OVERRIDES_FIELD = "overrides"
DEFAULT_HISTORICAL_ALERT_COOLDOWN_HOURS = 24 * 7


def read_json(path: Path) -> Any:
    return json.loads(path.read_text())


def write_json(path: Path, data: Any) -> None:
    path.write_text(json.dumps(data, indent=4, ensure_ascii=False) + "\n")


def read_root_yaml_map(path: Path, field: str) -> dict[str, str]:
    if not path.exists():
        return {}
    lines = path.read_text().splitlines()
    values: dict[str, str] = {}
    in_section = False
    for line in lines:
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if not line.startswith(" "):
            key = line.split(":", 1)[0].strip().strip("'\"")
            if key == field:
                in_section = True
                continue
            if in_section:
                break
        elif in_section:
            match = re.match(r"\s{2}(['\"]?)(.+?)\1:\s*(.+?)\s*$", line)
            if match:
                raw_value = match.group(3).strip()
                values[match.group(2)] = raw_value.strip("'\"")
    return values


def yaml_quote(value: str) -> str:
    escaped = value.replace("'", "''")
    return f"'{escaped}'"


def write_root_yaml_map(path: Path, field: str, values: dict[str, str]) -> None:
    original = path.read_text().splitlines() if path.exists() else []
    output: list[str] = []
    inserted = False
    index = 0
    while index < len(original):
        line = original[index]
        if not line.startswith(" ") and line.split(":", 1)[0].strip().strip("'\"") == field:
            if values:
                output.append(f"{field}:")
                for key in sorted(values):
                    output.append(f"  {yaml_quote(key)}: {yaml_quote(str(values[key]))}")
            inserted = True
            index += 1
            while index < len(original) and (original[index].startswith(" ") or not original[index].strip()):
                index += 1
            continue
        output.append(line)
        index += 1

    if not inserted and values:
        if output and output[-1].strip():
            output.append("")
        output.append(f"{field}:")
        for key in sorted(values):
            output.append(f"  {yaml_quote(key)}: {yaml_quote(str(values[key]))}")

    path.write_text("\n".join(output).rstrip() + "\n")


def load_alerts(path: Path) -> list[dict[str, Any]]:
    raw = read_json(path)
    if isinstance(raw, list):
        return [item for item in raw if isinstance(item, dict)]
    if isinstance(raw, dict):
        alerts = raw.get("alerts")
        if isinstance(alerts, list):
            return [item for item in alerts if isinstance(item, dict)]
    return []


def package_name(alert: dict[str, Any]) -> str:
    return str(alert.get("dependency", {}).get("package", {}).get("name") or "")


def package_ecosystem(alert: dict[str, Any]) -> str:
    return str(alert.get("dependency", {}).get("package", {}).get("ecosystem") or "").lower()


def is_npm_alert(alert: dict[str, Any]) -> bool:
    return package_ecosystem(alert) in {"npm", "npm_and_yarn"}


def is_open_alert(alert: dict[str, Any]) -> bool:
    return str(alert.get("state") or "").lower() == "open"


def first_patched_version(alert: dict[str, Any]) -> str:
    patched = alert.get("security_vulnerability", {}).get("first_patched_version") or {}
    return str(patched.get("identifier") or patched.get("version") or "").strip()


def parse_github_timestamp(raw: str | None) -> datetime | None:
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).astimezone(timezone.utc)
    except ValueError:
        return None


def alert_resolution_timestamp(alert: dict[str, Any]) -> datetime | None:
    for field in ("fixed_at", "dismissed_at", "auto_dismissed_at", "updated_at", "created_at"):
        timestamp = parse_github_timestamp(alert.get(field))
        if timestamp is not None:
            return timestamp
    return None


def alerts_for_package(alerts: list[dict[str, Any]], name: str) -> list[dict[str, Any]]:
    return [alert for alert in alerts if is_npm_alert(alert) and package_name(alert) == name]


def latest_resolved_alert_timestamp(alerts: list[dict[str, Any]], name: str) -> datetime | None:
    timestamps = [
        timestamp
        for alert in alerts_for_package(alerts, name)
        if not is_open_alert(alert)
        for timestamp in [alert_resolution_timestamp(alert)]
        if timestamp is not None
    ]
    return max(timestamps) if timestamps else None


def cooldown_elapsed(
    alerts: list[dict[str, Any]],
    name: str,
    cooldown_hours: int,
    now: datetime | None = None,
) -> bool:
    latest = latest_resolved_alert_timestamp(alerts, name)
    if latest is None:
        return True
    current = now or datetime.now(timezone.utc)
    return current - latest >= timedelta(hours=cooldown_hours)


def version_key(version: str) -> list[tuple[int, int | str]]:
    parts = re.findall(r"\d+|[A-Za-z]+", base_version(version))
    key: list[tuple[int, int | str]] = []
    for part in parts:
        if part.isdigit():
            key.append((0, int(part)))
        else:
            key.append((1, part.lower()))
    return key


def base_version(spec: str) -> str:
    value = spec.strip()
    value = re.sub(r"^(npm:)?[~^<>= ]+", "", value)
    value = value.split("||")[-1].strip()
    value = re.sub(r"^(npm:)?[~^<>= ]+", "", value)
    return value


def version_gte(left: str, right: str) -> bool:
    return version_key(left) >= version_key(right)


def override_for_patched_version(version: str) -> str:
    value = version.strip()
    if not value:
        return value
    return base_version(value)


def patched_baseline(alerts: list[dict[str, Any]], name: str) -> str | None:
    baseline: str | None = None
    for alert in alerts_for_package(alerts, name):
        patched = first_patched_version(alert)
        if not patched:
            continue
        if baseline is None or version_gte(patched, baseline):
            baseline = patched
    return baseline


def sort_mapping(mapping: dict[str, str]) -> dict[str, str]:
    return {key: mapping[key] for key in sorted(mapping)}


def ensure_package_maps(pkg: dict[str, Any]) -> dict[str, str]:
    managed = pkg.setdefault(MANAGED_FIELD, {})
    if not isinstance(managed, dict):
        raise SystemExit(f"package.json field '{MANAGED_FIELD}' must be an object")
    return managed


def sync_managed_overrides(pkg: dict[str, Any], workspace_file: Path) -> None:
    managed = ensure_package_maps(pkg)
    overrides = read_root_yaml_map(workspace_file, WORKSPACE_OVERRIDES_FIELD)
    for name in list(overrides):
        if name in managed:
            overrides.pop(name)
    overrides.update({str(name): str(version) for name, version in managed.items()})
    pkg[MANAGED_FIELD] = sort_mapping({str(k): str(v) for k, v in managed.items()})
    write_root_yaml_map(workspace_file, WORKSPACE_OVERRIDES_FIELD, sort_mapping(overrides))


def remove_legacy_package_overrides(pkg: dict[str, Any]) -> None:
    pnpm = pkg.get("pnpm")
    if isinstance(pnpm, dict):
        pnpm.pop("overrides", None)


def remove_managed_override(pkg: dict[str, Any], workspace_file: Path, name: str) -> None:
    managed = ensure_package_maps(pkg)
    old_value = managed.pop(name, None)
    if old_value is not None:
        overrides = read_root_yaml_map(workspace_file, WORKSPACE_OVERRIDES_FIELD)
        if overrides.get(name) == old_value:
            overrides.pop(name, None)
            write_root_yaml_map(workspace_file, WORKSPACE_OVERRIDES_FIELD, sort_mapping(overrides))
    sync_managed_overrides(pkg, workspace_file)


def candidate_removals(
    managed: dict[str, str],
    alerts: list[dict[str, Any]],
    cooldown_hours: int,
) -> list[str]:
    removable = []
    for name in sorted(managed):
        package_alerts = alerts_for_package(alerts, name)
        if any(is_open_alert(alert) for alert in package_alerts):
            print(f"INFO: keeping {name}: open Dependabot alert exists")
            continue
        if not cooldown_elapsed(alerts, name, cooldown_hours):
            print(f"INFO: keeping {name}: historical alert cooldown is still active")
            continue
        baseline = patched_baseline(alerts, name)
        if baseline and not version_gte(managed[name], baseline):
            print(f"INFO: keeping {name}: override is below patched baseline {baseline}")
            continue
        removable.append(name)
    return removable


def audit_packages(data: Any) -> set[str] | None:
    if not isinstance(data, dict):
        return None
    packages: set[str] = set()
    advisories = data.get("advisories")
    if isinstance(advisories, dict):
        for advisory in advisories.values():
            if isinstance(advisory, dict):
                name = advisory.get("module_name") or advisory.get("name")
                if name:
                    packages.add(str(name))
    vulnerabilities = data.get("vulnerabilities")
    if isinstance(vulnerabilities, dict):
        packages.update(str(name) for name in vulnerabilities)
    return packages


def run_capture(cmd: list[str], cwd: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, cwd=cwd, text=True, capture_output=True, check=False)


def verify_removals_with_pnpm(
    package_file: Path,
    workspace_file: Path,
    lockfile: Path,
    candidates: list[str],
    pnpm: str,
) -> list[str]:
    if not candidates:
        return []
    if shutil.which(pnpm) is None:
        print(f"WARN: {pnpm} is not available; refusing to remove managed overrides")
        return []

    root = package_file.parent
    original_package = package_file.read_text()
    original_workspace = workspace_file.read_text() if workspace_file.exists() else None
    original_lock = lockfile.read_text() if lockfile.exists() else None
    verified: list[str] = []

    for name in candidates:
        try:
            pkg = json.loads(original_package)
            remove_managed_override(pkg, workspace_file, name)
            write_json(package_file, pkg)

            install = run_capture(
                [pnpm, "install", "--lockfile-only", "--ignore-scripts", "--no-frozen-lockfile"],
                cwd=root,
            )
            if install.returncode != 0:
                print(f"INFO: keeping {name}: pnpm install failed after removal")
                continue

            audit = run_capture([pnpm, "audit", "--json"], cwd=root)
            audit_text = audit.stdout.strip() or audit.stderr.strip()
            if audit_text:
                try:
                    packages = audit_packages(json.loads(audit_text))
                except json.JSONDecodeError:
                    print(f"INFO: keeping {name}: pnpm audit output was not valid JSON")
                    continue
                if packages is None or name in packages:
                    print(f"INFO: keeping {name}: pnpm audit still reports the package")
                    continue

            verified.append(name)
            print(f"INFO: {name} is removable")
        finally:
            package_file.write_text(original_package)
            if original_workspace is not None:
                workspace_file.write_text(original_workspace)
            if original_lock is not None:
                lockfile.write_text(original_lock)
            elif lockfile.exists():
                lockfile.unlink()

    return verified


def command_sync(args: argparse.Namespace) -> None:
    package_file = Path(args.package_file)
    workspace_file = Path(args.workspace_file)
    pkg = read_json(package_file)
    remove_legacy_package_overrides(pkg)
    sync_managed_overrides(pkg, workspace_file)
    write_json(package_file, pkg)


def command_determine_removable(args: argparse.Namespace) -> None:
    package_file = Path(args.package_file)
    pkg = read_json(package_file)
    managed = ensure_package_maps(pkg)
    alerts = load_alerts(Path(args.alerts_json))
    candidates = candidate_removals(
        {str(k): str(v) for k, v in managed.items()},
        alerts,
        args.historical_alert_cooldown_hours,
    )
    if args.verify_pnpm:
        candidates = verify_removals_with_pnpm(
            package_file=package_file,
            workspace_file=Path(args.workspace_file),
            lockfile=Path(args.lockfile),
            candidates=candidates,
            pnpm=args.pnpm,
        )
    Path(args.output).write_text(json.dumps(candidates, indent=2) + "\n")
    print(f"Removable managed overrides: {len(candidates)}")


def command_apply_updates(args: argparse.Namespace) -> None:
    package_file = Path(args.package_file)
    workspace_file = Path(args.workspace_file)
    pkg = read_json(package_file)
    remove_legacy_package_overrides(pkg)
    managed = ensure_package_maps(pkg)
    alerts = load_alerts(Path(args.alerts_json))

    removals = set(read_json(Path(args.removable_json))) if args.removable_json else set()
    for name in sorted(removals):
        remove_managed_override(pkg, workspace_file, name)

    managed = ensure_package_maps(pkg)
    baselines: dict[str, str] = {}
    for alert in alerts:
        if not is_npm_alert(alert):
            continue
        name = package_name(alert)
        patched = first_patched_version(alert)
        if not name or not patched:
            continue
        target = override_for_patched_version(patched)
        if is_open_alert(alert) or name in managed:
            current_baseline = baselines.get(name)
            if current_baseline is None or version_gte(target, current_baseline):
                baselines[name] = target

    for name, target in baselines.items():
        current = managed.get(name)
        if current is None or version_gte(target, current):
            managed[name] = target
        elif base_version(current) != current and version_gte(current, target):
            managed[name] = base_version(current)

    sync_managed_overrides(pkg, workspace_file)
    write_json(package_file, pkg)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)

    sync = subparsers.add_parser("sync")
    sync.add_argument("--package-file", default="package.json")
    sync.add_argument("--workspace-file", default="pnpm-workspace.yaml")
    sync.set_defaults(func=command_sync)

    determine = subparsers.add_parser("determine-removable")
    determine.add_argument("--package-file", default="package.json")
    determine.add_argument("--workspace-file", default="pnpm-workspace.yaml")
    determine.add_argument("--lockfile", default="pnpm-lock.yaml")
    determine.add_argument("--alerts-json", required=True)
    determine.add_argument("--output", required=True)
    determine.add_argument("--pnpm", default="pnpm")
    determine.add_argument("--verify-pnpm", action="store_true")
    determine.add_argument(
        "--historical-alert-cooldown-hours",
        type=int,
        default=DEFAULT_HISTORICAL_ALERT_COOLDOWN_HOURS,
    )
    determine.set_defaults(func=command_determine_removable)

    apply_updates = subparsers.add_parser("apply-updates")
    apply_updates.add_argument("--package-file", default="package.json")
    apply_updates.add_argument("--workspace-file", default="pnpm-workspace.yaml")
    apply_updates.add_argument("--alerts-json", required=True)
    apply_updates.add_argument("--removable-json")
    apply_updates.set_defaults(func=command_apply_updates)

    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
