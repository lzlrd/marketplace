<!-- MEMPALACE-HOOKS:BEGIN — durable memory via the mempalace MCP. Two directive hooks (MCP-only) automate session-load and pre-response style-pull. This is a managed block: reinstall/update with /mempalace-hooks:setup rather than editing it by hand. -->
## Long-running memory (mempalace)

The `mempalace` MCP server is durable, cross-session memory. **Two stores — use these, and only these:**

- **Drawers** — verbatim free-text filed into a `wing`/`room`, found by semantic search. For rich, narrative context: a project writeup, a convention with nuance, a writing-voice profile. Tools: `mcp__mempalace__mempalace_add_drawer` / `mempalace_update_drawer` / `mempalace_delete_drawer` / `mempalace_search` / `mempalace_get_taxonomy`.
- **Knowledge graph (KG)** — atomic `subject → predicate → object` facts with time-validity, looked up by entity. For discrete facts you'd query by name or that change over time: a role, a location, one preference value, a project's status. Tools: `mcp__mempalace__mempalace_kg_add` / `mempalace_kg_query` / `mempalace_kg_invalidate` (on change: `kg_invalidate` the old fact, then `kg_add` the new one). A thing can use both — a project gets a drawer (detail) plus a KG fact or two (e.g. its location) for quick lookup.

Ignore the rest of mempalace's machinery (halls, tunnels, hallways, diary, mining/sync, the AAAK dialect) unless the user explicitly asks for it.

- **[read before asserting]** Before stating a fact about the user, a person, or a project, `mempalace_kg_query` / `mempalace_search` first — don't guess. Before writing to memory, search first and update an existing drawer/fact rather than duplicate it. (The two hooks only inject reminders: SessionStart nudges you to load palace context; UserPromptSubmit nudges you to pull voice/conventions on writing & coding turns. You make the MCP calls.)
- **[projects]** Record a project with `mempalace_add_drawer` under `wing_myproject`: ONE drawer per project (concise overview plus the detail worth persisting, combined), room slug = the project name. Convert relative dates to absolute.
- **[about the user]** `wing_user` holds durable conventions as queryable drawers — rooms: `coding-style` (code/formatting), `writing-voice` (prose voice, so you can write as the user), `working-prefs` (assistant-behavior defaults). Query before assuming; grow `coding-style` / `writing-voice` by ASKING, not bulk-inference. Single source of truth — don't restate these preferences here in CLAUDE.md, and if one becomes a standing rule in CLAUDE.md, drop it from the palace.
- **[ask-to-save]** Whenever you ask the user a style/preference choice mid-work, ALSO offer to save the chosen option (opt-in confirm) — that's how `coding-style` / `writing-voice` grow.
- **[misc]** `wing_misc` is the catch-all for durable info that fits no project, `coding-style`, `writing-voice`, or `working-prefs`.
- **[scope]** Store only durable, long-running context — project state, decisions, preferences. Skip one-off conversational detail and anything git or the repo already records.
<!-- MEMPALACE-HOOKS:END -->
