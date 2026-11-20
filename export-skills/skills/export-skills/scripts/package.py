#! /usr/bin/env python3
"""Package qualifying skills into upload-ready zips for Claude Desktop.

Reads a qualifiers manifest (produced after classification) and writes curated
zips: one per skill, each holding a single folder named after the skill with
SKILL.md at that folder's root, which is what claude.ai requires on upload. A
skill that breaks one of claude.ai's upload rules gets no zip: it is listed with
the reason and the run exits non-zero. This encodes Phase 6 of
references/process.md.

Usage:
  package.py --manifest qualifiers.json --out ./skills-export [--mode lenient|strict]

Manifest: {"mode": "lenient",
           "skills": [{"kind": "plugin", "repo": "some-marketplace",
                       "plugin": "taste-skill", "name": "brandkit",
                       "skill_dir": "/abs/path"}, ...]}

Each entry is an inventory.py record; the keys not shown here are ignored.
"""
import argparse
import contextlib
import fnmatch
import json
import os
import re
import sys
import tempfile
import zipfile
from pathlib import Path

sys.dont_write_bytecode = True  # Keep __pycache__ out of the installed plugin.
from skill_rules import frontmatter_name, read_frontmatter, upload_issues, upload_notes

MODES = ("lenient", "strict")
KEEP_DIRS = {"references", "reference", "scripts", "templates", "assets",
             "examples", "themes", "core", "style-prompts", "canvas-fonts",
             "docs", "evals"}
DROP_DIRS = {".github", "tests", "src", "node_modules", ".git", "dist", "build",
             "desktop-extension", ".in_use", ".claude-plugin", "eval-viewer",
             "agents", "__pycache__", ".venv", "venv", ".pytest_cache",
             ".mypy_cache", ".ruff_cache"}
# The DROP names that stay out even when the skill's own text mentions them.
NOISE_DIRS = {".github", "node_modules", ".git", ".in_use", ".claude-plugin",
              "__pycache__", ".venv", "venv", ".pytest_cache", ".mypy_cache",
              ".ruff_cache"}
JUNK_FILES = {".DS_Store"}
JUNK_SUFFIXES = (".pyc", ".pyo")
MAX_FILES = 200  # This packager's own limit: Anthropic's pages give no file count for an upload.
WALK_CAP = 5000  # Stop collecting a skill this far over the limit; it is refused either way.
INDEX = ".export-skills-index.json"  # The zips this packager wrote, or is writing, into --out.
# The mode open() gives a new file. mkstemp gives 0600, so the zips and the index
# are set back to this.
UMASK = os.umask(0o077)
os.umask(UMASK)

# Where a path in a skill's text starts from the skill root: a token start, `./`,
# or the skill-dir variable. Not inside a word, a file name or another path.
MENTION_START = r"(?:(?<![\w.\-/\\])(?:\./)?|(?<=\$\{CLAUDE_SKILL_DIR\}/))"

# File names that are credentials by convention. These never go into a zip.
CREDENTIAL_FILES = (".env", ".env.*", ".envrc", "id_rsa*", "id_dsa*", "id_ed25519*",
                    "id_ecdsa*", "*.pem", "*.p12", "*.pfx", "*.key", "*.p8", "*.ppk", "*.jks",
                    "*.keystore", "*.kdbx", "secring.*", ".npmrc", ".netrc", ".pypirc",
                    ".pgpass", ".git-credentials", ".htpasswd", "kubeconfig",
                    "credentials*.json", "service-account*.json", "client_secret*.json",
                    "token.json", "token.pickle")
NOT_CREDENTIALS = (".example", ".sample", ".template", ".pub")
# Names that merely look credential-related. These ship, with a warning.
SECRET_RE = re.compile(r"secret|token|credential|apikey|api[_-]key", re.I)
SECRET_DIRS = {"secrets", "credentials", ".ssh", ".aws", ".gnupg"}


def is_credential_file(name):
    name = name.lower()
    return (not name.endswith(NOT_CREDENTIALS)
            and any(fnmatch.fnmatchcase(name, pattern) for pattern in CREDENTIAL_FILES))


def is_private_dir(name):
    """Dot directories (.claude, .aws, .ssh and the like hold settings and keys)
    and secrets directories. These never ship, at any depth, mentioned or not."""
    return name.startswith(".") or name.lower() in SECRET_DIRS


