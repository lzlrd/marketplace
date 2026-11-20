#! /usr/bin/env bash

# Mempalace-hooks uninstall: remove the MEMPALACE-HOOKS block from CLAUDE.md (idempotent, with backup).

# The hooks are removed automatically when the plugin is uninstalled.

# Usage: uninstall.sh global|local   (no arg = asks on a terminal, default local; with no terminal it
# prints this usage and changes nothing)

set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"

scope="${1:-}"
if [ -z "$scope" ]; then
  # Nobody to ask (a slash command, a pipe): stop rather than pick a file to edit.
  [ -t 0 ] || { echo "mempalace-hooks: usage: uninstall.sh global|local (no scope given, and no terminal to ask on)"; exit 1; }
  printf "mempalace-hooks: remove the memory block from: [l]ocal (default) / [g]lobal: "
  read -r ans || ans=""   # EOF (Ctrl-D) → take the local default, don't abort under set -e
  case "$ans" in g*|G*) scope=global;; l*|L*|"") scope=local;; *) echo "cancelled"; exit 1;; esac
fi
case "$scope" in
  [Gg][Ll][Oo][Bb][Aa][Ll]) scope=global; CLAUDE_MD="$HOME/.claude/CLAUDE.md";;
  [Ll][Oo][Cc][Aa][Ll])     scope=local;  CLAUDE_MD="$PWD/CLAUDE.md";;
  *) echo "mempalace-hooks: scope must be global or local"; exit 1;;
esac
[ -f "$CLAUDE_MD" ] || { echo "mempalace-hooks: $CLAUDE_MD not found, nothing to remove."; exit 0; }

command -v python3 >/dev/null 2>&1 || { echo "mempalace-hooks: python3 is required."; exit 1; }

# Remove only properly paired, whole-line markers and what lies between them: block.py backs the file
# up before changing it, and stops without writing (exit 1, which ends this script under set -e) when
# the markers do not pair up or a marker line sits inside a code fence.
python3 "$HERE/block.py" remove "$CLAUDE_MD"

echo "mempalace-hooks uninstall complete ($scope). The hooks are removed when you /plugin uninstall."
echo "  Backups ($CLAUDE_MD.mempalace-hooks-bak.*) can be deleted manually if no longer needed."
