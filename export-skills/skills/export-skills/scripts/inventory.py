#! /usr/bin/env python3
"""Inventory locally-installed Claude Code skills for the export-skills skill.

Emits a JSON work-list on stdout: what Claude Desktop has for MCP servers, plus
one record per skill (the installed version of each plugin, only the skills that
plugin loads, personal symlinks resolved, no marketplace duplicates). This
encodes Phase 0 of references/process.md so the traps are handled the same way
every run.
"""
import json
import os
import sys
from pathlib import Path

sys.dont_write_bytecode = True  # Keep __pycache__ out of the installed plugin.
from skill_rules import frontmatter_name, read_frontmatter, upload_issues

HOME = Path.home()
# Claude Code keeps its user settings, plugins and personal skills in ~/.claude,
# which CLAUDE_CONFIG_DIR relocates.
CONFIG = Path(os.environ.get("CLAUDE_CONFIG_DIR") or HOME / ".claude").expanduser()
# It keeps cache/, installed_plugins.json and marketplaces/ under one plugins
# root, which CLAUDE_CODE_PLUGIN_CACHE_DIR relocates on its own.
PLUGINS = Path(os.environ.get("CLAUDE_CODE_PLUGIN_CACHE_DIR")
               or CONFIG / "plugins").expanduser()
CACHE = PLUGINS / "cache"
PERSONAL_ROOTS = [CONFIG / "skills", HOME / ".agents" / "skills"]
# The settings files that can carry enabledPlugins, lowest precedence first: user,
# then the project and local files of the directory the script runs in.
SETTINGS = [CONFIG / "settings.json",
            Path(".claude") / "settings.json",
            Path(".claude") / "settings.local.json"]


def _desktop_config_path():
    """Claude Desktop's config lives in a per-OS location, so don't hardcode macOS —
    on Linux/Windows the macOS path is absent and every MCP-dependent skill would be
    misjudged as having no Desktop MCPs available."""
    if sys.platform == "darwin":
        return (HOME / "Library" / "Application Support" / "Claude"
                / "claude_desktop_config.json")
    if sys.platform == "win32":
        base = os.environ.get("APPDATA")
        root = Path(base) if base else HOME / "AppData" / "Roaming"
        return root / "Claude" / "claude_desktop_config.json"
    return HOME / ".config" / "Claude" / "claude_desktop_config.json"  # Linux / other.


DESKTOP_CONFIG = _desktop_config_path()

# Resource dirs worth shipping (kept in sync with package.py's KEEP_DIRS).
RESOURCE_DIRS = {"references", "reference", "scripts", "templates", "assets",
                 "examples", "themes", "core", "style-prompts", "canvas-fonts",
                 "docs", "evals"}


def load_json(path):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8-sig"))
    except Exception:
        return None


def load_dict(path):
    data = load_json(path)
    return data if isinstance(data, dict) else {}


def applies_here(install):
    """An install at project or local scope belongs to the project at its
    projectPath and loads there, or in a folder inside it. Any other install, or
    one without a projectPath, counts here."""
    project = install.get("projectPath")
    if install.get("scope") not in ("project", "local") or not isinstance(project, str):
        return True
    here, project = Path.cwd().resolve(), Path(project).expanduser().resolve()
    return project == here or project in here.parents