def private_link(path):
    """True when `path` is a symlink to a credential file, to a file in a dot or
    secrets directory, or to such a directory, whatever the link itself is called.
    Only the target's own name and its directory's count, not every directory on
    its path: the plugin cache itself sits under ~/.claude."""
    if not path.is_symlink():
        return False
    real = Path(os.path.realpath(path))
    if real.is_dir():
        return is_private_dir(real.name)
    return is_credential_file(real.name) or is_private_dir(real.parent.name)


def looks_secret(rel):
    """Advisory check on a member's file name. Only the name counts, so a skill
    called design-tokens does not flag every file; a directory named for secrets
    never ships at all."""
    return bool(SECRET_RE.search(rel.name))


def named_in(name, text):
    """True when `text` mentions the file name as a whole word, written from the
    skill root (bare, after `./` or after `${CLAUDE_SKILL_DIR}/`): `.env.example`
    does not also name `.env`, nor `LICENSE-NOTES` a file called `LICENSE`, and
    `~/.claude/settings.json` does not name a root `settings.json`."""
    return re.search(MENTION_START + re.escape(name) + r"(?![\w\-])(?!\.\w)", text) is not None


def points_into(rel_dir, texts):
    """True when one of the texts mentions a path inside `rel_dir`, written from
    the skill root (bare, after `./` or after `${CLAUDE_SKILL_DIR}/`) or relative
    to the directory the text itself sits in, `../` included. A name that goes on
    from another path, as in `~/.claude/` or `/tmp/build/`, is outside the skill."""
    for parent, text in texts:
        spellings, base, up = {rel_dir}, parent, ""
        while base != ".":
            if rel_dir.startswith(base + "/"):
                spellings.add(up + rel_dir[len(base) + 1:])
            base, up = Path(base).parent.as_posix(), up + "../"
        spellings.add(up + rel_dir)
        if any(re.search(MENTION_START + re.escape(s) + "/", text) for s in spellings):
            return True
    return False


def count_files(path):
    return sum(len(files) for _, _, files in os.walk(path))


def plural(n, noun):
    return f"{n} {noun}{'' if n == 1 else 's'}"


def walk_kept(top, skill_dir, wanted, members, dropped, denied, linked):
    """Collect the files under `top` into `members`. A symlinked directory is
    followed like a real one, unless it leads back to one of its own parents. A
    private directory is skipped, and so is a DROP-named one unless it is in
    `wanted`; each is noted in `dropped`. A credential file is noted in `denied`,
    and a symlink to either, file or directory, in `linked`."""
    for here, dirnames, filenames in os.walk(top, followlinks=True):
        here = Path(here)
        if len(members) > WALK_CAP:
            return
        if here.is_symlink() and os.path.realpath(here) in map(os.path.realpath, here.parents):
            dirnames[:] = []
            continue
        for name in sorted(dirnames):
            rel = (here / name).relative_to(skill_dir).as_posix()
            if private_link(here / name):
                linked.append(rel + "/")
                dirnames.remove(name)
            elif is_private_dir(name) or (name in DROP_DIRS and rel not in wanted):
                dropped.add(rel)
                dirnames.remove(name)
        dirnames.sort()
        for name in sorted(filenames):
            path = here / name
            if name in JUNK_FILES or name.endswith(JUNK_SUFFIXES) or not path.is_file():
                continue
            rel = path.relative_to(skill_dir)
            if private_link(path):
                linked.append(rel.as_posix())
            elif is_credential_file(name):
                denied.append(rel.as_posix())
            else:
                members.append((path, rel))


