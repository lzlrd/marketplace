---
name: remember
description: >-
  Write a session handoff to the mempalace diary — what got done, what's next,
  and the non-obvious context the next session needs — the way claude-remember's
  /remember does, but into the mempalace palace. Use when the user says
  "/remember", "remember this", "save the session", "write a handoff", "diary",
  or is wrapping up work worth carrying forward. The explicit capture path that
  complements the SessionStart auto-load.
---

Write (or refresh) today's entry in the **mempalace session diary**. This is the
explicit counterpart to the SessionStart hook's auto-load: the hook brings memory
*in*, `/remember` writes the handoff *out*.

## Where it goes
One drawer per day in `wing_diary`, room slug = today's ISO date (e.g. `2026-07-05`).
Convert any relative date to absolute first. Keep **one** drawer per day — update it,
don't spawn duplicates.

## What to write
1. **Search first.** Look for today's diary drawer (and skim the last day or two for
   continuity). Update the existing drawer rather than creating a second one.
2. **Session log** — a few tight lines: what you worked on, decisions made, anything
   that changed. Not a transcript; the durable gist.
3. **`## Handoff`** at the top — what's next, open threads, and the non-obvious context
   (a gotcha, a chosen approach, a dead end not worth re-trying). This is the part the
   next session reads first.

## How to store it
- **mempalace MCP connected:** `mempalace_search` for the day's drawer, then
  `mempalace_update_drawer` (or `mempalace_add_drawer` if none exists) into
  `wing_diary` / room `<date>`.
- **MCP absent, `mempalace` CLI installed:** write the entry to a markdown file and
  `mempalace mine <dir> --wing wing_diary --agent <you>` to ingest it (the CLI has no direct
  drawer-write; `mine` is the ingest path).
- **Neither available:** tell the user memory is offline — there's nowhere to persist
  the handoff this session.

Keep it durable-only: project state, decisions, what's next. Skip one-off chatter and
anything git or the repo already records. Report back one line: where it landed and the
handoff headline.
