# mempalace-hooks

Wires the [`mempalace`](https://pypi.org/project/mempalace/) MCP memory server into [Claude Code](https://docs.claude.com/en/docs/claude-code). Two directive hooks and a managed `CLAUDE.md` block give Claude durable, cross-session memory. Claude loads palace context at session start and pulls your writing or coding voice before it writes or codes. It is MCP-only: the plugin never reads or writes memory itself, and there is one source of truth.

## What It Does

| Piece | When | What it does |
|---|---|---|
| **`CLAUDE.md` block** | Every session | A managed block ([`setup/mempalace-block.md`](setup/mempalace-block.md)) documenting the two-store discipline: **drawers** (verbatim narrative, semantic search) and the **knowledge graph** (atomic `subject → predicate → object` facts, looked up by entity). This is the reference; the hooks keep it salient. |
| **`SessionStart` hook** | `startup` · `resume` · `clear` · `compact` | Injects a short active directive: load durable memory from the mempalace MCP (`mempalace_status`, then `search` / `kg_query`) before asserting anything about you, a person, or a project. |
| **`UserPromptSubmit` hook** | Writing/coding turns only | Injects a directive to pull your recorded voice/conventions (`writing-voice` / `coding-style` rooms) before responding, at most once per signal per session. |

## Why MCP-Only

A hook is a shell command. It cannot call MCP tools; only Claude can. So these hooks never read or write memory themselves. They inject text that tells Claude to, against whatever `mempalace` MCP server you have connected (local stdio or a remote endpoint). That is the whole mechanism: prompting at the right moment.

If the `CLAUDE.md` block already loads every session, what do the hooks add? Freshness and position. The block is pinned near the top of context: passive, and increasingly far from the active turn as a session grows, or thinned out when `/compact` rewrites the transcript into a summary. The hooks inject a short imperative next to the moment it matters, at session start or the exact turn you ask for prose or code. The same words land differently depending on how recently the model saw them.

The trade-off: no automatic transcript mining at stop or compact. Mining is a local-CLI feature, and a hook cannot push mined drawers to an MCP server. Instead Claude curates memory in-session, calling `mempalace_add_drawer` / `mempalace_kg_add` when something durable comes up, per the conventions in the injected block. One source of truth.

## The Gate

`UserPromptSubmit` fires on every prompt but injects nothing unless it sees a writing signal (`write`, `draft`, `email`, `prose`, `polish`, `rephrase`, `tone`, `readme`, `summarise`, …) or a coding signal (`code`, `implement`, `refactor`, `lint`, `api`, `test`, `bug`, `fix`, `rename`, …). Matching is word-boundary, so `api` never fires on "capital", `doc` never on "doctor", `test` never on "latest". Common inflections (`-s`/`-ed`/`-ing`/`-er`, plus e-drop) still match. The rooms named in the directive adapt to the signal: `writing-voice`, `coding-style`, or both.

Two properties worth knowing:

- **Deduplicated per session.** Each signal injects at most once per session, keyed by `session_id`. The first coding turn pulls your `coding-style`; later coding turns stay silent, since the conventions are already in context. `SessionStart` clears these markers on `resume`/`clear`/`compact`, so your voice re-pulls once when earlier context (and the voice with it) may have been dropped.
- **Wide net, on purpose.** Dedup makes a false positive cheap: it fires once, then goes quiet, while a miss costs the whole feature on that turn. So the keyword net leans toward recall. Expect the coding directive on most of the first dev turn of a session. That is intended.

Cost is one `python3` invocation per prompt to evaluate the gate (tens of milliseconds, imperceptible against a model response) and, on a matching first turn, one small marker file.

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

- A `mempalace` MCP server connected in Claude Code (local stdio or remote). The hooks inject directives that reference `mcp__mempalace__*` tools. With no such server connected, the directives have nothing to act on.
- `bash` and `python3`. `python3` does the JSON parse and the word-boundary gating. Without it the `UserPromptSubmit` hook fails safe and injects nothing.

## Layout

```
.claude-plugin/   plugin.json
commands/         setup.md            → /mempalace-hooks:setup
                  uninstall.md        → /mempalace-hooks:uninstall
hooks/            hooks.json          → registers the two hooks
                  mp-session-start.sh → SessionStart directive
                  mp-style-pull.sh    → UserPromptSubmit gated style-pull
setup/            mempalace-block.md  → the managed CLAUDE.md block
                  setup.sh / uninstall.sh
```

Both hooks run `set -uo pipefail`, always exit 0, and emit plain text only, so they cannot break a session.