def installed_versions():
    """({(repo, plugin): [(version, version_dir)]}, missing, elsewhere) from
    installed_plugins.json, the record of what Claude Code loads. One plugin has
    an entry per install scope; each distinct directory counts once. `missing`
    names the installs whose directory is gone, and `elsewhere` the installs of
    a plugin installed only for other projects. The versions are None only when
    the file is absent or unreadable: a file that records nothing is a record."""
    plugins = load_dict(PLUGINS / "installed_plugins.json").get("plugins")
    if not isinstance(plugins, dict):
        return None, [], []
    out, missing, elsewhere = {}, [], []
    for plugin_id, installs in plugins.items():
        plugin, _, repo = str(plugin_id).partition("@")
        if isinstance(installs, dict):
            installs = [installs]  # Version 1 of the file kept one record per plugin.
        installs = [i for i in installs if isinstance(i, dict)] if isinstance(installs, list) else []
        here = [install for install in installs if applies_here(install)]
        if not here:
            elsewhere += [{"repo": repo or None, "plugin": plugin, "scope": install.get("scope"),
                           "project": install.get("projectPath")} for install in installs]
        for install in here:
            path = install.get("installPath")
            if not isinstance(path, str) or not Path(path).is_dir():
                missing.append({"repo": repo or None, "plugin": plugin, "path": path})
                continue
            found = out.setdefault((repo or None, plugin), [])
            if Path(path) not in [vd for _, vd in found]:
                found.append((str(install.get("version") or Path(path).name), Path(path)))
    return out, missing, elsewhere


def cached_versions():
    """Fallback without install records: per cached plugin, the most recently
    modified version directory that Claude Code has not marked as replaced. An
    update or uninstall leaves `.orphaned_at` in the old directory, and writing
    that marker makes the old directory the newest one, so it has to be skipped."""
    out = {}
    for plugin_dir in sorted(CACHE.glob("*/*")):
        try:
            live = [(d.stat().st_mtime, d.name, d) for d in plugin_dir.iterdir()
                    if d.is_dir() and not (d / ".orphaned_at").exists()]
        except OSError:
            continue
        if live:
            newest = max(live)[2]
            out[(plugin_dir.parent.name, plugin_dir.name)] = [(newest.name, newest)]
    return out


def marketplace_entry(version_dir, repo, plugin):
    """The plugin's entry in its marketplace.json. A plugin whose source is the
    marketplace root carries the file inside its cached version, which matches the
    installed version exactly, so that copy is tried before the marketplace clone."""
    candidates = [version_dir]
    if repo:
        location = load_dict(PLUGINS / "known_marketplaces.json").get(repo)
        candidates.append(PLUGINS / "marketplaces" / repo)
        if isinstance(location, dict) and isinstance(location.get("installLocation"), str):
            candidates.append(Path(location["installLocation"]))
    for base in candidates:
        entries = load_dict(base / ".claude-plugin" / "marketplace.json").get("plugins")
        for entry in entries if isinstance(entries, list) else []:
            if isinstance(entry, dict) and entry.get("name") == plugin:
                return entry
    return {}


def as_paths(value):
    if isinstance(value, str):
        return [value]
    return [v for v in value if isinstance(v, str)] if isinstance(value, list) else []


def skill_dirs_of(version_dir, repo, plugin):
    """The skill directories this plugin version loads, by the rules in Claude
    Code's plugins reference: the default skills/ scan, plus every path under a
    `skills` key in plugin.json or the marketplace entry. A marketplace entry
    whose source is the marketplace root and that lists skills loads only those.
    A SKILL.md at the plugin root is a skill when "." is listed, or when there is
    neither a skills/ directory nor a `skills` key."""
    entry = marketplace_entry(version_dir, repo, plugin)
    listed = as_paths(entry.get("skills"))
    only_listed = bool(listed) and entry.get("source") in (".", "./")
    listed += as_paths(load_dict(version_dir / ".claude-plugin" / "plugin.json").get("skills"))
    if not listed and not (version_dir / "skills").is_dir():
        # Only the root SKILL.md, never a folder below it, the way "." would be.
        return [version_dir] if (version_dir / "SKILL.md").is_file() else []
    root, found = version_dir.resolve(), {}
    for rel in ([] if only_listed else ["skills"]) + listed:
        base = version_dir / rel
        if root not in (base.resolve(), *base.resolve().parents):
            continue  # Claude Code rejects a path that leaves the plugin.
        # A path is one skill folder, or a directory of them.
        if (base / "SKILL.md").is_file():
            dirs = [base]
        else:
            dirs = [d for d in sorted(base.glob("*")) if (d / "SKILL.md").is_file()]
        for skill_dir in dirs:
            found.setdefault(skill_dir.resolve(), skill_dir)
    return [version_dir if real == root else skill_dir for real, skill_dir in found.items()]


