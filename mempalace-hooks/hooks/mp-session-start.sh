#! /usr/bin/env bash

# Mempalace-hooks · SessionStart (MCP-only). Injects one active directive telling Claude to load
# durable memory from the connected mempalace MCP at session start, resume, clear, or compact.
# A hook cannot call MCP tools; only Claude can. So this nudges and never reads or writes memory
# itself. Its job over the always-loaded CLAUDE.md block is freshness: a short "load it now"
# imperative placed where the block's salience is weakest (top of a new session, and right after a
# compact or resume rewrites the transcript).

# Stdin: harness hook JSON (only session_id is read, for dedup-marker cleanup). stdout: the directive
# (added to session context). ALWAYS exits 0, since a memory hook must never break a session.

set -uo pipefail

raw="$(cat 2>/dev/null || true)"   # harness hook JSON; we only need session_id from it.

# Reset THIS session's style-pull dedup markers so the voice/style directive re-fires once after a
# resume, clear, or compact: the moments when earlier context (and the voice already pulled) may be
# gone. Precise per-session cleanup needs the id, since clearing all markers would reset dedup for
# other live sessions. Best-effort throughout, never fatal.
state_dir="${XDG_STATE_HOME:-${HOME:-/tmp}/.local/state}/mempalace-hooks"   # HOME fallback: set -u must not abort us
sid="$(printf '%s' "$raw" | python3 -c '
import sys, json
try:
    print(json.load(sys.stdin).get("session_id", "") or "")
except Exception:
    print("")
' 2>/dev/null || true)"
sid="${sid//[^A-Za-z0-9_-]/}"   # harden: session_id feeds a path, so a crafted value must not traverse
                                # out of state_dir. Allow only safe chars; a real UUID is unaffected.
[ -n "$sid" ] && rm -f "$state_dir/$sid".* 2>/dev/null || true
# ponytail: prune markers from dead sessions so state doesn't accrue one empty file per session.
# 7-day window; raise it only if a single session ever realistically outlives that.
find "$state_dir" -type f -mtime +7 -delete 2>/dev/null || true

printf '%s\n' "[mempalace] New session. Before asserting anything about the user, a person, or a project, load durable memory from the mempalace MCP: call mcp__mempalace__mempalace_status for the palace overview, then mcp__mempalace__mempalace_search / mcp__mempalace__mempalace_kg_query as needed. Query first, don't guess."
exit 0
