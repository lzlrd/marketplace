#! /usr/bin/env bash

# Mempalace-hooks · UserPromptSubmit (MCP-only) style-pull. On writing or coding turns only, inject
# one directive telling Claude to consult the connected mempalace MCP palace for the user's voice or
# conventions before responding. This hook is a shell command and cannot call MCP tools: it names the
# rooms, and Claude pulls them.

# Stdin: JSON {"prompt": "...", "session_id": "..."}. stdout: the directive, on a matching turn and at
# most once per signal per cooldown window per session. Always exits 0, so it never breaks a turn.

# Gating uses word-boundary matching (not substrings), so 'api' never fires on "capital", 'doc' never
# on "doctor", 'test' never on "latest". Regular inflections still match: s/es/ed/ing/er, plus e-drop
# (revising), consonant doubling (bugging, debugger, but not "bugger") and y-to-i (replies, but not
# "copier"). A stem that only exists through e-drop never matches on its own, so "pros", "ton" and
# "cod" stay silent.
# The keyword net is deliberately wide because the cooldown makes a false positive cheap (it fires
# once, then stays quiet for the window) while a miss costs the whole feature on that turn.

set -uo pipefail

# Read stdin only when it is open and not a terminal. With stdin closed, the command substitution's
# own pipe lands on that descriptor and cat would wait on itself for ever.
raw=""
if [ ! -t 0 ] && { true 3<&0; } 2>/dev/null; then raw="$(cat 2>/dev/null || true)"; fi

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
WRITING = ("write writing wrote written rewrite rewritten revise edit draft redraft email e-mail "
           "slack message reply prose blog post essay article doc docs document documentation "
           "readme changelog rephrase reword paraphrase proofread polish tighten formal tone voice "
           "style announcement caption headline tweet copy summarize summarise ghostwrite "
           "wording").split()
CODING  = ("code coding implement implementation function func refactor class method script lint "
           "linter format naming rename variable constant module component snippet api endpoint "
           "schema migration typescript build compile test unit bug fix debug style").split()
VOWELS = "aeiou"
def forms(k):
    # The keyword with a plain suffix, plus the spellings a suffix forces on keywords of three
    # letters or more. The altered stems only ever appear with their suffix: "revis" or "cod" alone
    # is not a match. Y-to-i takes no -er, so "copier" is not read as a form of copy.
    out = [re.escape(k) + r"(?:s|es|ed|ing|er)?"]
    if len(k) >= 3:
        if k[-1] == "e":                                # E-drop: revise -> revising, code -> coded
            out.append(re.escape(k[:-1]) + r"(?:ed|ing|er)")
        elif k[-1] == "y" and k[-2] not in VOWELS:      # Y-to-i: reply -> replies, copy -> copied
            out.append(re.escape(k[:-1]) + r"i(?:es|ed)")
        elif k[-1] not in VOWELS + "wxy" and k[-2] in VOWELS and k[-3] not in VOWELS:
            # Doubling: bug -> bugged, debug -> debugger. No -er on three letters: "bugger" is not a bug.
            out.append(re.escape(k + k[-1]) + (r"(?:ed|ing|er)" if len(k) > 3 else r"(?:ed|ing)"))
    return out
def matcher(kws):
    parts = [f for k in kws for f in forms(k)]
    return re.compile(r"\b(?:" + "|".join(parts) + r")\b", re.I)
w = 1 if matcher(WRITING).search(prompt) else 0
c = 1 if matcher(CODING).search(prompt) else 0
print(w, c, sid)
' 2>/dev/null || true)"

want_w=""; want_c=""; sid=""   # Set first: under set -u a failed read must not leave them unbound.
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

# Markers live under XDG_STATE_HOME or HOME, never in a shared temporary directory where another
# local user could plant a file. A relative XDG_STATE_HOME is ignored, as the XDG spec requires, and so
# is a relative HOME, so no marker lands in the project directory. With neither set to an absolute
# path, state_dir stays empty and nothing is tracked.
state_dir=""
if [[ "${XDG_STATE_HOME:-}" == /* ]]; then state_dir="$XDG_STATE_HOME/mempalace-hooks"
elif [[ "${HOME:-}" == /* ]]; then state_dir="$HOME/.local/state/mempalace-hooks"
fi
stale() {   # True when the marker is absent, a symlink, or older than the cooldown
  [ -f "$1" ] && [ ! -L "$1" ] || return 0
  local last; last="$(cat "$1" 2>/dev/null || echo 0)"; last="${last//[^0-9]/}"; last="${last:-0}"
  [ "$((now - 10#$last))" -ge "$cooldown" ]   # 10#: a leading zero must not be read as octal.
}
stamp() {   # Write the epoch into a marker: quietly, and never through a symlink
  [ -L "$1" ] && return 0
  { printf '%s\n' "$now" >"$1"; } 2>/dev/null || true
}
new_w=0; new_c=0
if [ -n "$sid" ] && [ -n "$state_dir" ]; then
  mkdir -p -m 700 "$state_dir" 2>/dev/null || true
  [ "$want_w" -eq 1 ] && stale "$state_dir/$sid.w" && new_w=1
  [ "$want_c" -eq 1 ] && stale "$state_dir/$sid.c" && new_c=1
else
  new_w="$want_w"; new_c="$want_c"   # No session_id or no state directory → can't track; inject rather than lose the turn.
fi
[ "$new_w" -eq 0 ] && [ "$new_c" -eq 0 ] && exit 0   # pulled recently → stay quiet.

# Stamp the signals we're about to satisfy (before printing, so a re-run can't double-fire).
if [ -n "$sid" ] && [ -n "$state_dir" ]; then
  [ "$new_w" -eq 1 ] && stamp "$state_dir/$sid.w"
  [ "$new_c" -eq 1 ] && stamp "$state_dir/$sid.c"
fi

if [ "$new_w" -eq 1 ] && [ "$new_c" -eq 1 ]; then
  rooms="writing-voice (prose) and coding-style (code)"
elif [ "$new_w" -eq 1 ]; then
  rooms="writing-voice (prose)"
else
  rooms="coding-style (code)"
fi

printf '%s\n' "[mempalace] This prompt matched a writing or coding keyword, and the user's voice/conventions may be on record. If this turn will produce prose or code that should follow them, in your reply or in files you write, and they are not already in your context, consult the palace first — with the mempalace MCP, mcp__mempalace__mempalace_search (rooms: ${rooms}) plus mempalace_kg_query for any relevant preference; without it, fall back to the mempalace CLI (mempalace search <query> --wing wing_user) — and match what is on record rather than inventing a default. If this turn produces no such prose or code, skip the pull for now and make it before the first later turn that does: this reminder is rate-limited and may not fire again on that turn."
exit 0