def curated_members(skill_dir):
    """Return (members, left_out). `members` is [(absolute_path, arc_relative_path)]
    for the files worth shipping: SKILL.md, everything under a KEEP dir, any other
    directory that SKILL.md or a shipped Markdown file points into, and any loose
    root file SKILL.md names. Repo-noise dirs, private dirs, junk, credential
    files and symlinks to either are dropped so a repo-style skill does not bloat
    the zip or leak stray files. `left_out` says what stayed behind, one line per
    reason, so nothing is dropped without the listing showing it."""
    skill_dir = Path(skill_dir)
    skill_md = skill_dir / "SKILL.md"
    skill_text = skill_md.read_text(encoding="utf-8", errors="ignore")
    children = sorted(skill_dir.iterdir())
    wanted = set()  # Directories that ship because the skill's own text points into them.
    while True:
        members, dropped, denied, linked = [(skill_md, Path("SKILL.md"))], set(), [], []
        for child in children:
            if not child.is_dir():
                continue
            if private_link(child):
                linked.append(child.name + "/")
            elif child.name in KEEP_DIRS or child.name in wanted:
                walk_kept(child, skill_dir, wanted, members, dropped, denied, linked)
            else:
                dropped.add(child.name)
        texts = [(rel.parent.as_posix(), path.read_text(encoding="utf-8", errors="ignore"))
                 for path, rel in members if rel.suffix.lower() == ".md"]
        # Noise and private directories never ship on a mention.
        found = {d for d in dropped if not is_private_dir(Path(d).name)
                 and Path(d).name not in NOISE_DIRS and points_into(d, texts)}
        if not found:
            break
        wanted |= found
    unnamed = []
    for child in children:
        if not child.is_file() or child.name == "SKILL.md" or child.name in JUNK_FILES:
            continue
        if private_link(child):
            linked.append(child.name)
        elif is_credential_file(child.name):
            denied.append(child.name)
        elif named_in(child.name, skill_text):
            members.append((child, Path(child.name)))
        else:
            unnamed.append(child.name)
    left_out = []
    if dropped:
        dirs = [f"{d}/ ({plural(count_files(skill_dir / d), 'file')})" for d in sorted(dropped)]
        left_out.append("left out, directories: " + ", ".join(dirs))
    if unnamed:
        left_out.append("left out, not named in SKILL.md: " + ", ".join(sorted(unnamed)))
    if denied:
        left_out.append("left out, credential file name: " + ", ".join(sorted(denied)))
    if linked:
        left_out.append("left out, symlink to a credential file or a dot or secrets directory: "
                        + ", ".join(sorted(linked)))
    return sorted(members, key=lambda m: m[1].as_posix()), left_out


def label_of(entry):
    """How the listing names an entry: repo/plugin/name, as far as it has them."""
    parts = [entry.get(key) for key in ("repo", "plugin", "name")]
    return "/".join(str(p) for p in parts if p) or "(unnamed entry)"


def plan(entry):
    """Work out one entry's zip name and members, with every reason it cannot be
    uploaded. Nothing is written here, so a skill with an issue leaves no zip."""
    job = {"label": "(entry is not an object)", "name": None, "stem": None,
           "members": [], "left_out": [], "issues": [], "detail": [], "notes": []}
    if not isinstance(entry, dict):
        job["issues"].append("manifest entry is not an object")
        return job
    job["label"] = label_of(entry)
    name, skill_dir = entry.get("name"), entry.get("skill_dir")
    if not isinstance(name, str) or not name:
        job["issues"].append("entry has no name")
    else:
        # One zip per skill (claude.ai uploads a single skill at a time). Plugin skills
        # get a repo-and-plugin-prefixed filename so same-named skills from different
        # marketplaces (or two plugins) don't collide on disk; the folder inside the zip
        # stays the bare skill name so claude.ai names the upload correctly.
        parts = [name] if entry.get("kind") == "personal" else [
            entry.get("repo"), entry.get("plugin"), name]
        job["name"], job["stem"] = name, "-".join(str(p) for p in parts if p)
    if not isinstance(skill_dir, str) or not skill_dir:
        job["issues"].append("entry has no skill_dir")
        return job
    if not Path(skill_dir).is_dir():
        job["issues"].append(f"skill_dir does not exist: {skill_dir}")
        return job
    if not (Path(skill_dir) / "SKILL.md").is_file():
        job["issues"].append(f"no SKILL.md at the root of {skill_dir}")
        return job
    fields = read_frontmatter(Path(skill_dir) / "SKILL.md")
    job["issues"] += upload_issues(fields)
    job["notes"] = upload_notes(fields)
    declared = frontmatter_name(fields)
    if job["name"] and declared and declared != job["name"]:
        job["issues"].append(f'entry name "{job["name"]}" is not the frontmatter name '
                             f'"{declared}", which the folder in the zip has to match')
    try:
        job["members"], job["left_out"] = curated_members(skill_dir)
    except OSError as exc:
        job["issues"].append(f"could not read the skill: {exc}")
        return job
    total = len(job["members"])
    if total > MAX_FILES:
        job["issues"].append(f"{'over ' if total > WALK_CAP else ''}{total:,} files exceeds this "
                             f"packager's {MAX_FILES}-file limit; trim a copy of this skill and "
                             f"package the copy")
        # Show where the files are, so it is clear what to trim.
        tops = {}
        for path, rel in job["members"]:
            top = rel.parts[0] + "/" if len(rel.parts) > 1 else "(root files)"
            count, size = tops.get(top, (0, 0))
            tops[top] = (count + 1, size + path.stat().st_size)
        job["detail"] = [f"{top}  {plural(count, 'file')}  {size:,} B"
                         for top, (count, size) in sorted(tops.items())]
    return job


