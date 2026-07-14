---
description: Remove the mempalace-hooks memory block from CLAUDE.md. The hooks themselves are unregistered by `claude plugin uninstall`.
allowed-tools: ["Bash"]
---

Remove the managed mempalace-hooks memory block from CLAUDE.md. It strips the block delimited by `<!-- MEMPALACE-HOOKS:BEGIN -->` … `<!-- MEMPALACE-HOOKS:END -->` (idempotent, with a timestamped backup); it does **not** touch anything else in the file.

Pass `global` (`~/.claude/CLAUDE.md`) or `local` (this project, `./CLAUDE.md`). With no argument it prompts interactively (default: local).

```bash
bash ${CLAUDE_PLUGIN_ROOT}/setup/uninstall.sh $ARGUMENTS
```

This removes only the CLAUDE.md block. To also unregister the three hooks, run `claude plugin uninstall mempalace-hooks` afterward.
