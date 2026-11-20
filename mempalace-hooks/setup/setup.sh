#! /usr/bin/env bash

# Mempalace-hooks setup: append the managed memory block into CLAUDE.md (idempotent, with backup).

# The three hooks (SessionStart / UserPromptSubmit / PostToolUse) are registered automatically by
# hooks.json on plugin install, so this script does NOT touch settings.json (no risk of clobbering
# existing hooks or settings).

# Usage: setup.sh global|local   (no arg = asks on a terminal, default local; with no terminal it
# prints this usage and changes nothing)

set -euo pipefail

# The template and block.py come from beside this script, never from an inherited CLAUDE_PLUGIN_ROOT,
# which may name another installed copy of the plugin.
HERE="$(cd "$(dirname "$0")" && pwd)"
BLOCK_TPL="$HERE/mempalace-block.md"

command -v python3 >/dev/null 2>&1 || { echo "mempalace-hooks: python3 is required."; exit 1; }
[ -f "$BLOCK_TPL" ] || { echo "mempalace-hooks: block template not found ($BLOCK_TPL)"; exit 1; }

scope="${1:-}"
if [ -z "$scope" ]; then
  # Nobody to ask (a slash command, a pipe): stop rather than pick a file to edit.
  [ -t 0 ] || { echo "mempalace-hooks: usage: setup.sh global|local (no scope given, and no terminal to ask on)"; exit 1; }
  printf "mempalace-hooks: inject the memory block into [l]ocal (this project, default) / [g]lobal (all projects): "
  read -r ans || ans=""   # EOF (Ctrl-D) → take the local default, don't abort under set -e
  case "$ans" in g*|G*) scope=global;; l*|L*|"") scope=local;; *) echo "cancelled"; exit 1;; esac
fi
case "$scope" in
  [Gg][Ll][Oo][Bb][Aa][Ll]) scope=global; CLAUDE_MD="$HOME/.claude/CLAUDE.md";;
  [Ll][Oo][Cc][Aa][Ll])     scope=local;  CLAUDE_MD="$PWD/CLAUDE.md";;
  *) echo "mempalace-hooks: scope must be global or local"; exit 1;;
esac
echo "mempalace-hooks → $scope ($CLAUDE_MD)"

mkdir -p "$(dirname "$CLAUDE_MD")"

# Inject idempotently: block.py strips any existing MEMPALACE-HOOKS block, then re-appends the current
# one. It backs the file up before changing it, and stops without writing (exit 1, which ends this
# script under set -e) when the markers in the file do not pair up, when a marker line sits inside a
# code fence, or when the file ends inside a code fence that is never closed.
python3 "$HERE/block.py" inject "$CLAUDE_MD" "$BLOCK_TPL"

echo "mempalace-hooks setup complete ($scope); applies from the next session."
echo "  The three hooks (SessionStart / UserPromptSubmit / PostToolUse) are auto-registered on plugin install."
echo "  Uninstall: /mempalace-hooks:uninstall $scope"
echo "  IMPORTANT: delete any now-redundant manual MemPalace prose from your CLAUDE.md to avoid duplication."
