---
name: match-style
description: >-
  Pull the user's recorded conventions from MemPalace — coding-style,
  writing-voice, and working-prefs — and match them instead of inventing a
  default; for prose, also run /humanizer:humanizer to strip AI-writing tells.
  Use when starting a writing, coding, or editing task whose output should
  carry the user's voice and the conventions are not already in context (the
  UserPromptSubmit style-pull hook may have pulled them this session).
  Machine-facing text — generated LLM prompts, config, schemas — is exempt
  from voice-matching and humanizing.
---

Before you produce code or prose, load the user's house style from **MemPalace** and
match it — don't invent a default. Do this once per session (and again after a
resume/clear/compact drops earlier context); skip the re-pull if you already have it in
context.

## Pull the conventions
Prefer the `mempalace` **MCP** — `mcp__mempalace__mempalace_search` on `wing_user`, plus
`mempalace_kg_query` for discrete preference facts. If the MCP isn't connected, fall back to
the `mempalace` **CLI** (`mempalace search <query> --wing wing_user`, `mempalace wake-up`).
Pull the room that fits the task — and `working-prefs` always:

- **`coding-style`** — before writing or editing code: naming, formatting, imports, error
  handling, comment density, test style.
- **`writing-voice`** — before writing prose, docs, comments, commit messages, or messages, so
  you write *as* the user.
- **`working-prefs`** — always: the user's assistant-behaviour defaults (how they want you to work).

If neither the MCP nor the CLI is available, say memory is offline and proceed on best judgement.

## Humanize prose
For anything that reads as prose — docs, READMEs, chat/PR messages, long comments — after you
draft it, run **`/humanizer:humanizer`** on the text to strip AI-writing tells (only if the
humanizer plugin is installed; skip silently if not). Code is exempt, and so are machine-facing
deliverables (generated LLM prompts, config, schemas) — they ship verbatim, not in the user's
voice.

Match what you find. If you ask the user a style choice mid-task, offer to save it
(ask-to-save) so the conventions grow.
