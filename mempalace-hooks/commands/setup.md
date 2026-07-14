---
description: Set up mempalace-hooks — inject the managed memory block into CLAUDE.md. The three hooks are auto-registered on plugin install.
allowed-tools: ["Bash"]
---

Run the mempalace-hooks setup. It appends a managed block — delimited by `<!-- MEMPALACE-HOOKS:BEGIN -->` … `<!-- MEMPALACE-HOOKS:END -->` — to CLAUDE.md (idempotent, with a timestamped backup). The three hooks (SessionStart / UserPromptSubmit / PostToolUse) are already registered by the plugin's `hooks.json` on install — this script does **not** touch `settings.json`.

Pass `global` (all projects, `~/.claude/CLAUDE.md`) or `local` (this project, `./CLAUDE.md`). With no argument it prompts interactively (default: local).

```bash
bash ${CLAUDE_PLUGIN_ROOT}/setup/setup.sh $ARGUMENTS
```

After it runs, report the result briefly and remind the user to delete any now-redundant hand-written memory prose from their CLAUDE.md — the managed block is the single source of truth, and keeping both drifts.
