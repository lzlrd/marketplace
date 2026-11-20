#! /usr/bin/env bash

# Mempalace-hooks · PostToolUse diary auto-capture. After Claude edits files or an Agent call returns,
# nudge it — at most once per cooldown per session — to jot or refresh today's wing_diary entry.
# This hook is a shell command: it cannot call the MCP/CLI or summarise a session; only Claude can. So
# this is an auto-NUDGE: the closest a hook-only plugin gets to claude-remember's PostToolUse auto-save
# (which shells out to a local CLI + LLM a hook can't reach through the MCP). The matcher in hooks.json
# limits it to the edit tools and the Agent tool.

# Stdin: harness hook JSON. session_id keys the per-session cooldown marker. agent_id is set when the
# call happens inside a subagent or an in-process agent-team teammate: those calls are skipped, so
# their edits neither receive the nudge nor use up the cooldown. The main session is nudged by its own
# edits and when an Agent call returns.
# stdout: the nudge as one JSON object (hookSpecificOutput.additionalContext, the only form in which
# PostToolUse output reaches Claude), once the cooldown has elapsed. When the cooldown cannot be kept
# (no session id, no python3, nowhere private to put the marker, or a marker that cannot be read or
# written) the hook prints nothing rather than nudge after every edit. ALWAYS exits 0 — a memory hook must
# never break a session.

set -uo pipefail

# Read stdin only when it is open and not a terminal. With stdin closed, the command substitution's
# own pipe lands on that descriptor and cat would wait on itself for ever.
raw=""
if [ ! -t 0 ] && { true 3<&0; } 2>/dev/null; then raw="$(cat 2>/dev/null || true)"; fi

# Seconds between nudges. Override with MEMPALACE_DIARY_COOLDOWN. Default 600 (~10 min): long enough that a
# burst of edits nudges once, short enough to catch a long session's later work.
cooldown="${MEMPALACE_DIARY_COOLDOWN:-600}"
[ "$cooldown" -ge 0 ] 2>/dev/null || cooldown=600   # guard against a non-numeric override under set -u

# One python3 call emits "<in_agent> <session_id>", e.g. "0 abc-123" (main session) or "1 abc-123"
# (inside a subagent or teammate). On any failure it emits nothing, and the guards below end the run
# silently.
out="$(printf '%s' "$raw" | python3 -c '
import sys, json
try:
    d = json.load(sys.stdin)
    print(1 if d.get("agent_id") else 0, d.get("session_id", "") or "")
except Exception:
    print("")
' 2>/dev/null || true)"
in_agent=""; sid=""   # Set first: under set -u a failed read must not leave them unbound.
read -r in_agent sid <<<"$out"
sid="${sid//[^A-Za-z0-9_-]/}"   # harden: session_id feeds a path, so allow only safe chars (a UUID is unaffected).
[ "${in_agent:-}" = "1" ] && exit 0   # Inside a subagent or teammate → leave the nudge and the cooldown to the main session.
[ -n "$sid" ] || exit 0               # No session id → nothing to key the cooldown on.

# Markers live under XDG_STATE_HOME or HOME, never in a shared temporary directory where another
# local user could plant a file. A relative XDG_STATE_HOME is ignored, as the XDG spec requires, and so
# is a relative HOME, so no marker lands in the project directory. With neither set to an absolute
# path there is nowhere to keep the cooldown.
if [[ "${XDG_STATE_HOME:-}" == /* ]]; then state_dir="$XDG_STATE_HOME/mempalace-hooks"
elif [[ "${HOME:-}" == /* ]]; then state_dir="$HOME/.local/state/mempalace-hooks"
else exit 0
fi
marker="$state_dir/$sid.diary"

# Cooldown gate: stay silent if we already nudged within the last $cooldown seconds this session. The marker
# stores an epoch as its content — portable across BSD/GNU, with no stat/date -r flavour to trip over.
# SessionStart clears "$sid".* on resume/clear/compact, so the diary re-nudges once after context may drop.
now="$(date +%s 2>/dev/null || echo 0)"
if [ -f "$marker" ]; then
  # A marker that exists but cannot be read leaves the last nudge unknown: stay silent, since reading
  # it as 0 would nudge after every edit.
  last="$(cat "$marker" 2>/dev/null)" || exit 0
  last="${last//[^0-9]/}"; last="${last:-0}"
  [ "$((now - 10#$last))" -lt "$cooldown" ] && exit 0   # 10#: a leading zero must not be read as octal.
fi

# PostToolUse stdout reaches Claude only as JSON additionalContext; plain text there is shown to the
# user alone. So stdout is one JSON object or nothing: if python3 cannot build it, stay silent.
msg="[mempalace] Work has accrued this session. If a durable decision or real progress landed, jot or refresh today's session diary — today's wing_diary drawer and its ## Handoff — via the mempalace MCP (mempalace_update_drawer / mempalace_add_drawer), the mempalace CLI, or /mempalace-hooks:remember. Skip silently if nothing durable changed since the last entry."
nudge="$(python3 -c 'import json, sys; print(json.dumps({"hookSpecificOutput": {"hookEventName": "PostToolUse", "additionalContext": sys.argv[1]}}))' "$msg" 2>/dev/null || true)"
[ -n "$nudge" ] || exit 0

# Stamp the nudge epoch BEFORE printing, so a re-run can't double-fire, and print only if the stamp
# landed. Never write through a symlink sitting where the marker goes.
mkdir -p -m 700 "$state_dir" 2>/dev/null || true
[ -L "$marker" ] && exit 0
{ printf '%s\n' "$now" >"$marker"; } 2>/dev/null || exit 0

printf '%s\n' "$nudge"
exit 0
