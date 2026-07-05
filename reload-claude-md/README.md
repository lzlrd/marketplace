# reload-claude-md

A `/reload-claude-md` command for [Claude Code](https://github.com/anthropics/claude-code) that
re-reads your `CLAUDE.md` memory files from disk and re-anchors the running session to their current
content. Edit a `CLAUDE.md` mid-session, run the command, and the agent picks up the change — no
restart.

Claude Code loads `CLAUDE.md` **once, at session start**, and never re-reads it. There is no native
reload: `/memory` only opens the files to edit, and only `/compact` re-injects the project-root file
(with side effects). So an edit made mid-session is ignored until you restart. This closes that gap.

```
You: (edit ~/.claude/CLAUDE.md or ./CLAUDE.md)  →  /reload-claude-md
        │  the command re-reads what's in effect and re-anchors the session:
        ▼
   finds   ── user · project-root chain · nested · local CLAUDE.md, plus @imports
   reads   ── their current on-disk bytes (not the stale start-of-session copy)
   diffs   ── what changed since the session began: added · removed · modified
   adopts  ── the current version as authoritative from here on
        │
        ▼
You: carry on, with the edits now in effect
```

## Invocation

- `/reload-claude-md` — reload every in-effect `CLAUDE.md`.
- `/reload-claude-md <path>` — reload just one file (and its imports).

Read-only: it never writes to your memory files. Writing session learnings back *into* `CLAUDE.md` is
the opposite job — the official `claude-md-management` plugin's `/revise-claude-md` covers that.

## Install

```sh
/plugin marketplace add lzlrd/marketplace
/plugin install reload-claude-md@lzlrd
```

Restart the session. Check: `/reload-claude-md` shows in the command list.

## Structure

```
reload-claude-md/
├── .claude-plugin/
│   └── plugin.json           # manifest
└── commands/
    └── reload-claude-md.md    # the reload procedure (runs when you type /reload-claude-md)
```
