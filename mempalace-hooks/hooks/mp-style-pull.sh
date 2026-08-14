#! /usr/bin/env bash

# Mempalace-hooks · UserPromptSubmit (MCP-only) style-pull. On writing or coding turns only, inject
# one directive telling Claude to consult the connected mempalace MCP palace for the user's voice or
# conventions before responding. A hook cannot call MCP tools: it names the rooms, and Claude pulls
# them.

# Stdin: JSON {"prompt": "...", "session_id": "..."}. stdout: the directive, on a matching turn and at
# most once per signal per cooldown window per session. Always exits 0, so it never breaks a turn.

# Gating uses word-boundary matching (not substrings), so 'api' never fires on "capital", 'doc' never
# on "doctor", 'test' never on "latest". A few inflections (s/es/ed/ing/er, incl. e-drop) still match.
# The keyword net is deliberately wide because dedup makes a false positive cheap (it fires once, then
# stays quiet all session) while a miss costs the whole feature on that turn.

set -uo pipefail

raw="$(cat 2>/dev/null || true)"

# python3 parses the JSON and word-boundary-matches both keyword sets. Emits "<w> <c> <session_id>",
# e.g. "1 0 abc-123" (writing), "0 1 ..." (coding), "1 1 ..." (both), "0 0 ..." (neither). On any
# failure it emits nothing → the guards below treat the turn as non-style and inject nothing.
out="$(printf '%s' "$raw" | python3 -c '
import sys, json, re
try:
    d = json.load(sys.stdin)
    prompt = d.get("prompt", "") or ""
    sid = d.get("session_id", "") or ""
except Exception:
    prompt, sid = "", ""
WRITING = ("write writing wrote rewrite revise edit draft redraft email e-mail slack message reply "
           "prose blog post essay article doc docs document readme changelog rephrase reword "
           "paraphrase proofread polish tighten formal tone voice announcement caption headline "
           "tweet copy summarize summarise ghostwrite wording").split()
CODING  = ("code coding implement function func refactor class method script lint linter format "
           "naming rename variable constant module component snippet api endpoint schema migration "
           "typescript build compile test unit bug fix debug").split()
SUFFIX = r"(?:s|es|ed|ing|er)?"
def stems(kws):
    s = set()
    for k in kws:
        s.add(k)
        if k.endswith("e") and len(k) > 3:   # e-drop: revise->revis(ing), summarize->summariz(ing)
            s.add(k[:-1])
    return s
def matcher(kws):
    parts = sorted((re.escape(x) for x in stems(kws)), key=len, reverse=True)
    return re.compile(r"\b(?:" + "|".join(parts) + r")" + SUFFIX + r"\b", re.I)
w = 1 if matcher(WRITING).search(prompt) else 0
c = 1 if matcher(CODING).search(prompt) else 0
print(w, c, sid)
' 2>/dev/null || true)"

read -r want_w want_c sid <<<"$out"
sid="${sid//[^A-Za-z0-9_-]/}"   # harden: sid feeds marker paths, so allow safe chars only (a UUID is unaffected).
want_w="${want_w:-0}"; want_c="${want_c:-0}"
[ "$want_w" = "1" ] || want_w=0
[ "$want_c" = "1" ] || want_c=0
[ "$want_w" -eq 0 ] && [ "$want_c" -eq 0 ] && exit 0   # non-style turn → inject nothing (the point of gating).

# Cooldown: re-inject each signal at most once per $cooldown seconds per session (markers keyed by
# session_id, epoch stored as file CONTENT — portable, no stat/date -r flavour to trip over; same
# shape as the diary hook). A one-shot-per-session pull anchors voice at hour zero and then goes
# quiet, which is wrong for a long run: by hour three the pulled conventions may be far behind the
# active turn. SessionStart still clears "$sid".* on resume/clear/compact, so a rewritten transcript
# re-pulls at once rather than waiting out the cooldown. Override with MEMPALACE_STYLE_COOLDOWN.
cooldown="${MEMPALACE_STYLE_COOLDOWN:-3600}"
[ "$cooldown" -ge 0 ] 2>/dev/null || cooldown=3600   # guard against a non-numeric override under set -u
now="$(date +%s 2>/dev/null || echo 0)"

state_dir="${XDG_STATE_HOME:-${HOME:-/tmp}/.local/state}/mempalace-hooks"   # HOME fallback: set -u must not abort us
stale() {   # true when the marker is absent or older than the cooldown
  [ -f "$1" ] || return 0
  local last; last="$(cat "$1" 2>/dev/null || echo 0)"; last="${last//[^0-9]/}"; last="${last:-0}"
  [ "$((now - last))" -ge "$cooldown" ]
}
new_w=0; new_c=0
if [ -n "$sid" ]; then
  mkdir -p "$state_dir" 2>/dev/null || true
  [ "$want_w" -eq 1 ] && stale "$state_dir/$sid.w" && new_w=1
  [ "$want_c" -eq 1 ] && stale "$state_dir/$sid.c" && new_c=1
else
  new_w="$want_w"; new_c="$want_c"   # no session_id → can't track; inject rather than lose the turn.
fi
[ "$new_w" -eq 0 ] && [ "$new_c" -eq 0 ] && exit 0   # pulled recently → stay quiet.

# Stamp the signals we're about to satisfy (before printing, so a re-run can't double-fire).
if [ -n "$sid" ]; then
  [ "$new_w" -eq 1 ] && printf '%s\n' "$now" >"$state_dir/$sid.w" 2>/dev/null || true
  [ "$new_c" -eq 1 ] && printf '%s\n' "$now" >"$state_dir/$sid.c" 2>/dev/null || true
fi

if [ "$new_w" -eq 1 ] && [ "$new_c" -eq 1 ]; then
  rooms="writing-voice (prose) and coding-style (code)"
elif [ "$new_w" -eq 1 ]; then
  rooms="writing-voice (prose)"
else
  rooms="coding-style (code)"
fi

printf '%s\n' "[mempalace] The user's voice/conventions may be on record. Before responding, consult the palace — with the mempalace MCP, mcp__mempalace__mempalace_search (rooms: ${rooms}) plus mempalace_kg_query for any relevant preference; without it, fall back to the mempalace CLI (mempalace search <query> --wing wing_user). Match the established voice/conventions rather than inventing them."
exit 0