def root_listing(skill_dir):
    """What sits at the skill root beside SKILL.md: the KEEP dirs the packager
    ships whole, the other directories, and the loose files."""
    resource, other, files = [], [], []
    try:
        for child in sorted(skill_dir.iterdir()):
            if child.is_dir():
                (resource if child.name in RESOURCE_DIRS else other).append(child.name)
            elif child.name != "SKILL.md":
                files.append(child.name)
    except OSError:
        pass
    return resource, other, files


def skill_record(kind, repo, plugin, version, skill_dir, dir_name):
    skill_md = skill_dir / "SKILL.md"
    fields = read_frontmatter(skill_md)
    resource, other, files = root_listing(skill_dir)
    return {
        "kind": kind, "repo": repo, "plugin": plugin, "plugin_version": version,
        # Claude Code names a skill by its frontmatter and falls back to the directory.
        "name": frontmatter_name(fields) or dir_name, "dir_name": dir_name,
        "skill_md": str(skill_md), "skill_dir": str(skill_dir),
        "resource_dirs": resource, "other_dirs": other, "root_files": files,
        "upload_issues": upload_issues(fields),
    }


def inventory_plugins(enabled):
    """One record per skill of each installed plugin, marked with whether the
    plugin is enabled. Returns (records, whether installed_plugins.json was the
    source, the installs whose directory is gone, the installs for other projects)."""
    versions, missing, elsewhere = installed_versions()
    known = versions is not None
    records = []
    for (repo, plugin), installs in sorted((versions if known else cached_versions()).items(),
                                           key=lambda item: (item[0][0] or "", item[0][1])):
        for version, version_dir in installs:
            on = is_enabled(enabled, repo, plugin, version_dir)
            for skill_dir in skill_dirs_of(version_dir, repo, plugin):
                # A root-level SKILL.md (e.g. humanizer) takes the plugin's name.
                dir_name = plugin if skill_dir == version_dir else skill_dir.name
                record = skill_record("plugin", repo, plugin, version, skill_dir, dir_name)
                record["enabled"] = on
                records.append(record)
    return records, known, missing, elsewhere


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
            record = skill_record("personal", None, None, None, real, entry.name)
            record["enabled"] = True  # Personal skills are always the user's own — keep the schema uniform.
            records.append(record)
    return records


def enabled_plugins():
    """enabledPlugins merged key by key over the settings files, a later file
    overriding an earlier one. None when no file sets it, which is different from
    a file that sets every plugin to false."""
    merged, known = {}, False
    for path in SETTINGS:
        enabled = load_dict(path).get("enabledPlugins")
        if isinstance(enabled, dict):
            known = True
            merged.update({str(k): bool(v) for k, v in enabled.items()})
        elif isinstance(enabled, list):
            known = True
            merged.update({str(k): True for k in enabled})
    return merged if known else None


def is_enabled(enabled, repo, plugin, version_dir):
    """A plugin is keyed `<plugin>@<marketplace>`, so two marketplaces' same-named
    plugins are told apart. A key without the marketplace names the plugin alone.
    A plugin no key names is as its defaultEnabled says, the marketplace entry's
    over the manifest's, and enabled when neither sets it."""
    if enabled is None:
        return None
    for key in (f"{plugin}@{repo}", plugin):
        if key in enabled:
            return enabled[key]
    for source in (marketplace_entry(version_dir, repo, plugin),
                   load_dict(version_dir / ".claude-plugin" / "plugin.json")):
        if isinstance(source.get("defaultEnabled"), bool):
            return source["defaultEnabled"]
    return True


