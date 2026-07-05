#! /usr/bin/env python3
"""Inventory locally-installed Claude Code skills for the export-skills skill.

Emits a JSON work-list on stdout: the Desktop MCP server list plus one record per
skill (latest cached version only, personal symlinks resolved, no marketplace
duplicates). This encodes Phase 0 of references/process.md so the traps are
handled the same way every run.
"""
import json
import os
import sys
from pathlib import Path

HOME = Path.home()
CACHE = HOME / ".claude" / "plugins" / "cache"
PERSONAL_ROOTS = [HOME / ".claude" / "skills", HOME / ".agents" / "skills"]
SETTINGS = HOME / ".claude" / "settings.json"
DESKTOP_CONFIG = (HOME / "Library" / "Application Support" / "Claude"
                  / "claude_desktop_config.json")

# Resource dirs worth shipping (kept in sync with package.py's KEEP_DIRS).
RESOURCE_DIRS = {"references", "reference", "scripts", "templates", "assets",
                 "examples", "themes", "core", "style-prompts", "canvas-fonts",
                 "docs", "evals"}


def load_json(path):
    try:
        return json.loads(Path(path).read_text())
    except Exception:
        return None


def version_key(version_dir):
    """Sort key for picking the latest cached version. Numeric-dotted versions
    (1.2.3) sort naturally and outrank anything else; hashes and 'unknown' fall
    back to modification time."""
    parts = version_dir.name.split(".")
    if parts and all(p.isdigit() for p in parts):
        return (1, [int(p) for p in parts], 0.0)
    try:
        mtime = version_dir.stat().st_mtime
    except OSError:
        mtime = 0.0
    return (0, [], mtime)


def skill_name(rest, plugin):
    """Derive the skill name from the path components after the version dir.
    Only the two documented shapes count as an installable skill; deeper matches
    are bundled example SKILL.md files, not skills to export."""
    if rest == ["SKILL.md"]:
        return plugin  # Root-level SKILL.md (e.g. humanizer).
    if len(rest) == 3 and rest[0] == "skills" and rest[2] == "SKILL.md":
        return rest[1]
    return None


def resource_dirs_of(skill_dir):
    out = []
    try:
        for child in sorted(skill_dir.iterdir()):
            if child.is_dir() and child.name in RESOURCE_DIRS:
                out.append(child.name)
    except OSError:
        pass
    return out


def inventory_plugins():
    # Keep only the latest version per (repo, plugin, name).
    best = {}
    if not CACHE.is_dir():
        return []
    for skill_md in CACHE.rglob("SKILL.md"):
        rel = skill_md.relative_to(CACHE).parts
        if len(rel) < 4:
            continue  # Need repo/plugin/version/.../SKILL.md.
        repo, plugin, version = rel[0], rel[1], rel[2]
        name = skill_name(list(rel[3:]), plugin)
        if name is None:
            continue
        version_dir = CACHE / repo / plugin / version
        key = (repo, plugin, name)
        vk = version_key(version_dir)
        if key not in best or vk > best[key]["_vk"]:
            best[key] = {
                "_vk": vk,
                "kind": "plugin",
                "repo": repo,
                "plugin": plugin,
                "plugin_version": version,
                "name": name,
                "skill_md": str(skill_md),
                "skill_dir": str(skill_md.parent),
                "resource_dirs": resource_dirs_of(skill_md.parent),
            }
    for rec in best.values():
        rec.pop("_vk", None)
    return list(best.values())


def inventory_personal():
    # Resolve symlinks: ~/.claude/skills often points into ~/.agents/skills, and
    # find(1) does not follow symlinks, so it silently misses these.
    seen, records = set(), []
    for root in PERSONAL_ROOTS:
        if not root.is_dir():
            continue
        for entry in sorted(root.iterdir()):
            real = Path(os.path.realpath(entry))
            skill_md = real / "SKILL.md"
            if not skill_md.is_file() or str(skill_md) in seen:
                continue
            seen.add(str(skill_md))
            records.append({
                "kind": "personal", "repo": None, "plugin": None,
                "plugin_version": None, "name": entry.name,
                "skill_md": str(skill_md), "skill_dir": str(real),
                "resource_dirs": resource_dirs_of(real),
            })
    return records


def enabled_plugin_names():
    # settings.json enabledPlugins is the ground truth for "installed". Accept a
    # dict of {name: bool} or a plain list; normalize away any @repo suffix.
    enabled = (load_json(SETTINGS) or {}).get("enabledPlugins")
    names = set()
    if isinstance(enabled, dict):
        names = {k.split("@")[0].split("/")[-1] for k, v in enabled.items() if v}
    elif isinstance(enabled, list):
        names = {str(k).split("@")[0].split("/")[-1] for k in enabled}
    return names


def desktop_mcp_servers():
    data = load_json(DESKTOP_CONFIG)
    if not isinstance(data, dict):
        return [], False
    servers = data.get("mcpServers")
    return (sorted(servers), True) if isinstance(servers, dict) else ([], True)


def main():
    plugins = inventory_plugins()
    personal = inventory_personal()
    enabled = enabled_plugin_names()
    for rec in plugins:
        rec["enabled"] = (rec["plugin"] in enabled) if enabled else None
    servers, cfg_found = desktop_mcp_servers()
    out = {
        "desktop_mcp_servers": servers,
        "desktop_config_found": cfg_found,
        "enabled_plugins_known": bool(enabled),
        "skills": sorted(plugins + personal,
                         key=lambda r: (r["kind"], r.get("plugin") or "", r["name"])),
    }
    json.dump(out, sys.stdout, indent=2)
    sys.stdout.write("\n")
    print(f"[inventory] {len(plugins)} plugin skills, {len(personal)} personal "
          f"skills, {len(servers)} Desktop MCP servers "
          f"({'config found' if cfg_found else 'NO desktop config'}).",
          file=sys.stderr)


if __name__ == "__main__":
    main()
