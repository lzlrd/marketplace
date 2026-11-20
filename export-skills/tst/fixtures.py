"""Fixture builders and script runners for the export-skills tests.

Every test gets a throwaway home directory with a fake plugin cache, fake
personal skills and a fake Claude Desktop folder. The scripts run as
subprocesses with HOME (and the Windows equivalents) pointed at it, so a test
never reads the real ~/.claude or the real Desktop config.
"""
import json
import os
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

PLUGIN = Path(__file__).resolve().parent.parent
SKILL = PLUGIN / "skills" / "export-skills"
SCRIPTS = SKILL / "scripts"

# Environment a test must never inherit: each one relocates what the scripts read.
SCRUBBED = ("CLAUDE_CODE_PLUGIN_CACHE_DIR", "CLAUDE_CONFIG_DIR")


def write(path, text=""):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return path


def skill_md(name="demo", description="Does one small thing.", extra="", body="Body.\n"):
    """SKILL.md text. Pass None for name or description to leave the key out, and
    `extra` for further frontmatter lines."""
    lines = ["---"]
    if name is not None:
        lines.append(f"name: {name}")
    if description is not None:
        lines.append(f"description: {description}")
    if extra:
        lines.append(extra.rstrip("\n"))
    return "\n".join(lines + ["---", "", body])


def make_skill(skill_dir, files=(), **md):
    """Create a skill directory. The frontmatter name defaults to the directory
    name (pass name=None for no name at all), and `files` maps a relative path
    to its text."""
    skill_dir = Path(skill_dir)
    md.setdefault("name", skill_dir.name)
    write(skill_dir / "SKILL.md", skill_md(**md))
    for rel, text in dict(files).items():
        write(skill_dir / rel, text)
    return skill_dir


class ScriptCase(unittest.TestCase):
    """Base class: a temporary home and working directory per test."""

    def setUp(self):
        tmp = tempfile.TemporaryDirectory(prefix="export-skills-tst-")
        self.addCleanup(tmp.cleanup)
        self.tmp = Path(tmp.name).resolve()
        self.home = self.tmp / "home"
        self.cwd = self.tmp / "project"
        self.home.mkdir()
        self.cwd.mkdir()
        self.plugins = self.home / ".claude" / "plugins"
        self.cache = self.plugins / "cache"

    def symlink(self, target, link):
        try:
            os.symlink(target, link)
        except (OSError, NotImplementedError):
            self.skipTest("symlinks are not available here")

    def env(self, **extra):
        env = {k: v for k, v in os.environ.items() if k not in SCRUBBED}
        env.update(HOME=str(self.home), USERPROFILE=str(self.home),
                   APPDATA=str(self.home / "AppData" / "Roaming"),
                   XDG_STATE_HOME=str(self.home / ".local" / "state"))
        env.update(extra)
        return env

    def run_script(self, script, *args, **env):
        return subprocess.run(
            [sys.executable, "-B", str(SCRIPTS / script), *[str(a) for a in args]],
            capture_output=True, text=True, cwd=self.cwd, env=self.env(**env), timeout=120)

    # A fake Claude Code install.

    def version_dir(self, repo, plugin, version):
        return self.cache / repo / plugin / version

    def plugin_skill(self, repo, plugin, version, dir_name, **md):
        """A skill at cache/<repo>/<plugin>/<version>/skills/<dir_name>/. Pass
        name= for a frontmatter name that differs from the directory."""
        return make_skill(self.version_dir(repo, plugin, version) / "skills" / dir_name, **md)

    def installed(self, records):
        """Write installed_plugins.json from {"plugin@repo": version_dir}."""
        plugins = {key: [{"scope": "user", "installPath": str(path), "version": Path(path).name}]
                   for key, path in records.items()}
        write(self.plugins / "installed_plugins.json",
              json.dumps({"version": 2, "plugins": plugins}))

    def orphan(self, version_dir):
        """Mark a version directory the way Claude Code does when an update or
        uninstall replaces it. Writing the marker makes the directory the most
        recently modified one, which is what misled the old mtime fallback."""
        write(Path(version_dir) / ".orphaned_at", "1795090092550")
        os.utime(version_dir, (2_000_000_000, 2_000_000_000))

    def settings(self, enabled, path=None):
        write(path or self.home / ".claude" / "settings.json",
              json.dumps({"enabledPlugins": enabled}))

    def desktop_dir(self):
        if sys.platform == "darwin":
            return self.home / "Library" / "Application Support" / "Claude"
        if sys.platform == "win32":
            return self.home / "AppData" / "Roaming" / "Claude"
        return self.home / ".config" / "Claude"

    def inventory(self, **env):
        """Run inventory.py and return (parsed stdout, stderr)."""
        proc = self.run_script("inventory.py", **env)
        self.assertEqual(proc.returncode, 0, proc.stderr)
        return json.loads(proc.stdout), proc.stderr

    def plugin_records(self, inv, plugin):
        return {r["name"]: r for r in inv["skills"] if r["plugin"] == plugin}

    # Packaging.

    def package(self, entries, out=None, mode=None, manifest_mode="lenient"):
        """Write a manifest, run package.py, and return (process, out_dir)."""
        out = Path(out or self.tmp / "out")
        manifest = {"skills": entries}
        if manifest_mode is not None:
            manifest["mode"] = manifest_mode
        path = write(self.tmp / "qualifiers.json", json.dumps(manifest))
        args = ["--manifest", path, "--out", out]
        if mode is not None:
            args += ["--mode", mode]
        return self.run_script("package.py", *args), out

    def entry(self, skill_dir, name=None, **keys):
        """A personal-skill manifest entry for a fixture skill directory."""
        entry = {"kind": "personal", "repo": None, "plugin": None,
                 "name": Path(skill_dir).name if name is None else name,
                 "skill_dir": str(skill_dir)}
        entry.update(keys)
        return entry

    def zips(self, out):
        return sorted(p.name for p in Path(out).glob("*.zip"))

    def members(self, zip_path):
        with zipfile.ZipFile(zip_path) as zf:
            return sorted(zf.namelist())
