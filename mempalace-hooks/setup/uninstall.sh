#! /usr/bin/env bash

# Mempalace-hooks uninstall: remove the MEMPALACE-HOOKS block from CLAUDE.md (idempotent, with backup).

# The hooks are removed automatically when the plugin is uninstalled.

# Usage: uninstall.sh [global|local]

set -euo pipefail

scope="${1:-}"
if [ -z "$scope" ]; then
  printf "mempalace-hooks: remove the memory block from: [l]ocal / [g]lobal: "
  read -r ans || ans=""   # non-interactive/EOF (no tty) → fall through to the local default, don't abort under set -e
  case "$ans" in g*|G*) scope=global;; *) scope=local;; esac
fi
case "$scope" in
  global) CLAUDE_MD="$HOME/.claude/CLAUDE.md";;
  local)  CLAUDE_MD="$PWD/CLAUDE.md";;
  *) echo "mempalace-hooks: scope must be global or local"; exit 1;;
esac
[ -f "$CLAUDE_MD" ] || { echo "mempalace-hooks: $CLAUDE_MD not found, nothing to remove."; exit 0; }

command -v python3 >/dev/null 2>&1 || { echo "mempalace-hooks: python3 is required."; exit 1; }
ts=$(python3 -c "import time;print(int(time.time()))")
cp "$CLAUDE_MD" "$CLAUDE_MD.mempalace-hooks-bak.$ts" && echo "  backup: $CLAUDE_MD.mempalace-hooks-bak.$ts"

python3 - "$CLAUDE_MD" <<'PY'
import sys, re, pathlib
p = pathlib.Path(sys.argv[1])
cur = p.read_text(encoding="utf-8")
new = re.sub(r"\n*<!-- MEMPALACE-HOOKS:BEGIN.*?MEMPALACE-HOOKS:END -->\n?", "\n", cur, flags=re.S)
p.write_text(new, encoding="utf-8")
print("  ✓ MEMPALACE-HOOKS block removed" if new != cur else "  = no MEMPALACE-HOOKS block (already removed)")
PY

echo "mempalace-hooks uninstall complete ($scope). The hooks are removed when you /plugin uninstall."
echo "  Backups ($CLAUDE_MD.mempalace-hooks-bak.*) can be deleted manually if no longer needed."
