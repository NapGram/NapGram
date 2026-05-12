import json
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import manage_dependency_overrides as mdo


def alert(
    name: str,
    state: str,
    *,
    ecosystem: str = "npm",
    patched: str | None = None,
    fixed_at: str | None = None,
    updated_at: str = "2026-04-20T00:00:00Z",
) -> dict:
    first_patched_version = {}
    if patched is not None:
        first_patched_version["identifier"] = patched
    return {
        "state": state,
        "updated_at": updated_at,
        "fixed_at": fixed_at,
        "dependency": {
            "package": {
                "ecosystem": ecosystem,
                "name": name,
            }
        },
        "security_vulnerability": {
            "first_patched_version": first_patched_version,
        },
    }


class ManageDependencyOverridesTest(unittest.TestCase):
    def test_apply_updates_adds_open_npm_alert_to_managed_overrides(self):
        with tempfile.TemporaryDirectory() as tmp:
            package_file = Path(tmp) / "package.json"
            workspace_file = Path(tmp) / "pnpm-workspace.yaml"
            alerts_file = Path(tmp) / "alerts.json"
            package_file.write_text(json.dumps({"pnpm": {"overrides": {}}, "x-managedPnpmOverrides": {}}))
            workspace_file.write_text("packages:\n  - 'main'\n")
            alerts_file.write_text(json.dumps([alert("vite", "open", patched="8.0.5")]))

            args = type(
                "Args",
                (),
                {
                    "package_file": str(package_file),
                    "workspace_file": str(workspace_file),
                    "alerts_json": str(alerts_file),
                    "removable_json": None,
                },
            )()

            mdo.command_apply_updates(args)

            pkg = json.loads(package_file.read_text())
            self.assertEqual("8.0.5", pkg["x-managedPnpmOverrides"]["vite"])
            self.assertNotIn("overrides", pkg["pnpm"])
            self.assertEqual({"vite": "8.0.5"}, mdo.read_root_yaml_map(workspace_file, "overrides"))

    def test_apply_updates_preserves_manual_overrides(self):
        with tempfile.TemporaryDirectory() as tmp:
            package_file = Path(tmp) / "package.json"
            workspace_file = Path(tmp) / "pnpm-workspace.yaml"
            alerts_file = Path(tmp) / "alerts.json"
            removable_file = Path(tmp) / "removable.json"
            package_file.write_text(
                json.dumps(
                    {
                        "pnpm": {},
                        "x-managedPnpmOverrides": {"vite": ">=8.0.5"},
                    }
                )
            )
            workspace_file.write_text(
                "packages:\n"
                "  - 'main'\n"
                "overrides:\n"
                "  'manual-only': '1.0.0'\n"
                "  'vite': '>=8.0.5'\n"
            )
            alerts_file.write_text("[]")
            removable_file.write_text(json.dumps(["vite"]))

            args = type(
                "Args",
                (),
                {
                    "package_file": str(package_file),
                    "workspace_file": str(workspace_file),
                    "alerts_json": str(alerts_file),
                    "removable_json": str(removable_file),
                },
            )()

            mdo.command_apply_updates(args)

            pkg = json.loads(package_file.read_text())
            self.assertNotIn("vite", pkg["x-managedPnpmOverrides"])
            overrides = mdo.read_root_yaml_map(workspace_file, "overrides")
            self.assertNotIn("vite", overrides)
            self.assertEqual("1.0.0", overrides["manual-only"])

    def test_apply_updates_raises_existing_managed_override_to_historical_baseline(self):
        with tempfile.TemporaryDirectory() as tmp:
            package_file = Path(tmp) / "package.json"
            workspace_file = Path(tmp) / "pnpm-workspace.yaml"
            alerts_file = Path(tmp) / "alerts.json"
            package_file.write_text(
                json.dumps(
                    {
                        "pnpm": {},
                        "x-managedPnpmOverrides": {"minimatch": ">=10.2.1"},
                    }
                )
            )
            workspace_file.write_text(
                "packages:\n"
                "  - 'main'\n"
                "overrides:\n"
                "  'minimatch': '>=10.2.1'\n"
            )
            alerts_file.write_text(json.dumps([alert("minimatch", "fixed", patched="10.2.3")]))

            args = type(
                "Args",
                (),
                {
                    "package_file": str(package_file),
                    "workspace_file": str(workspace_file),
                    "alerts_json": str(alerts_file),
                    "removable_json": None,
                },
            )()

            mdo.command_apply_updates(args)

            pkg = json.loads(package_file.read_text())
            self.assertEqual("10.2.3", pkg["x-managedPnpmOverrides"]["minimatch"])
            self.assertEqual("10.2.3", mdo.read_root_yaml_map(workspace_file, "overrides")["minimatch"])

    def test_apply_updates_normalizes_existing_range_to_exact_version(self):
        with tempfile.TemporaryDirectory() as tmp:
            package_file = Path(tmp) / "package.json"
            workspace_file = Path(tmp) / "pnpm-workspace.yaml"
            alerts_file = Path(tmp) / "alerts.json"
            package_file.write_text(
                json.dumps(
                    {
                        "pnpm": {},
                        "x-managedPnpmOverrides": {"esbuild": "^0.28.0"},
                    }
                )
            )
            workspace_file.write_text(
                "packages:\n"
                "  - 'main'\n"
                "overrides:\n"
                "  'esbuild': '^0.28.0'\n"
            )
            alerts_file.write_text(json.dumps([alert("esbuild", "open", patched="0.25.0")]))

            args = type(
                "Args",
                (),
                {
                    "package_file": str(package_file),
                    "workspace_file": str(workspace_file),
                    "alerts_json": str(alerts_file),
                    "removable_json": None,
                },
            )()

            mdo.command_apply_updates(args)

            pkg = json.loads(package_file.read_text())
            self.assertEqual("0.28.0", pkg["x-managedPnpmOverrides"]["esbuild"])
            self.assertEqual("0.28.0", mdo.read_root_yaml_map(workspace_file, "overrides")["esbuild"])

    def test_candidate_removals_keep_open_alert_and_recent_history(self):
        managed = {
            "vite": ">=8.0.5",
            "axios": ">=1.13.5",
            "tar": "^7.5.8",
        }
        alerts = [
            alert("vite", "open", patched="8.0.5"),
            alert(
                "axios",
                "fixed",
                patched="1.13.5",
                fixed_at="2026-04-27T04:15:39Z",
            ),
        ]

        original_datetime = mdo.datetime

        class FrozenDatetime(datetime):
            @classmethod
            def now(cls, tz=None):
                return datetime(2026, 4, 28, 0, 0, tzinfo=timezone.utc)

        try:
            mdo.datetime = FrozenDatetime
            removable = mdo.candidate_removals(managed, alerts, cooldown_hours=168)
        finally:
            mdo.datetime = original_datetime

        self.assertEqual(["tar"], removable)

    def test_audit_packages_supports_old_and_new_pnpm_shapes(self):
        old_shape = {"advisories": {"1": {"module_name": "vite"}}}
        new_shape = {"vulnerabilities": {"axios": {}, "tar": {}}}

        self.assertEqual({"vite"}, mdo.audit_packages(old_shape))
        self.assertEqual({"axios", "tar"}, mdo.audit_packages(new_shape))


if __name__ == "__main__":
    unittest.main()
