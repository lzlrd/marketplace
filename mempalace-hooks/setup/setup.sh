#! /usr/bin/env bash

# Mempalace-hooks setup: append the managed memory block into CLAUDE.md (idempotent, with backup).

# The two hooks (SessionStart / UserPromptSubmit) are registered automatically by hooks.json on
# plugin install, so this script does NOT touch settings.json (no risk of clobbering existing
# hooks or settings).

# Usage: setup.sh [global|local]   (no arg = interactive, default local)

set -euo pipefail

ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
BLOCK_TPL="$ROOT/setup/mempalace-block.md"

command -v python3 >/dev/null 2>&1 || { echo "mempalace-hooks: python3 is required."; exit 1; }
[ -f "$BLOCK_TPL" ] || { echo "mempalace-hooks: block template not found ($BLOCK_TPL)"; exit 1; }

scope="${1:-}"
if [ -z "$scope" ]; then
  printf "mempalace-hooks: inject the memory block into [l]ocal (this project, recommended) / [g]lobal (all projects): "
  read -r ans || ans=""   # non-interactive/EOF (no tty) → fall through to the local default, don't abort under set -e
  case "$ans" in g*|G*) scope=global;; l*|L*|"") scope=local;; *) echo "cancelled"; exit 1;; esac
fi
case "$scope" in
  global) CLAUDE_MD="$HOME/.claude/CLAUDE.md";;
  local)  CLAUDE_MD="$PWD/CLAUDE.md";;
  *) echo "mempalace-hooks: scope must be global or local"; exit 1;;
esac
echo "mempalace-hooks → $scope ($CLAUDE_MD)"

mkdir -p "$(dirname "$CLAUDE_MD")"; touch "$CLAUDE_MD"
ts=$(python3 -c "import time;print(int(time.time()))")
cp "$CLAUDE_MD" "$CLAUDE_MD.mempalace-hooks-bak.$ts" && echo "  backup: $CLAUDE_MD.mempalace-hooks-bak.$ts"

# Inject idempotently: strip any existing MEMPALACE-HOOKS block, then re-append the current one.
python3 - "$CLAUDE_MD" "$BLOCK_TPL" <<'PY'
import sys, re, pathlib
md, tpl = sys.argv[1], sys.argv[2]
p = pathlib.Path(md)
cur = p.read_text(encoding="utf-8") if p.exists() else ""
block = pathlib.Path(tpl).read_text(encoding="utf-8").strip()
cur = re.sub(r"<!-- MEMPALACE-HOOKS:BEGIN.*?MEMPALACE-HOOKS:END -->\n?", "", cur, flags=re.S).rstrip()
p.write_text((cur + "\n\n" + block + "\n") if cur else (block + "\n"), encoding="utf-8")
print("  ✓ CLAUDE.md: MEMPALACE-HOOKS memory block injected (idempotent)")
PY

echo "mempalace-hooks setup complete ($scope); applies from the next session."
echo "  The two hooks (SessionStart / UserPromptSubmit) are auto-registered on plugin install."
echo "  Uninstall: bash $ROOT/setup/uninstall.sh $scope"
echo "  IMPORTANT: delete any now-redundant manual MemPalace prose from your CLAUDE.md to avoid duplication."
