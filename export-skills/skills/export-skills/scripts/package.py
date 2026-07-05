#! /usr/bin/env python3
"""Package qualifying skills into upload-ready zips for Claude Desktop.

Reads a qualifiers manifest (produced after classification) and writes curated
zips: one per plugin for plugin skills, one per skill for personal skills. Every
skill folder keeps SKILL.md at its root, which is what claude.ai requires on
upload. This encodes Phase 6 of references/process.md.

Usage:
  package.py --manifest qualifiers.json --out ./skills-export [--mode lenient|strict]

Manifest: {"mode": "lenient",
           "skills": [{"kind": "plugin", "plugin": "taste-skill",
                       "name": "brandkit", "skill_dir": "/abs/path"}, ...]}
"""
import argparse
import json
import re
import sys
import zipfile
from pathlib import Path

KEEP_DIRS = {"references", "reference", "scripts", "templates", "assets",
             "examples", "themes", "core", "style-prompts", "canvas-fonts",
             "docs", "evals"}
DROP_DIRS = {".github", "tests", "src", "node_modules", ".git", "dist", "build",
             "desktop-extension", ".in_use", ".claude-plugin", "eval-viewer",
             "agents", "__pycache__"}
JUNK_FILES = {".DS_Store"}
SECRET_RE = re.compile(
    r"(^|/)(\.env(\.|$)|.*secret.*|.*token.*|.*\.pem$|id_rsa|.*credential.*|.*\.key$)",
    re.I)


def in_drop(path, base):
    return any(part in DROP_DIRS for part in path.relative_to(base).parts[:-1])


def curated_members(skill_dir):
    """Yield (absolute_path, arc_relative_path) for the files worth shipping:
    SKILL.md, everything under a KEEP dir, and any loose root file the SKILL.md
    actually references by name. Repo-noise dirs and junk are dropped so a
    repo-style skill does not bloat the zip or leak stray files."""
    skill_dir = Path(skill_dir)
    members, referenced = [], ""
    skill_md = skill_dir / "SKILL.md"
    if skill_md.is_file():
        members.append((skill_md, Path("SKILL.md")))
        referenced = skill_md.read_text(errors="ignore")
    for child in sorted(skill_dir.iterdir()):
        if child.name in JUNK_FILES:
            continue
        if child.is_dir() and child.name in KEEP_DIRS:
            for f in sorted(child.rglob("*")):
                if f.is_file() and f.name not in JUNK_FILES and not in_drop(f, skill_dir):
                    members.append((f, f.relative_to(skill_dir)))
        elif child.is_file() and child.name != "SKILL.md" and child.name in referenced:
            members.append((child, Path(child.name)))
    return members


def add_skill(zf, skill_dir, folder):
    added = []
    for abspath, rel in curated_members(skill_dir):
        arc = f"{folder}/{rel.as_posix()}"
        zf.write(abspath, arc)
        added.append((arc, abspath.stat().st_size))
    return added


def verify(added):
    names = {a for a, _ in added}
    folders = {a.split("/")[0] for a in names}
    issues = [f"MISSING SKILL.md at root of {f}/" for f in sorted(folders)
              if f"{f}/SKILL.md" not in names]
    secrets = sorted(a for a in names if SECRET_RE.search(a))
    biggest = sorted(added, key=lambda x: x[1], reverse=True)[:3]
    return issues, secrets, biggest


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--manifest", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--mode", default=None)
    args = ap.parse_args()

    manifest = json.loads(Path(args.manifest).read_text())
    mode = args.mode or manifest.get("mode", "lenient")
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    plugin_groups, personal = {}, []
    for s in manifest["skills"]:
        if s.get("kind") == "personal" or not s.get("plugin"):
            personal.append(s)
        else:
            plugin_groups.setdefault(s["plugin"], []).append(s)

    report = []
    for plugin, group in sorted(plugin_groups.items()):
        zip_path = out / f"{plugin}.zip"
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            added = [m for s in group for m in add_skill(zf, s["skill_dir"], s["name"])]
        report.append((zip_path, [s["name"] for s in group], verify(added)))
    for s in sorted(personal, key=lambda x: x["name"]):
        zip_path = out / f"{s['name']}.zip"
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            added = add_skill(zf, s["skill_dir"], s["name"])
        report.append((zip_path, [s["name"]], verify(added)))

    print(f"# Packaged {len(report)} zip(s) in {mode} mode -> {out}\n")
    ok = True
    for zip_path, names, (issues, secrets, biggest) in report:
        print(f"## {zip_path.name}  ({', '.join(names)})")
        for arc, size in biggest:
            print(f"   {size:>9,} B  {arc}")
        for name in secrets:
            ok = False
            print(f"   ! credential-ish member, review before upload: {name}")
        for issue in issues:
            ok = False
            print(f"   ! {issue}")
        print()
    print("All zips passed the structural checks."
          if ok else "Review the ! warnings above before uploading.")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
