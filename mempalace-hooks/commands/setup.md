---
description: Set up mempalace-hooks — inject the managed memory block into CLAUDE.md. The three hooks are auto-registered on plugin install.
disable-model-invocation: true
allowed-tools:
  - 'Bash(bash "${CLAUDE_PLUGIN_ROOT}/setup/setup.sh" global)'
  - 'Bash(bash "${CLAUDE_PLUGIN_ROOT}/setup/setup.sh" local)'
---

Run the mempalace-hooks setup. It appends a managed block — delimited by `<!-- MEMPALACE-HOOKS:BEGIN -->` … `<!-- MEMPALACE-HOOKS:END -->` — to CLAUDE.md (idempotent, with a timestamped backup). The three hooks (SessionStart / UserPromptSubmit / PostToolUse) are already registered by the plugin's `hooks.json` on install — this script does **not** touch `settings.json`.

The scope is `global` (all projects, `~/.claude/CLAUDE.md`) or `local` (this project, `./CLAUDE.md`). The scope the user gave: **$ARGUMENTS**
If that is empty or names neither scope, ask which before running: the script's own prompt cannot be answered from here, so with no scope it prints its usage and changes nothing. Then run the one line below for that scope with the Bash tool, typed exactly as written here, in lowercase whatever case the user typed, with nothing added. These two lines are the only commands this command pre-approves; anything else asks the user first.

For `global`:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/setup/setup.sh" global
```

For `local`:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/setup/setup.sh" local
```

After it runs, report the result briefly and remind the user to delete any now-redundant hand-written memory prose from their CLAUDE.md — the managed block is the single source of truth, and keeping both drifts. Also tell them to run this again with the same scope after each plugin update: the hooks update with the plugin, but the block in CLAUDE.md changes only when setup runs.

If the script stops because a marker has no partner, a marker line sits inside a code fence, or the file ends inside a code fence that is never closed, it has changed nothing. Show the user its message, which names the line and how to fix it, and let them fix the file by hand before running it again; do not edit their CLAUDE.md yourself to force it through.
