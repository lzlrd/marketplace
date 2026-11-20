# reload-claude-md

A `/reload-claude-md` command for [Claude Code](https://github.com/anthropics/claude-code) that
re-reads your `CLAUDE.md` memory files from disk and re-anchors the running session to their current
content. Edit a `CLAUDE.md` mid-session, run the command, and the agent picks up the change without a
restart.

Claude Code loads `CLAUDE.md` **at session start** and does not re-read it when it changes. There is
no reload command: `/memory` only opens the files to edit, and compaction re-injects the
project-root file, at the cost of summarising the conversation. So an edit made mid-session is
otherwise ignored. This closes that gap.

```
You: (edit ~/.claude/CLAUDE.md or ./CLAUDE.md)  →  /reload-claude-md
        │  the command re-reads what's in effect and re-anchors the session:
        ▼
   finds   ── user · project-root chain · nested · local CLAUDE.md, plus @imports
   reads   ── their current on-disk bytes (not the stale copy in context)
   diffs   ── what changed since that copy was loaded: added · removed · modified
   adopts  ── the current version as authoritative from here on
        │
        ▼
You: carry on, with the edits now in effect
```

## Invocation

- `/reload-claude-md` reloads every in-effect `CLAUDE.md`.
- `/reload-claude-md <path>` reloads just one file (and its imports).

The full name is `/reload-claude-md:reload-claude-md`; type `/reload-claude-md` and pick it from the
slash menu. It runs only when you type it: Claude cannot start it by itself.

Read-only: it never writes to your memory files. Writing session learnings back *into* `CLAUDE.md` is
the opposite job, which the official `claude-md-management` plugin's `/revise-claude-md` covers.

## Permissions

For the turn it runs in, the command pre-approves two things: its own discovery script, which only
lists file paths and asks git where the repository roots are, and reads of files named `CLAUDE.md`
or `CLAUDE.local.md` (a `CLAUDE.md` that links to a file with another name can still prompt).
Everything else follows your usual permission rules, so searching your user settings file or
reading an imported file outside the working directory can prompt.

Settings files can hold credentials under `env`, so the command never reads them whole. It searches
each one for the `claudeMdExcludes` key with a pattern that prints that key and its list and
nothing else.

## Scope

It reloads `CLAUDE.md` and `CLAUDE.local.md` files and what they import. An import in a project
file that points outside the working directory is followed without a question only if Claude Code
had already loaded it. For a newly added one Claude asks first; where it cannot ask, it names the
file in the report, and passing that path loads it. `.claude/rules/` files, and an `AGENTS.md` that
no `CLAUDE.md` imports or links to, are not reloaded.

Discovery skips `.git`, `node_modules`, `.venv`, `venv` and `.claude/worktrees`, and searches five
directory levels below the working directory; pass a path to reload a file it does not find. Like
Claude Code, it starts from the working directory's real path, so a directory reached through a
symlink gives the paths the link resolves to. In a git worktree inside its main checkout, as
`claude --worktree` makes, it skips the main checkout's `CLAUDE.md` and `.claude/CLAUDE.md`, which
Claude Code does not load there, and keeps its `CLAUDE.local.md`. Without git, that worktree is not
detected.

It leaves out files and imports that match your `claudeMdExcludes` setting in user, project or
local settings, as Claude Code does, and names them in the report; managed settings are not
checked. A path you pass is loaded even when a pattern matches it. If a settings file cannot be
read, its exclusions are unknown, so a file the session had not loaded is named as not checked
rather than adopted; pass its path to load it. Any other nested copy it finds, such as a vendored
or build-output one, is reloaded and adopted like the rest, whether or not the session had loaded
it; a pattern such as `**/vendor/**/CLAUDE.md` in `claudeMdExcludes` keeps one out. A file reached
by two paths is reloaded once. When nothing changed, the report lists the files it checked.

## Install

```sh
/plugin marketplace add lzlrd/marketplace
/plugin install reload-claude-md@lzlrd
```

If the install summary asks for it, run `/reload-plugins`. Check: `/reload-claude-md` shows in the
command list.

## Structure

```
reload-claude-md/
├── .claude-plugin/
│   └── plugin.json           # manifest
├── skills/reload-claude-md/
│   ├── SKILL.md              # the reload procedure (runs when you type /reload-claude-md)
│   └── scripts/
│       └── discover.sh       # lists the memory files in effect
└── tst/
    └── run.sh                # tests for discovery and for what the command pre-approves
```

## Tests

From this directory:

```sh
bash tst/run.sh
```

The tests build a scratch tree under `$TMPDIR` and need bash, git and the standard Unix tools, plus
ripgrep or perl for the settings search. When git, or both ripgrep and perl, are missing, the tests
that need them are skipped, with a line saying so.