def flag_shared_names(jobs):
    """Two entries with one zip name would overwrite each other, so neither is
    written. Names are compared without case, as macOS and Windows compare them.
    An entry refused for another reason writes nothing, so it is not counted."""
    by_stem = {}
    for job in jobs:
        if job["stem"] and not job["issues"]:
            by_stem.setdefault(job["stem"].lower(), []).append(job)
    for group in by_stem.values():
        for job in group if len(group) > 1 else []:
            others = ", ".join(other["label"] for other in group if other is not job)
            job["issues"].append(f"{job['stem']}.zip is also the zip name of {others}; "
                                 f"package one of them into another --out folder")


def read_index(out):
    """The zip names the last run into this folder recorded, plain names only."""
    try:
        names = json.loads((out / INDEX).read_text(encoding="utf-8")).get("zips")
    except (OSError, ValueError, AttributeError):
        return []
    return [name for name in names if isinstance(name, str) and name.endswith(".zip")
            and Path(name).name == name] if isinstance(names, list) else []


@contextlib.contextmanager
def replacing(path):
    """Yield a new binary file whose content then replaces `path`. The file is
    created beside `path` under a random name that nothing else has, so a file or
    symlink already in --out is never opened, followed or overwritten, and
    renaming it over `path` replaces a symlink there rather than its target. On
    any failure the file is removed and `path` is left as it was."""
    fd, part = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".part", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as file:
            if hasattr(os, "fchmod"):
                os.fchmod(file.fileno(), 0o666 & ~UMASK)
            yield file
        os.replace(part, path)
    except BaseException:
        Path(part).unlink(missing_ok=True)
        raise


def write_index(out, names):
    """Record the zips this packager owns in --out. The index is replaced whole,
    so a run that stops partway leaves the previous one."""
    with replacing(out / INDEX) as file:
        file.write((json.dumps({"zips": sorted(set(names))}, indent=2) + "\n").encode("utf-8"))


def owned(path, index):
    """True when the index records `path` and it is still a plain file."""
    return path.name in index and path.is_file() and not path.is_symlink()


def remove_previous(out, index):
    """Delete the zips the index records, and nothing else: --out is the caller's
    folder and may hold unrelated files."""
    removed = [name for name in index if owned(out / name, index)]
    for name in removed:
        (out / name).unlink()
    return removed


def earlier_export(path, name):
    """True when `path` holds only the folder `name/`, with SKILL.md at its root.
    That is what every version of this packager writes for the skill, so the zip
    is an export from a version that kept no index, or from a run whose index was
    lost. A zip with anything else in it, such as the `__MACOSX/` folder Finder
    adds, does not match."""
    if path.is_symlink() or not path.is_file():
        return False
    try:
        with zipfile.ZipFile(path) as zf:
            arcs = zf.namelist()
    except (OSError, ValueError, zipfile.BadZipFile):
        return False
    return f"{name}/SKILL.md" in arcs and all(arc.startswith(f"{name}/") for arc in arcs)


