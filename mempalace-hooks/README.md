# mempalace-hooks

Wires the [`mempalace`](https://pypi.org/project/mempalace/) memory server into [Claude Code](https://code.claude.com/docs/en/overview). A few directive hooks and a managed `CLAUDE.md` block give Claude durable, cross-session memory: it loads palace context at session start, pulls your writing or coding voice before it writes or codes, and keeps a per-day session diary. The hooks never read or write memory themselves: they nudge Claude, who calls the `mempalace` MCP (or the CLI as fallback).

## What It Does

| Piece | When | What it does |
|---|---|---|
| **`CLAUDE.md` block** | Every session | A managed block ([`setup/mempalace-block.md`](setup/mempalace-block.md)) documenting the two-store discipline: **drawers** (verbatim narrative, semantic search) and the **knowledge graph** (atomic `subject → predicate → object` facts, looked up by entity). This is the reference; the hooks keep it salient. |
| **`SessionStart` hook** | `startup` · `resume` · `clear` · `compact` | Injects a short active directive: load durable memory from the palace (the MCP if connected, else the CLI), query before asserting anything about you, a person, or a project, read the newest diary handoff and search `wing_lessons`. |
| **`UserPromptSubmit` hook** | Writing/coding turns only | Injects a directive to pull your recorded voice/conventions (`writing-voice` / `coding-style` rooms) when the turn will produce prose or code and they are not already in context or, if the turn produces neither, before the first later turn that does. It fires at most once per signal per hour per session (`MEMPALACE_STYLE_COOLDOWN`). After the window the directive repeats as a reminder, and Claude pulls again only if the conventions have dropped out of context. |
| **Lessons** | Session start · as you learn | Drawers in `wing_lessons`, one per lesson, first line a one-sentence summary. Corrections and confirmed approaches alike, each with why it mattered and the situation it applies to rather than as a bare "never" or "always" rule, so a later run doesn't re-derive them and can tell when one has stopped applying. Searched by the `SessionStart` directive; lessons that are wrong or outdated get deleted rather than left to rot. |
| **Session diary + `/mempalace-hooks:remember`** | Session start · after edits · on demand | Drawers in `wing_diary`, one room per day (ISO date), each topped with a `## Handoff`. Loaded at `SessionStart`, auto-nudged after edits by `PostToolUse`, written or refreshed by [`/mempalace-hooks:remember`](skills/remember/SKILL.md). The cross-session continuity layer: claude-remember-style, kept in the palace. |
| **`match-style` skill** | Before you write code/prose | Pulls your `coding-style` / `writing-voice` / `working-prefs` from MemPalace and matches them before you write, and runs `/humanizer:humanizer` on prose when the humanizer plugin is installed. Model-invoked: the reliable companion to the `UserPromptSubmit` nudge. [`skills/match-style`](skills/match-style/SKILL.md). |

## Why the Hooks Only Nudge

These hooks are shell commands. A shell command cannot call MCP tools; only Claude can. So they never read or write memory themselves. They inject text that tells Claude to act, against whatever `mempalace` MCP server you have connected (local stdio or remote), or the `mempalace` CLI as a fallback. That is the whole mechanism: prompting at the right moment.

If the `CLAUDE.md` block already loads every session, what do the hooks add? Freshness and position. The block is pinned near the top of context: passive, and increasingly far from the active turn as a session grows, or thinned out when `/compact` rewrites the transcript into a summary. The hooks inject a short imperative next to the moment it matters, at session start or the exact turn you ask for prose or code. The same words land differently depending on how recently the model saw them.

Why not auto-mine the transcript the way a file-based memory tool does? That is a constraint, not a principle: these hooks are shell commands, so they can't call the mempalace MCP or summarise a session themselves. They can do the one thing a shell command can, which is to **nudge Claude to curate** at the moments that matter. `PostToolUse` nudges a diary update after edits (cooldown-gated); `SessionStart` nudges a load; the rest is Claude calling `mempalace_add_drawer` / `mempalace_kg_add` in-session. Auto-*nudge*, not auto-*mine*: as close as shell-command hooks get.

## The Gate

`UserPromptSubmit` fires on every prompt but injects nothing unless it sees a writing signal (`write`, `draft`, `email`, `prose`, `polish`, `rephrase`, `tone`, `readme`, `summarise`, …) or a coding signal (`code`, `implement`, `refactor`, `lint`, `api`, `test`, `bug`, `fix`, `rename`, …). Matching is word-boundary, so `api` never fires on "capital", `doc` never on "doctor", `test` never on "latest". Regular inflections still match: `-s`/`-ed`/`-ing`/`-er`, with e-drop (`revising`), consonant doubling (`bugged`, `debugging`, though not `bugger`) and y-to-i (`replies`, though not `copier`). A stem that exists only through e-drop never matches alone, so `pros`, `ton` and `cod` stay silent. The rooms named in the directive adapt to the signal: `writing-voice`, `coding-style`, or both.

Two properties worth knowing:

- **One reminder per hour.** Each signal injects at most once per cooldown window per session, keyed by `session_id`. The window is an hour by default; set `MEMPALACE_STYLE_COOLDOWN` (seconds) to change it. The first matching turn fires the directive. Claude pulls then or, if that turn produces no prose or code, before the first later turn that does. Matching turns inside the window stay silent: either the conventions are in context, or the earlier reminder is and tells Claude to pull before the first turn that needs them. The hook does not check that a pull happened. After the window the directive fires again, and Claude skips the pull if the conventions are still in context. `SessionStart` clears these markers on `resume`/`clear`/`compact`, so the reminder fires again at once when earlier context (and the voice with it) may have been dropped.
- **Wide net, on purpose.** A false positive is cheap: it fires once, then goes quiet for the window, and it defers the pull to the first turn that produces prose or code rather than dropping it. A miss costs the whole feature on that turn. So the keyword net leans toward recall. Expect the coding directive on the first dev turn of most sessions. That is intended.

Cost is one `python3` invocation per prompt to evaluate the gate (tens of milliseconds, imperceptible against a model response) and, when it injects, one small marker file per signal.

## Session Diary

A `claude-remember`-style continuity layer, kept in the palace: a running work log as **drawers** in `wing_diary`, one room per day (room slug = the ISO date), each with a `## Handoff` at the top saying what's next and the non-obvious context the next session needs. It is our own drawer convention, not the native diary tool and not files in the repo.

Four touches keep it current. These hooks can prompt Claude but can't write memory themselves, so even the "automatic" one is an auto-*nudge*:

- **Loaded at start.** `SessionStart` nudges Claude to read the last day or two plus the newest `## Handoff`, so it resumes with context.
- **Nudged after edits.** `PostToolUse` reminds Claude to jot or refresh the day's entry, at most once per cooldown (~10 min, `MEMPALACE_DIARY_COOLDOWN`) after it writes files with `Write`, `Edit` or `NotebookEdit`, or when an `Agent` call returns. Edits made through Bash do not count. Edits made inside a subagent or an in-process agent team teammate carry an `agent_id` and are skipped: they neither nudge nor use up the cooldown. The main session is nudged only by its own edits and when an `Agent` call returns. The auto-capture path.
- **Written on demand.** [`/mempalace-hooks:remember`](skills/remember/SKILL.md) writes or refreshes today's entry: the explicit handoff, like claude-remember's `/remember`.
- **Curated in-session.** Per the managed block, Claude updates the day's drawer as durable things surface.

(`SessionEnd` and `PreCompact` can't drive this, since neither hands the model a turn to act, so capture hangs off the four above.)

## Install

```
/plugin marketplace add lzlrd/marketplace
/plugin install mempalace-hooks@lzlrd
/mempalace-hooks:setup global   # or: local (this project only)
```

`/mempalace-hooks:setup` appends the managed block (delimited by `<!-- MEMPALACE-HOOKS:BEGIN -->` … `<!-- MEMPALACE-HOOKS:END -->`) to your `CLAUDE.md`. Given no scope, Claude asks which one you want. `/mempalace-hooks:setup` and `/mempalace-hooks:uninstall` run only when you type them, and each pre-approves just its own script with `global` or `local`, so any other command still asks first. Run by hand with no scope and no terminal, the script prints its usage and changes nothing. It is idempotent: re-running removes the old block and appends the current one at the end of the file. It writes a timestamped backup, readable by you alone, before any change, and none when there is nothing to change; a file or link already at the backup name is never written through. If your `CLAUDE.md` is a symlink, as in a dotfiles setup, the block is written to the file it points to, but only when that is an existing Markdown file: a link to anything else, or to nothing, is refused. The three hooks register automatically from [`hooks/hooks.json`](hooks/hooks.json) on install. Setup does not touch `settings.json`, so it cannot clobber your existing hooks or settings.

Setup and uninstall count a marker only when it is a whole line, where a line ends only at a line feed, and pair the markers in order. A marker quoted within a line of your own text is left alone. If a marker has lost its partner, or a whole-line marker sits inside a ```` ``` ```` or `~~~` code fence, both commands stop, name the line and leave the file untouched. Setup also stops if your file ends inside a code fence that is never closed, since the block would land inside it. So a missing END line cannot take your own text with it, unless you wrote a whole-line END marker of your own further down, outside any code fence. Fix the line the message names, then run the command again. To quote a marker in a fenced example, indent it.

> After installing, delete any hand-written memory prose already in your `CLAUDE.md`. The managed block is the single source of truth; keeping both drifts.

> After updating the plugin, run `/mempalace-hooks:setup` with the same scope again. The hooks update with the plugin, but the block in your `CLAUDE.md` changes only when setup runs, and a re-run replaces any hand edits inside the block.

## Uninstall

```
/mempalace-hooks:uninstall global   # strips the CLAUDE.md block (with a backup); or: local
/plugin uninstall mempalace-hooks
```

`/mempalace-hooks:uninstall` removes the managed block from your `CLAUDE.md`. `/plugin uninstall mempalace-hooks` unregisters the three hooks. The block sits between `<!-- MEMPALACE-HOOKS:BEGIN -->` and `<!-- MEMPALACE-HOOKS:END -->`, so you can also delete it by hand.

## Requirements

- A `mempalace` **MCP** server connected in Claude Code (local stdio or remote), **or** the `mempalace` **CLI** (`pip install mempalace`). The directives prefer the MCP and name its tools as `mcp__mempalace__*`, which is what a server registered under the name `mempalace` exposes. With no MCP they fall back to the CLI: `search` / `wake-up` / `status` for recall, `mine` to write. `mine` has no room option, so by default entries written that way land in the wing's `general` room and are found by searching the wing. With neither, the directives say memory is offline for the session.
- `bash` and `python3`. `python3` does the JSON parse and the word-boundary gating. Without it the `UserPromptSubmit` hook fails safe and injects nothing, `SessionStart` still injects but cannot clear a session's markers, the diary hook stays silent, and setup and uninstall refuse to run.
- Optional: the `humanizer` plugin (`/plugin marketplace add blader/humanizer`, then `/plugin install humanizer@humanizer`). `match-style` runs it on prose when it is installed and skips it otherwise.

## Layout

```
.claude-plugin/   plugin.json
commands/         setup.md            → /mempalace-hooks:setup
                  uninstall.md        → /mempalace-hooks:uninstall
hooks/            hooks.json          → registers the three hooks
                  mp-session-start.sh → SessionStart directive
                  mp-style-pull.sh    → UserPromptSubmit gated style-pull
                  mp-diary-capture.sh → PostToolUse diary auto-nudge
setup/            mempalace-block.md  → the managed CLAUDE.md block
                  setup.sh / uninstall.sh
                  block.py            → marker pairing, backup and rewrite for both scripts
skills/           remember/SKILL.md    → /mempalace-hooks:remember
                  match-style/SKILL.md → pull prefs + humanize before writing
tst/              run.sh              → tests for the hooks, setup and uninstall
```

All three hooks run `set -uo pipefail`, always exit 0, and print at most one directive each, so they cannot break a session. Two print plain text; the `PostToolUse` one prints a JSON object, the only form in which that hook's output reaches Claude.

The commands in `hooks.json` quote `${CLAUDE_PLUGIN_ROOT}`, so an install path with a space or an apostrophe works. The plugin reference says Claude Code writes that path into the command as text, so a `$` or a backtick in it still breaks the hooks.

Cooldown markers live in `$XDG_STATE_HOME/mempalace-hooks`, or `~/.local/state/mempalace-hooks` when that is unset or not an absolute path, and never in a shared temporary directory. A relative `HOME` is ignored too, so no marker lands in your project. Where no marker can be kept (neither variable an absolute path, an unwritable directory, no session id), the style reminder repeats on every matching prompt and the diary nudge stays silent. The diary nudge also stays silent when its marker exists but cannot be read.

Run the tests from the repo root with `bash mempalace-hooks/tst/run.sh`. They need only `bash` and `python3`, and work in a scratch directory under `TMPDIR`.
