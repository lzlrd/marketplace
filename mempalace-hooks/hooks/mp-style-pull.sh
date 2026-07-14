#! /usr/bin/env bash

# Mempalace-hooks · UserPromptSubmit (MCP-only) style-pull. On writing or coding turns only, inject
# one directive telling Claude to consult the connected mempalace MCP palace for the user's voice or
# conventions before responding. A hook cannot call MCP tools: it names the rooms, and Claude pulls
# them.

# Stdin: JSON {"prompt": "...", "session_id": "..."}. stdout: the directive, on a matching turn and at
# most ONCE per signal per session (dedup markers). Always exits 0, so it never breaks a turn.

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

# Dedup: inject each signal at most once per session (markers keyed by session_id). SessionStart
# clears these on resume/clear/compact, so voice re-pulls once when earlier context may have been lost.
state_dir="${XDG_STATE_HOME:-${HOME:-/tmp}/.local/state}/mempalace-hooks"   # HOME fallback: set -u must not abort us
new_w=0; new_c=0
if [ -n "$sid" ]; then
  mkdir -p "$state_dir" 2>/dev/null || true
  [ "$want_w" -eq 1 ] && [ ! -e "$state_dir/$sid.w" ] && new_w=1
  [ "$want_c" -eq 1 ] && [ ! -e "$state_dir/$sid.c" ] && new_c=1
else
  new_w="$want_w"; new_c="$want_c"   # no session_id → can't dedup; inject rather than lose the turn.
fi
[ "$new_w" -eq 0 ] && [ "$new_c" -eq 0 ] && exit 0   # already pulled this session → stay quiet.

# Record the signals we're about to satisfy (before printing, so a re-run can't double-fire).
if [ -n "$sid" ]; then
  [ "$new_w" -eq 1 ] && : 2>/dev/null >"$state_dir/$sid.w" || true
  [ "$new_c" -eq 1 ] && : 2>/dev/null >"$state_dir/$sid.c" || true
fi

if [ "$new_w" -eq 1 ] && [ "$new_c" -eq 1 ]; then
  rooms="writing-voice (prose) and coding-style (code)"
elif [ "$new_w" -eq 1 ]; then
  rooms="writing-voice (prose)"
else
  rooms="coding-style (code)"
fi

printf '%s\n' "[mempalace] The user's voice/conventions may be on record. Before responding, consult the palace — with the mempalace MCP, mcp__mempalace__mempalace_search (rooms: ${rooms}) plus mempalace_kg_query for any relevant preference; without it, fall back to the mempalace CLI (mempalace search <query> --wing wing_user). Match the established voice/conventions rather than inventing them. If you ask the user a style/preference choice, offer to save it (ask-to-save)."
exit 0
