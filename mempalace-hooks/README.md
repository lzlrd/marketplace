# mempalace-hooks

Wires the [`mempalace`](https://pypi.org/project/mempalace/) memory server into [Claude Code](https://docs.claude.com/en/docs/claude-code). A few directive hooks and a managed `CLAUDE.md` block give Claude durable, cross-session memory: it loads palace context at session start, pulls your writing or coding voice before it writes or codes, and keeps a per-day session diary. The hooks never read or write memory themselves — they nudge Claude, who calls the `mempalace` MCP (or the CLI as fallback).

## What It Does

| Piece | When | What it does |
|---|---|---|
| **`CLAUDE.md` block** | Every session | A managed block ([`setup/mempalace-block.md`](setup/mempalace-block.md)) documenting the two-store discipline: **drawers** (verbatim narrative, semantic search) and the **knowledge graph** (atomic `subject → predicate → object` facts, looked up by entity). This is the reference; the hooks keep it salient. |
| **`SessionStart` hook** | `startup` · `resume` · `clear` · `compact` | Injects a short active directive: load durable memory from the mempalace MCP (`mempalace_status`, then `search` / `kg_query`) before asserting anything about you, a person, or a project. |
| **`UserPromptSubmit` hook** | Writing/coding turns only | Injects a directive to pull your recorded voice/conventions (`writing-voice` / `coding-style` rooms) before responding, at most once per signal per session. |
| **Session diary + `/remember`** | Session start · after edits · on demand | Drawers in `wing_diary`, one room per day (ISO date), each topped with a `## Handoff`. Loaded at `SessionStart`, auto-nudged after edits by `PostToolUse`, written or refreshed by [`/mempalace-hooks:remember`](skills/remember/SKILL.md). The cross-session continuity layer — claude-remember-style, kept in the palace. |
| **`match-style` skill** | Before you write code/prose | Pulls your `coding-style` / `writing-voice` / `working-prefs` from MemPalace and matches them before you write, and runs `/humanizer:humanizer` on prose. Model-invoked — the reliable companion to the `UserPromptSubmit` nudge. [`skills/match-style`](skills/match-style/SKILL.md). |

## Why the hooks only nudge

A hook is a shell command. It cannot call MCP tools; only Claude can. So these hooks never read or write memory themselves. They inject text that tells Claude to act, against whatever `mempalace` MCP server you have connected (local stdio or remote) — or the `mempalace` CLI as a fallback. That is the whole mechanism: prompting at the right moment.

If the `CLAUDE.md` block already loads every session, what do the hooks add? Freshness and position. The block is pinned near the top of context: passive, and increasingly far from the active turn as a session grows, or thinned out when `/compact` rewrites the transcript into a summary. The hooks inject a short imperative next to the moment it matters, at session start or the exact turn you ask for prose or code. The same words land differently depending on how recently the model saw them.

Why not auto-mine the transcript the way a file-based memory tool does? Not a principle — a constraint: a hook is a shell command, so it can't call the mempalace MCP or summarise a session itself. It can do the one thing a shell command can — **nudge Claude to curate**, at the moments that matter. `PostToolUse` nudges a diary update after edits (cooldown-gated); `SessionStart` nudges a load; the rest is Claude calling `mempalace_add_drawer` / `mempalace_kg_add` in-session. Auto-*nudge*, not auto-*mine* — as close as a hook-only plugin gets.

## The Gate

`UserPromptSubmit` fires on every prompt but injects nothing unless it sees a writing signal (`write`, `draft`, `email`, `prose`, `polish`, `rephrase`, `tone`, `readme`, `summarise`, …) or a coding signal (`code`, `implement`, `refactor`, `lint`, `api`, `test`, `bug`, `fix`, `rename`, …). Matching is word-boundary, so `api` never fires on "capital", `doc` never on "doctor", `test` never on "latest". Common inflections (`-s`/`-ed`/`-ing`/`-er`, plus e-drop) still match. The rooms named in the directive adapt to the signal: `writing-voice`, `coding-style`, or both.

Two properties worth knowing:

- **Deduplicated per session.** Each signal injects at most once per session, keyed by `session_id`. The first coding turn pulls your `coding-style`; later coding turns stay silent, since the conventions are already in context. `SessionStart` clears these markers on `resume`/`clear`/`compact`, so your voice re-pulls once when earlier context (and the voice with it) may have been dropped.
- **Wide net, on purpose.** Dedup makes a false positive cheap: it fires once, then goes quiet, while a miss costs the whole feature on that turn. So the keyword net leans toward recall. Expect the coding directive on most of the first dev turn of a session. That is intended.

Cost is one `python3` invocation per prompt to evaluate the gate (tens of milliseconds, imperceptible against a model response) and, on a matching first turn, one small marker file.

## Session diary

A `claude-remember`-style continuity layer, kept in the palace: a running work log as **drawers** in `wing_diary`, one room per day (room slug = the ISO date), each with a `## Handoff` at the top — what's next and the non-obvious context the next session needs. Not the native diary tool, and not files in the repo — our own drawer convention.

Four touches keep it current. A hook can prompt Claude but can't write memory itself, so even the "automatic" one is an auto-*nudge*:

- **Loaded at start.** `SessionStart` nudges Claude to read the last day or two plus the newest `## Handoff`, so it resumes with context.
- **Nudged after edits.** `PostToolUse` reminds Claude to jot or refresh the day's entry — at most once per cooldown (~10 min, `MEMPALACE_DIARY_COOLDOWN`) after it writes files. The auto-capture path.
- **Written on demand.** [`/mempalace-hooks:remember`](skills/remember/SKILL.md) writes or refreshes today's entry — the explicit handoff, like claude-remember's `/remember`.
- **Curated in-session.** Per the managed block, Claude updates the day's drawer as durable things surface.

(`SessionEnd` and `PreCompact` can't drive this — neither hands the model a turn to act — so capture hangs off the four above.)

## Install

```
/plugin marketplace add lzlrd/marketplace
/plugin install mempalace-hooks@lzlrd
/mempalace-hooks:setup global   # or: local (this project only)
```

`/mempalace-hooks:setup` appends the managed block (delimited by `<!-- MEMPALACE-HOOKS:BEGIN -->` … `<!-- MEMPALACE-HOOKS:END -->`) to your `CLAUDE.md`. It is idempotent: re-running replaces the old block in place, and it writes a timestamped backup first. The two hooks register automatically from [`hooks/hooks.json`](hooks/hooks.json) on install. Setup does not touch `settings.json`, so it cannot clobber your existing hooks or settings.

> After installing, delete any hand-written memory prose already in your `CLAUDE.md`. The managed block is the single source of truth; keeping both drifts.

## Uninstall

```
/mempalace-hooks:uninstall global   # strips the CLAUDE.md block (with a backup); or: local
/plugin uninstall mempalace-hooks
```

`/mempalace-hooks:uninstall` removes the managed block from your `CLAUDE.md`. `/plugin uninstall mempalace-hooks` unregisters the two hooks. The block sits between `<!-- MEMPALACE-HOOKS:BEGIN -->` and `<!-- MEMPALACE-HOOKS:END -->`, so you can also delete it by hand.

## Requirements

- A `mempalace` **MCP** server connected in Claude Code (local stdio or remote), **or** the `mempalace` **CLI** (`pip install mempalace`). The directives prefer the MCP (`mcp__mempalace__*` tools); with no MCP they fall back to the CLI — `search` / `wake-up` / `status` for recall, `mine` to write. With neither, the directives say memory is offline for the session.
- `bash` and `python3`. `python3` does the JSON parse and the word-boundary gating. Without it the `UserPromptSubmit` hook fails safe and injects nothing.

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
skills/           remember/SKILL.md    → /mempalace-hooks:remember
                  match-style/SKILL.md → pull prefs + humanize before writing
```

All three hooks run `set -uo pipefail`, always exit 0, and emit plain text only, so they cannot break a session.
