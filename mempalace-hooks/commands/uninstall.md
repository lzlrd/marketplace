---
description: Remove the mempalace-hooks memory block from CLAUDE.md. The hooks themselves are unregistered by `claude plugin uninstall`.
disable-model-invocation: true
allowed-tools:
  - 'Bash(bash "${CLAUDE_PLUGIN_ROOT}/setup/uninstall.sh" global)'
  - 'Bash(bash "${CLAUDE_PLUGIN_ROOT}/setup/uninstall.sh" local)'
---

Remove the managed mempalace-hooks memory block from CLAUDE.md. It strips the block delimited by `<!-- MEMPALACE-HOOKS:BEGIN -->` … `<!-- MEMPALACE-HOOKS:END -->` (idempotent, with a timestamped backup); it does **not** touch anything else in the file.

The scope is `global` (`~/.claude/CLAUDE.md`) or `local` (this project, `./CLAUDE.md`). The scope the user gave: **$ARGUMENTS**
If that is empty or names neither scope, ask which before running: the script's own prompt cannot be answered from here, so with no scope it prints its usage and changes nothing. Then run the one line below for that scope with the Bash tool, typed exactly as written here, in lowercase whatever case the user typed, with nothing added. These two lines are the only commands this command pre-approves; anything else asks the user first.

For `global`:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/setup/uninstall.sh" global
```

For `local`:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/setup/uninstall.sh" local
```

This removes only the CLAUDE.md block. To also unregister the three hooks, run `claude plugin uninstall mempalace-hooks` afterward.

If the script stops because a marker has no partner or a marker line sits inside a code fence, it has changed nothing. Show the user its message, which names the line and how to fix it, and let them fix the file by hand before running it again; do not edit their CLAUDE.md yourself to force it through.