def desktop_mcp_servers():
    """(servers, found, error). `found` is true only when the config parsed, and
    `error` says why a config that is there could not be used."""
    try:
        data = json.loads(DESKTOP_CONFIG.read_text(encoding="utf-8-sig"))
    except FileNotFoundError:
        return [], False, None
    except (OSError, ValueError) as exc:
        return [], False, str(exc)
    if not isinstance(data, dict):
        return [], False, "the top level is not a JSON object"
    servers = data.get("mcpServers")
    return (sorted(servers) if isinstance(servers, dict) else []), True, None


def desktop_extensions():
    """Extensions installed from Desktop's Extensions screen are MCP servers that
    never appear in claude_desktop_config.json. The app records them beside it in
    extensions-installations.json, an internal file with no published format, so
    this reads it loosely and returns nothing for a shape it does not recognize."""
    found = load_dict(DESKTOP_CONFIG.parent / "extensions-installations.json").get("extensions")
    if isinstance(found, dict):
        found = [dict(ext, id=ext.get("id") or key) for key, ext in found.items()
                 if isinstance(ext, dict)]
    out = []
    for ext in found if isinstance(found, list) else []:
        manifest = ext.get("manifest") if isinstance(ext, dict) else None
        manifest = manifest if isinstance(manifest, dict) else {}
        ext_id = ext.get("id") if isinstance(ext, dict) else None
        name = manifest.get("name") or manifest.get("display_name") or ext_id
        if name:
            out.append({"id": str(ext_id or name), "name": str(name)})
    return sorted(out, key=lambda ext: (ext["name"].lower(), ext["id"]))


def main():
    enabled = enabled_plugins()
    plugins, installed_known, missing, elsewhere = inventory_plugins(enabled)
    personal = inventory_personal()
    # A cached-but-disabled plugin isn't one of "the user's skills", so it comes off the
    # export work-list: one a settings file turns off, or one no file names whose
    # defaultEnabled is false. Only when enabledPlugins is actually known — with
    # enabled==None we can't tell, so keep everything rather than guess. The skills taken
    # off are named in skipped_disabled, never dropped silently.
    dropped = [r for r in plugins if r["enabled"] is False]
    plugins = [r for r in plugins if r["enabled"] is not False]
    servers, cfg_found, cfg_error = desktop_mcp_servers()
    extensions = desktop_extensions()
    out = {
        "desktop_mcp_servers": servers,
        "desktop_extensions": extensions,
        "desktop_config_found": cfg_found,
        "desktop_config_error": cfg_error,
        "enabled_plugins_known": enabled is not None,
        "installed_plugins_known": installed_known,
        "plugin_cache_found": CACHE.is_dir(),
        "missing_install_paths": missing,
        "skipped_disabled": [{"repo": r["repo"], "plugin": r["plugin"], "name": r["name"]}
                             for r in dropped],
        "skipped_other_projects": elsewhere,
        "skills": sorted(plugins + personal,
                         key=lambda r: (r["kind"], r.get("plugin") or "", r["name"])),
    }
    json.dump(out, sys.stdout, indent=2)
    sys.stdout.write("\n")
    if cfg_found:
        cfg_note = "config found"
    else:
        cfg_note = "desktop config UNREADABLE" if cfg_error else "NO desktop config"
    cache_note = "" if CACHE.is_dir() else f", NO plugin cache at {CACHE}"
    dropped_note = f", {len(dropped)} disabled-plugin skills skipped" if dropped else ""
    projects = {(e["repo"], e["plugin"]) for e in elsewhere}
    elsewhere_note = (f", {len(projects)} plugins installed only for other projects"
                      if projects else "")
    missing_note = f", {len(missing)} install paths missing" if missing else ""
    print(f"[inventory] {len(plugins)} plugin skills, {len(personal)} personal "
          f"skills, {len(servers)} Desktop MCP servers ({cfg_note}), "
          f"{len(extensions)} Desktop extensions{cache_note}{dropped_note}"
          f"{elsewhere_note}{missing_note}.",
          file=sys.stderr)


if __name__ == "__main__":
    main()