def write_zip(out, job):
    """Write one job's zip under a temporary name and move it into place, so a
    failure partway through leaves no half-written zip behind."""
    try:
        with replacing(out / f"{job['stem']}.zip") as file:
            with zipfile.ZipFile(file, "w", zipfile.ZIP_DEFLATED, strict_timestamps=False) as zf:
                for path, rel in job["members"]:
                    zf.write(path, f"{job['name']}/{rel.as_posix()}")
    except OSError as exc:
        job["issues"].append(f"could not write the zip: {exc}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--manifest", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--mode", choices=MODES, default=None)
    args = ap.parse_args()

    try:
        manifest = json.loads(Path(args.manifest).read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        ap.error(f"cannot read the manifest: {exc}")
    entries = manifest.get("skills") if isinstance(manifest, dict) else None
    if not isinstance(entries, list):
        ap.error('the manifest needs a "skills" list')
    # The mode only labels the listing (the manifest already holds the mode's
    # qualifiers), so the one thing to check is that the two statements of it agree.
    stated = manifest.get("mode")
    if stated is not None and stated not in MODES:
        ap.error(f"the manifest's mode is {stated!r}; it must be one of {', '.join(MODES)}")
    if args.mode and stated and args.mode != stated:
        ap.error(f"--mode {args.mode} disagrees with the manifest's mode {stated}")
    mode = args.mode or stated or "lenient"

    jobs = [plan(entry) for entry in entries]
    for job in jobs:
        # The zip name becomes a file in --out, so it must not be a path.
        if job["stem"] and (re.search(r"[/\\\0]", job["stem"]) or job["stem"].startswith(".")):
            job["issues"].append(f'zip name "{job["stem"]}.zip" is not a plain file name')
    flag_shared_names(jobs)
    jobs.sort(key=lambda job: (job["stem"] or "", job["label"]))

    out = Path(args.out)
    replaced = []
    try:
        index = read_index(out)
        for job in jobs:
            if job["issues"]:
                continue
            # A file the index does not record is not this packager's to overwrite,
            # unless it is an earlier export of this same skill.
            target = out / f"{job['stem']}.zip"
            if (target.exists() or target.is_symlink()) and not owned(target, index):
                if earlier_export(target, job["name"]):
                    replaced.append(target.name)
                else:
                    job["issues"].append(f"{target.name} is already in {out} and is not an "
                                         f"export of this skill; move it, or package into "
                                         f"another --out folder")
        planned = [f"{job['stem']}.zip" for job in jobs if not job["issues"]]
        # Record the zips before any is written, so a run that stops partway still
        # owns them. This also makes sure the folder takes a file before anything
        # in it is removed.
        out.mkdir(parents=True, exist_ok=True)
        write_index(out, index + planned)
    except OSError as exc:
        ap.error(f"cannot use --out: {exc}")
    previous = remove_previous(out, index)
    for job in jobs:
        if not job["issues"]:
            write_zip(out, job)
    written = [f"{job['stem']}.zip" for job in jobs if not job["issues"]]
    try:
        write_index(out, written)
    except OSError as exc:
        # The index written above still records every zip this run wrote.
        print(f"Note: could not update {out / INDEX} ({exc}); it still lists every zip "
              f"this run wrote", file=sys.stderr)

    print(f"# Packaged {len(written)} of {plural(len(jobs), 'skill')} as per-skill zips "
          f"in {mode} mode -> {out}\n")
    flagged = False
    for job in jobs:
        n_files = len(job["members"])
        if job["issues"]:
            print(f"## NOT PACKAGED  {job['label']}")
        else:
            size = (out / f"{job['stem']}.zip").stat().st_size
            print(f"## {job['stem']}.zip  ({job['name']}, {plural(n_files, 'file')}, "
                  f"{size:,} B zipped)")
            biggest = sorted(job["members"], key=lambda m: m[0].stat().st_size, reverse=True)[:3]
            for path, rel in biggest:
                print(f"   {path.stat().st_size:>9,} B  {job['name']}/{rel.as_posix()}")
        # Why a skill has no zip. These gate the exit code.
        for issue in job["issues"]:
            print(f"   ! {issue}")
        for line in job["detail"]:
            print(f"       {line}")
        for line in job["left_out"]:
            print(f"   - {line}")
        # Where Anthropic's pages disagree. These do not gate the exit code.
        for note in job["notes"] if not job["issues"] else []:
            print(f"   ? {note}")
        # Credential-ish names are an advisory heuristic (a file literally named
        # "token-helper.md" is usually benign), so warn but don't fail the run on them.
        for _, rel in job["members"] if not job["issues"] else []:
            if looks_secret(rel):
                flagged = True
                print(f"   ! credential-ish member, review before upload: "
                      f"{job['name']}/{rel.as_posix()}")
        print()
    stale = sorted(set(previous) - set(written))
    if stale:
        print(f"Removed from the previous run into this folder: {', '.join(stale)}")
    replaced = [name for name in replaced if name in written]
    if replaced:
        print(f"Replaced earlier exports of the same skills, which the index did not list: "
              f"{', '.join(replaced)}")
    for zip_path in sorted(out.glob("*.zip")):
        if zip_path.name not in written:
            print(f"! In this folder but not written by this run: {zip_path.name}")
    if flagged:
        print("Note: credential-ish filenames were flagged above — eyeball them, but they don't block upload.")
    refused = len(jobs) - len(written)
    print("All zips passed the upload checks." if not refused
          else f"{plural(refused, 'skill')} not packaged: see the ! lines above.")
    return 1 if refused else 0


if __name__ == "__main__":
    sys.exit(main())
