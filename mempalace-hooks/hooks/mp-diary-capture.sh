#! /usr/bin/env bash

# Mempalace-hooks · PostToolUse (Write/Edit-class tools only) diary auto-capture. After Claude edits
# files, nudge it — at most once per cooldown per session — to jot or refresh today's wing_diary entry.
# A hook cannot call the MCP/CLI or summarise a session; only Claude can. So this is an auto-NUDGE: the
# closest a hook-only plugin gets to claude-remember's PostToolUse auto-save (which shells out to a local
# CLI + LLM a hook can't reach through the MCP). The matcher in hooks.json already limits it to edit tools.

# Stdin: harness hook JSON (only session_id is read, to key the per-session cooldown marker). stdout: the
# nudge, on a matching tool once the cooldown has elapsed. ALWAYS exits 0 — a memory hook must never break
# a session.

set -uo pipefail

raw="$(cat 2>/dev/null || true)"

# Seconds between nudges. Override with MEMPALACE_DIARY_COOLDOWN. Default 600 (~10 min): long enough that a
# burst of edits nudges once, short enough to catch a long session's later work.
cooldown="${MEMPALACE_DIARY_COOLDOWN:-600}"
[ "$cooldown" -ge 0 ] 2>/dev/null || cooldown=600   # guard against a non-numeric override under set -u

sid="$(printf '%s' "$raw" | python3 -c '
import sys, json
try:
    print(json.load(sys.stdin).get("session_id", "") or "")
except Exception:
    print("")
' 2>/dev/null || true)"
sid="${sid//[^A-Za-z0-9_-]/}"   # harden: session_id feeds a path, so allow only safe chars (a UUID is unaffected).

state_dir="${XDG_STATE_HOME:-${HOME:-/tmp}/.local/state}/mempalace-hooks"   # HOME fallback: set -u must not abort us
marker="$state_dir/${sid:-nosid}.diary"

# Cooldown gate: stay silent if we already nudged within the last $cooldown seconds this session. The marker
# stores an epoch as its content — portable across BSD/GNU, with no stat/date -r flavour to trip over.
# SessionStart clears "$sid".* on resume/clear/compact, so the diary re-nudges once after context may drop.
now="$(date +%s 2>/dev/null || echo 0)"
if [ -f "$marker" ]; then
  last="$(cat "$marker" 2>/dev/null || echo 0)"; last="${last//[^0-9]/}"; last="${last:-0}"
  [ "$((now - last))" -lt "$cooldown" ] && exit 0
fi

mkdir -p "$state_dir" 2>/dev/null || true
printf '%s\n' "$now" >"$marker" 2>/dev/null || true   # stamp the nudge epoch BEFORE printing, so a re-run can't double-fire.

printf '%s\n' "[mempalace] Work has accrued this session. If a durable decision or real progress landed, jot or refresh today's session diary — today's wing_diary drawer and its ## Handoff — via the mempalace MCP (mempalace_update_drawer / mempalace_add_drawer), the mempalace CLI, or /mempalace-hooks:remember. Skip silently if nothing durable changed since the last entry."
exit 0
