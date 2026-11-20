#! /usr/bin/env bash

# Mempalace-hooks tests: run the three hooks, hooks.json, the two command files and the setup and
# uninstall scripts against scratch homes, state directories and CLAUDE.md files.

# Every script runs under `env -i` with HOME and XDG_STATE_HOME pointed into a scratch directory, so the
# real home, the real ~/.claude and the caller's environment are never read or written.

# Usage: tst/run.sh [plugin-root]   (default: the plugin this file sits in)
# Scratch goes under ${TMPDIR:-/tmp} and is removed on exit; set KEEP=1 to keep it. Needs bash 3.2 or
# newer and python3. The scripts under test run with the same bash that runs this file.

set -uo pipefail

ROOT="$(cd "${1:-$(dirname "$0")/..}" && pwd)"
SH="${BASH:-bash}"
T="$(mktemp -d "${TMPDIR:-/tmp}/mempalace-hooks-tst.XXXXXX")" || exit 1
T="$(cd "$T" && pwd -P)"
cleanup() { [ "${KEEP:-0}" = "1" ] && echo "scratch kept: $T" || rm -rf "$T"; }
trap cleanup EXIT

H="$T/home"; S="$T/state"; STUB="$T/stub"
mkdir -p "$H" "$S" "$STUB"
# Version-manager shims (mise, pyenv, asdf) choose an interpreter from files under HOME, which is a
# scratch directory here, so the real interpreter's own directory goes first on the PATH.
TPATH="$(python3 -c 'import os, sys; print(os.path.dirname(sys.executable))'):$PATH" || exit 1
printf '#! /bin/sh\nexit 127\n' >"$STUB/python3"; chmod +x "$STUB/python3"   # A python3 that always fails.
tree_before="$(cd "$ROOT" && find . -not -name '*.pyc' -not -name '__pycache__' | sort)"

passed=0; failed=0
OUT=""; ERR=""; RC=0
ok() { passed=$((passed + 1)); printf 'ok   %s\n' "$1"; }
no() { failed=$((failed + 1)); printf 'FAIL %s\n     last run: rc=%s stderr=<%s>\n' "$1" "$RC" "$(printf '%s' "$ERR" | head -n 1)"; }
t() { local d="$1"; shift; if "$@"; then ok "$d"; else no "$d"; fi; }   # Check one command: t <description> <command...>
not() { ! "$@"; }
section() { printf '\n# %s\n' "$1"; }

capture() { RC=$?; OUT="$(cat "$T/out")"; ERR="$(cat "$T/err")"; }

# Run one hook with the scratch environment: hook <script> <stdin text> [VAR=value...]
hook() {
  local name="$1" input="$2"; shift 2
  printf '%s' "$input" >"$T/in"
  env -i PATH="$TPATH" HOME="$H" XDG_STATE_HOME="$S" ${1+"$@"} "$SH" "$ROOT/hooks/$name" <"$T/in" >"$T/out" 2>"$T/err"
  capture
}

# Run one hook with stdin a pipe, the way the harness feeds it: piped <script> <stdin text>
piped() {
  printf '%s' "$2" | env -i PATH="$TPATH" HOME="$H" XDG_STATE_HOME="$S" "$SH" "$ROOT/hooks/$1" >"$T/out" 2>"$T/err"
  capture
}

# Run a command from a scratch directory, stdin not a terminal: run_in <dir> <command...>
run_in() {
  local dir="$1"; shift
  (cd "$dir" && env -i PATH="$TPATH" HOME="$H" XDG_STATE_HOME="$S" "$@") >"$T/out" 2>"$T/err" </dev/null
  capture
}

# Run one hook with stdin closed: closed <hook>. RC is 124 if it is still running after 5 seconds. The
# file descriptor is closed in the child just before exec, and the whole process group is killed on
# timeout, since the process left waiting is a grandchild.
closed() {
  env -i PATH="$TPATH" HOME="$H" XDG_STATE_HOME="$S" python3 -c '
import os, signal, subprocess, sys
p = subprocess.Popen(sys.argv[1:], preexec_fn=lambda: os.close(0), start_new_session=True)
try:
    sys.exit(p.wait(timeout=5))
except subprocess.TimeoutExpired:
    os.killpg(p.pid, signal.SIGKILL)
    p.wait()
    sys.exit(124)
' "$SH" "$ROOT/hooks/$1" >"$T/out" 2>"$T/err" </dev/null
  capture
}

# Run a command on a pseudo-terminal and type one answer at it: on_pty <dir> <answer> <command...>
# RC is 142 (SIGALRM) if the command is still running after 10 seconds.
on_pty() {
  local dir="$1"; shift
  (cd "$dir" && env -i PATH="$TPATH" HOME="$H" XDG_STATE_HOME="$S" python3 -c '
import os, pty, signal, sys
answer, cmd = sys.argv[1], sys.argv[2:]
signal.alarm(10)
pid, fd = pty.fork()
if pid == 0:
    os.execvp(cmd[0], cmd)
os.write(fd, (answer + "\n").encode())
out = b""
while True:
    try:
        chunk = os.read(fd, 4096)
    except OSError:
        break
    if not chunk:
        break
    out += chunk
status = os.waitpid(pid, 0)[1]
sys.stdout.write(out.decode("utf-8", "replace"))
sys.exit(os.WEXITSTATUS(status) if os.WIFEXITED(status) else 1)
' "$@") >"$T/out" 2>"$T/err" </dev/null
  capture
}

on_pty "$T" "" true
HAVE_PTY=0; [ "$RC" -eq 0 ] && HAVE_PTY=1

lines() { printf '%s' "$1" | grep -c '' || true; }   # Number of lines in a string, 0 when empty.
count() { grep -c -- "$1" "$2" 2>/dev/null || true; }   # Number of lines in a file matching a pattern.
backups() { find "$1" -maxdepth 1 -name 'CLAUDE.md.mempalace-hooks-bak.*' | grep -c '' || true; }
valid_nudge() {   # True when the text is one JSON object carrying a PostToolUse additionalContext.
  printf '%s' "$1" | python3 -c '
import json, sys
d = json.load(sys.stdin)["hookSpecificOutput"]
assert d["hookEventName"] == "PostToolUse" and d["additionalContext"].strip()
' 2>/dev/null
}
signal() {   # Which rooms a style-pull directive names: w, c, wc, or none.
  case "$1" in
    *"writing-voice (prose) and coding-style (code)"*) echo wc;;
    *"rooms: writing-voice (prose)"*) echo w;;
    *"rooms: coding-style (code)"*) echo c;;
    "") echo none;;
    *) echo unknown;;
  esac
}
prompt_json() { python3 -c 'import json, sys; d = {"prompt": sys.argv[1]}; d.update({"session_id": sys.argv[2]} if len(sys.argv) > 2 else {}); print(json.dumps(d))' "$@"; }

BEGIN='<!-- MEMPALACE-HOOKS:BEGIN'
END='<!-- MEMPALACE-HOOKS:END -->'

section "Every hook exits 0 and prints at most one line, whatever arrives on stdin"
for name in mp-session-start.sh mp-style-pull.sh mp-diary-capture.sh; do
  t "$name is executable" test -x "$ROOT/hooks/$name"
  for input in '{"session_id":"A1","prompt":"write some code","tool_name":"Write"}' '' '{not json' '[1, 2]' '{"session_id":"../../x","prompt":"write code"}'; do
    hook "$name" "$input"
    t "$name exits 0 on stdin <$input>" test "$RC" -eq 0
    t "$name prints at most one line on stdin <$input>" test "$(lines "$OUT")" -le 1
    t "$name keeps stderr empty on stdin <$input>" test -z "$ERR"
  done
  closed "$name"
  t "$name returns with stdin closed, exit 0" test "$RC" -eq 0
  t "$name prints at most one line with stdin closed" test "$(lines "$OUT")" -le 1
  if [ "$HAVE_PTY" -eq 1 ]; then
    on_pty "$T" "" "$SH" "$ROOT/hooks/$name"
    t "$name returns with a terminal on stdin, exit 0" test "$RC" -eq 0
  fi
  hook "$name" '{"session_id":"A2","prompt":"write some code","tool_name":"Write"}' PATH="$STUB:$TPATH"
  t "$name exits 0 when python3 fails" test "$RC" -eq 0
  t "$name prints at most one line when python3 fails" test "$(lines "$OUT")" -le 1
done
t "no marker escaped the state directory" test -z "$(find "$T" -name 'x.*' -not -path "$S/*")"

section "SessionStart"
rm -rf "$S"; mkdir -p "$S/mempalace-hooks"
for f in B1.w B1.c B1.diary B2.w; do echo 1 >"$S/mempalace-hooks/$f"; done
hook mp-session-start.sh '{"session_id":"B1","source":"resume"}'
t "prints its directive" test "$(lines "$OUT")" -eq 1
t "clears this session's markers" test -z "$(find "$S/mempalace-hooks" -name 'B1.*')"
t "keeps another session's markers" test -f "$S/mempalace-hooks/B2.w"
echo 1 >"$S/mempalace-hooks/B3.w"
piped mp-session-start.sh '{"session_id":"B3","source":"clear"}'
t "reads a payload that arrives through a pipe" test "$(lines "$OUT")$(find "$S/mempalace-hooks" -name 'B3.*')" = 1

section "PostToolUse diary nudge"
rm -rf "$S"
piped mp-diary-capture.sh '{"session_id":"C0","tool_name":"Write"}'
t "a payload arriving through a pipe is read and nudged" valid_nudge "$OUT"
hook mp-diary-capture.sh '{"session_id":"C1","tool_name":"Edit","agent_id":"agent-abc123","agent_type":"Explore"}'
t "a call inside a subagent gets no nudge" test -z "$OUT"
t "a call inside a subagent leaves the cooldown alone" not test -e "$S/mempalace-hooks/C1.diary"
hook mp-diary-capture.sh '{"session_id":"C1","tool_name":"Edit"}'
t "the main session is nudged with one JSON object" valid_nudge "$OUT"
t "the nudge stamps the cooldown marker" test -f "$S/mempalace-hooks/C1.diary"
hook mp-diary-capture.sh '{"session_id":"C1","tool_name":"Agent"}'
t "a second call inside the cooldown is silent" test -z "$OUT"
hook mp-diary-capture.sh '{"session_id":"C1","tool_name":"Edit"}' MEMPALACE_DIARY_COOLDOWN=0
t "MEMPALACE_DIARY_COOLDOWN=0 nudges again" valid_nudge "$OUT"
echo 08 >"$S/mempalace-hooks/C2.diary"
hook mp-diary-capture.sh '{"session_id":"C2","tool_name":"Edit"}'
t "a marker holding 08 is read as decimal" valid_nudge "$OUT"
t "a marker holding 08 prints no error" test -z "$ERR"
hook mp-diary-capture.sh '{"tool_name":"Edit"}'
t "no session id: silent" test -z "$OUT"
t "no session id: no shared marker" not test -e "$S/mempalace-hooks/nosid.diary"
hook mp-diary-capture.sh '{"session_id":"C3","tool_name":"Edit"}' PATH="$STUB:$TPATH"
t "python3 failing: stdout is empty, never half a nudge" test -z "$OUT"
echo "important user file" >"$T/victim"; ln -s "$T/victim" "$S/mempalace-hooks/C4.diary"
hook mp-diary-capture.sh '{"session_id":"C4","tool_name":"Edit"}'
t "a symlink where the marker goes is not written through" test "$(cat "$T/victim")" = "important user file"
if [ "$(id -u)" -ne 0 ]; then
  chmod 500 "$S/mempalace-hooks"
  hook mp-diary-capture.sh '{"session_id":"C5","tool_name":"Edit"}'
  chmod 700 "$S/mempalace-hooks"
  t "read-only state: nothing on stderr" test -z "$ERR"
  t "read-only state: silent, since the cooldown cannot be kept" test -z "$OUT"
  # A marker stamped a moment ago that cannot be read: reading it as 0 would nudge on every edit.
  date +%s >"$S/mempalace-hooks/C6.diary"; chmod 200 "$S/mempalace-hooks/C6.diary"
  hook mp-diary-capture.sh '{"session_id":"C6","tool_name":"Edit"}'
  chmod 600 "$S/mempalace-hooks/C6.diary"
  t "a marker that cannot be read: silent, exit 0, nothing on stderr" test "$RC$OUT$ERR" = 0
fi

section "UserPromptSubmit keyword gate"
gate() {   # Usage: gate <expected signal> <prompt>
  hook mp-style-pull.sh "$(prompt_json "$2")"
  t "gate $1: $2" test "$(signal "$OUT")" = "$1"
}
gate none "list the pros and cons of moving to Lisbon"
gate none "that is a ton of rain this week"
gate none "I have tons of questions about my taxes"
gate none "I caught a cod on the trip"
gate none "the bailiff served a writ this morning"
gate none "what is the capital of France"
gate none "call the doctor tomorrow"
gate none "what is the latest news"
gate none "the copier is jammed again"
gate none "that cheeky bugger ate my lunch"
gate w "draft an email to the landlord"
gate w "she is revising the essay"
gate w "summarising the meeting notes"
gate w "I have written a letter, improve it"
gate w "the replies need to sound friendlier"
gate w "update the documentation for the parser"
gate w "act as my ghostwriter for this"
gate w "she copied the intro by hand"
gate c "help with debugging this crash"
gate c "the formatting is off in this file"
gate c "review my implementation of the cache"
gate c "refactor this function"
gate c "I coded it yesterday"
gate c "the tests are failing"
gate c "the app bugged out on save"
gate c "it keeps bugging out on save"
gate c "the compiler crashed"
gate wc "write a script that renames files"
gate wc "match my style here"

section "UserPromptSubmit cooldown"
rm -rf "$S"
piped mp-style-pull.sh "$(prompt_json "refactor this function" D0)"
t "a prompt arriving through a pipe is read" test "$(signal "$OUT")" = c
hook mp-style-pull.sh "$(prompt_json "refactor this function" D1)"
t "first coding turn fires" test "$(signal "$OUT")" = c
hook mp-style-pull.sh "$(prompt_json "refactor this function" D1)"
t "second coding turn inside the window is silent" test "$(signal "$OUT")" = none
hook mp-style-pull.sh "$(prompt_json "draft an email" D1)"
t "the writing signal is tracked separately" test "$(signal "$OUT")" = w
hook mp-style-pull.sh "$(prompt_json "refactor this function" D1)" MEMPALACE_STYLE_COOLDOWN=0
t "MEMPALACE_STYLE_COOLDOWN=0 fires again" test "$(signal "$OUT")" = c
echo 08 >"$S/mempalace-hooks/D1.c"
hook mp-style-pull.sh "$(prompt_json "refactor this function" D1)"
t "a marker holding 08 is read as decimal" test "$(signal "$OUT")" = c
t "a marker holding 08 prints no error" test -z "$ERR"
echo "important user file" >"$T/victim"; ln -s "$T/victim" "$S/mempalace-hooks/D2.c"
hook mp-style-pull.sh "$(prompt_json "refactor this function" D2)"
t "a symlink where the marker goes is not written through" test "$(cat "$T/victim")" = "important user file"
if [ "$(id -u)" -ne 0 ]; then
  chmod 500 "$S/mempalace-hooks"
  hook mp-style-pull.sh "$(prompt_json "refactor this function" D3)"
  chmod 700 "$S/mempalace-hooks"
  t "read-only state: nothing on stderr" test -z "$ERR"
  t "read-only state: still injects" test "$(signal "$OUT")" = c
fi

section "No HOME and no XDG_STATE_HOME"
# Guard first: a hook that still names /tmp is not run here, so this file never writes outside its scratch.
if grep -q '/tmp' "$ROOT"/hooks/*.sh; then
  no "no hook falls back to a shared directory such as /tmp"
else
  ok "no hook falls back to a shared directory such as /tmp"
  hook mp-style-pull.sh "$(prompt_json "refactor this function" E1)" HOME= XDG_STATE_HOME=
  first="$(signal "$OUT")"
  hook mp-style-pull.sh "$(prompt_json "refactor this function" E1)" HOME= XDG_STATE_HOME=
  t "style-pull injects without dedup" test "$first$(signal "$OUT")" = cc
  hook mp-diary-capture.sh '{"session_id":"E1","tool_name":"Edit"}' HOME= XDG_STATE_HOME=
  t "the diary hook stays silent, since the cooldown cannot be kept" test "$RC$OUT" = 0
  hook mp-session-start.sh '{"session_id":"E1"}' HOME= XDG_STATE_HOME=
  t "SessionStart still prints its directive" test "$RC$(lines "$OUT")" = 01
fi

section "A relative XDG_STATE_HOME is ignored"
# The hooks run from a scratch project directory, so a relative path could only resolve inside it.
PRJ="$T/project"; HS="$H/.local/state/mempalace-hooks"
mkdir -p "$PRJ/rel/mempalace-hooks"; rm -rf "$H/.local"
echo 1 >"$PRJ/rel/mempalace-hooks/F2.w"; echo 1 >"$PRJ/rel/mempalace-hooks/old"
touch -t 202001010000 "$PRJ/rel/mempalace-hooks/old"
prj_before="$(cd "$PRJ" && find . | sort)"
here="$PWD"; cd "$PRJ" || exit 1
hook mp-diary-capture.sh '{"session_id":"F1","tool_name":"Edit"}' XDG_STATE_HOME=rel
t "the diary hook still nudges" valid_nudge "$OUT"
t "the diary hook keeps its marker under HOME" test -f "$HS/F1.diary"
hook mp-style-pull.sh "$(prompt_json "refactor this function" F1)" XDG_STATE_HOME=rel
t "the style-pull hook keeps its marker under HOME" test -f "$HS/F1.c"
hook mp-session-start.sh '{"session_id":"F1"}' XDG_STATE_HOME=rel
t "SessionStart clears the markers under HOME" test -z "$(find "$HS" -name 'F1.*')"
hook mp-session-start.sh '{"session_id":"F2"}' XDG_STATE_HOME=rel
cd "$here" || exit 1
t "no hook writes, clears or prunes anything in the project directory" test "$(cd "$PRJ" && find . | sort)" = "$prj_before"

section "A relative HOME is ignored"
# With no absolute XDG_STATE_HOME, a relative HOME could only resolve inside the project directory, so
# no hook keeps state there: the diary hook stays silent, the style reminder repeats, and SessionStart
# cleans nothing.
PRJ="$T/project-home"; RS="$PRJ/home/.local/state/mempalace-hooks"
mkdir -p "$RS"
date +%s >"$RS/G1.c"; echo 1 >"$RS/old"; touch -t 202001010000 "$RS/old"
prj_before="$(cd "$PRJ" && find . | sort)"
here="$PWD"; cd "$PRJ" || exit 1
hook mp-diary-capture.sh '{"session_id":"G1","tool_name":"Edit"}' HOME=home XDG_STATE_HOME=
t "the diary hook stays silent, since the cooldown cannot be kept" test "$RC$OUT$ERR" = 0
hook mp-style-pull.sh "$(prompt_json "refactor this function" G1)" HOME=home XDG_STATE_HOME=
first="$(signal "$OUT")"
hook mp-style-pull.sh "$(prompt_json "refactor this function" G1)" HOME=home XDG_STATE_HOME=
t "style-pull injects without dedup" test "$first$(signal "$OUT")" = cc
hook mp-session-start.sh '{"session_id":"G1"}' HOME=home XDG_STATE_HOME=
t "SessionStart still prints its directive" test "$RC$(lines "$OUT")" = 01
hook mp-diary-capture.sh '{"session_id":"G2","tool_name":"Edit"}' HOME=home
t "an absolute XDG_STATE_HOME is still used" test -f "$S/mempalace-hooks/G2.diary"
cd "$here" || exit 1
t "no hook writes, clears or prunes anything in the project directory" test "$(cd "$PRJ" && find . | sort)" = "$prj_before"

section "hooks.json"
SPACED="$T/with space/plug in"
mkdir -p "$SPACED"; cp -R "$ROOT/hooks" "$ROOT/setup" "$ROOT/commands" "$SPACED/"
hj() { python3 -c '
import json, sys
d = json.load(open(sys.argv[1]))["hooks"]
what = sys.argv[2]
if what == "commands":
    for groups in d.values():
        for g in groups:
            for h in g["hooks"]:
                print(h["command"])
elif what == "prompt-matcher":
    print(sum("matcher" in g for g in d["UserPromptSubmit"]))
else:
    print(d[what][0].get("matcher", ""))
' "$ROOT/hooks/hooks.json" "$1"; }
t "UserPromptSubmit carries no matcher (the event ignores one)" test "$(hj prompt-matcher)" = 0
t "PostToolUse does not match the removed MultiEdit tool" not grep -q MultiEdit "$ROOT/hooks/hooks.json"
case "|$(hj PostToolUse)|" in *"|Agent|"*) ok "PostToolUse matches the Agent tool, so a returning Agent call nudges the main session";; *) no "PostToolUse matches the Agent tool, so a returning Agent call nudges the main session";; esac
t "three commands are registered" test "$(hj commands | grep -c '')" -eq 3
printf '{}' >"$T/in"
while IFS= read -r cmd; do
  env -i PATH="$TPATH" HOME="$H" XDG_STATE_HOME="$S" CLAUDE_PLUGIN_ROOT="$SPACED" sh -c "$cmd" <"$T/in" >"$T/out" 2>"$T/err"; capture
  t "runs from a path with a space, root from the environment: $cmd" test "$RC" -eq 0
  subbed="$(python3 -c 'import sys; print(sys.argv[1].replace("${CLAUDE_PLUGIN_ROOT}", sys.argv[2]))' "$cmd" "$SPACED")"
  env -i PATH="$TPATH" HOME="$H" XDG_STATE_HOME="$S" sh -c "$subbed" <"$T/in" >"$T/out" 2>"$T/err"; capture
  t "runs from a path with a space, root substituted: $cmd" test "$RC" -eq 0
done <<EOF
$(hj commands)
EOF

section "Command files: only the user starts them, and they pre-approve only their own script"
front_of() { awk 'NR == 1 && $0 == "---" { f = 1; next } f && $0 == "---" { exit } f' "$1"; }
body_of() { awk 'NR == 1 && $0 == "---" { f = 1; next } f == 1 && $0 == "---" { f = 2; next } f == 2' "$1"; }
tools_of() {   # The allowed-tools entries, one per line: a YAML list, or a comma-separated value on one line.
  front_of "$1" | awk '
    /^allowed-tools:/ {
      on = 1
      sub(/^allowed-tools:[ ]*/, "")
      if ($0 != "") { n = split($0, part, /,[ ]*/); for (i = 1; i <= n; i++) print part[i] }
      next
    }
    on && /^[ ]+- / { sub(/^[ ]+- /, ""); print; next }
    { on = 0 }' | sed "s/^'//; s/'\$//"
}
fenced() { body_of "$1" | awk '/^```bash$/ { on = 1; next } on && /^```$/ { on = 0; next } on'; }
for pair in setup.md:setup.sh uninstall.md:uninstall.sh; do
  f="$ROOT/commands/${pair%%:*}"; script="${pair#*:}"
  t "${pair%%:*} opens its frontmatter on line 1" test "$(sed -n '1p' "$f")" = "---"
  # Spelled exactly: Claude Code ignores a key it does not recognise.
  t "${pair%%:*}: only the user can start it (disable-model-invocation: true)" \
    test "$(front_of "$f" | grep -c '^disable-model-invocation:')$(front_of "$f" | grep -c -x 'disable-model-invocation: true')" = 11
  # The whole grant, so that any other entry, a wildcard or bare Bash fails here: the script with each
  # scope, as exact commands.
  rules="$(printf 'bash "${CLAUDE_PLUGIN_ROOT}/setup/%s" global\nbash "${CLAUDE_PLUGIN_ROOT}/setup/%s" local\n' "$script" "$script")"
  t "${pair%%:*}: allowed-tools is exactly its script with global and with local" \
    test "$(tools_of "$f" | sort)" = "$(printf '%s\n' "$rules" | sed 's/^/Bash(/; s/$/)/' | sort)"
  t "${pair%%:*}: the body's commands are the pre-approved ones, character for character" \
    test "$(fenced "$f" | sort)" = "$(printf '%s\n' "$rules" | sort)"
done

section "Command files, from a path with a space"
P="$T/my project"; mkdir -p "$P"
command_line() {   # The body's command for a scope, with the plugin root filled in: command_line <file> <scope>
  fenced "$ROOT/commands/$1" | python3 -c '
import sys
lines = [l for l in sys.stdin.read().split("\n") if l.endswith(" " + sys.argv[2])]
print(lines[0].replace("${CLAUDE_PLUGIN_ROOT}", sys.argv[1]) if len(lines) == 1 else "exit 99")
' "$SPACED" "$2"
}
run_in "$P" sh -c "$(command_line setup.md local)"
t "/mempalace-hooks:setup local runs" test "$RC" -eq 0
t "/mempalace-hooks:setup local writes the block" test "$(count "^$BEGIN" "$P/CLAUDE.md")" -eq 1
run_in "$P" sh -c "$(command_line uninstall.md local)"
t "/mempalace-hooks:uninstall local runs" test "$RC" -eq 0
t "/mempalace-hooks:uninstall local removes the block" test "$(count "^$BEGIN" "$P/CLAUDE.md")" -eq 0
run_in "$P" sh -c "$(command_line setup.md global)"
t "/mempalace-hooks:setup global writes the block under the scratch home" test "$RC$(count "^$BEGIN" "$H/.claude/CLAUDE.md")" = 01
run_in "$P" sh -c "$(command_line uninstall.md global)"
t "/mempalace-hooks:uninstall global removes it" test "$RC$(count "^$BEGIN" "$H/.claude/CLAUDE.md")" = 00
rm -rf "$H/.claude"

section "Setup and uninstall: the normal round trip"
setup() { local dir="$1"; shift; run_in "$dir" "$SH" "$ROOT/setup/setup.sh" ${1+"$@"}; }
uninstall() { local dir="$1"; shift; run_in "$dir" "$SH" "$ROOT/setup/uninstall.sh" ${1+"$@"}; }
t "the template opens with the BEGIN marker line" test "$(sed -n '1p' "$ROOT/setup/mempalace-block.md" | cut -c1-26)" = "$BEGIN"
t "the template closes with the END marker line" test "$(tail -n 1 "$ROOT/setup/mempalace-block.md")" = "$END"
P="$T/fresh"; mkdir -p "$P"
setup "$P" local
t "fresh install exits 0" test "$RC" -eq 0
t "fresh install writes the template, byte for byte" cmp -s "$P/CLAUDE.md" "$ROOT/setup/mempalace-block.md"
t "fresh install leaves no backup of a file that did not exist" test "$(backups "$P")" -eq 0
setup "$P" local
t "re-run keeps exactly one block" test "$(count "^$BEGIN" "$P/CLAUDE.md")$(count "^$END\$" "$P/CLAUDE.md")" = 11
t "re-run with nothing to change writes no backup" test "$(backups "$P")" -eq 0
t "setup points at the uninstall command, not a path inside the plugin" not grep -q 'uninstall.sh' "$T/out"

P="$T/notes"; mkdir -p "$P"
printf '# Project rules\n\nRule A.\n' >"$P/CLAUDE.md"; cp "$P/CLAUDE.md" "$T/notes.orig"
setup "$P" local
t "setup keeps the user's text" grep -q '^Rule A\.$' "$P/CLAUDE.md"
t "setup backs up the file it is about to change" test "$(backups "$P")" -eq 1
# Force the collision: give the current second and the next few a backup already, so uninstall
# lands on a taken name whichever second it runs in.
cp "$P/CLAUDE.md" "$T/notes.block"
now="$(date +%s)"
for d in 0 1 2 3 4 5; do
  b="$P/CLAUDE.md.mempalace-hooks-bak.$((now + d))"; [ -e "$b" ] || cp "$T/notes.orig" "$b"
done
uninstall "$P" local
t "uninstall restores the file byte for byte" cmp -s "$P/CLAUDE.md" "$T/notes.orig"
kept=1
for d in 0 1 2 3 4 5; do cmp -s "$P/CLAUDE.md.mempalace-hooks-bak.$((now + d))" "$T/notes.orig" || kept=0; done
t "a backup already taken in the same second is not overwritten" test "$kept" -eq 1
found=0
for b in "$P"/CLAUDE.md.mempalace-hooks-bak.*.1; do cmp -s "$b" "$T/notes.block" && found=1; done
t "the second run in that second writes its backup with a .1 suffix" test "$found" -eq 1
before="$(backups "$P")"
uninstall "$P" local
t "uninstall with no block exits 0" test "$RC" -eq 0
t "uninstall with no block writes no backup" test "$(backups "$P")" -eq "$before"

P="$T/middle"; mkdir -p "$P"
{ printf 'Top.\n\n'; cat "$ROOT/setup/mempalace-block.md"; printf '\nBottom.\n'; } >"$P/CLAUDE.md"
setup "$P" local
t "a block in mid-file is replaced by one at the end" test "$(count "^$BEGIN" "$P/CLAUDE.md")$(tail -n 1 "$P/CLAUDE.md")" = "1$END"
t "the text on both sides of it is kept" test "$(count '^Top\.$' "$P/CLAUDE.md")$(count '^Bottom\.$' "$P/CLAUDE.md")" = 11

setup "$T" global
t "global scope writes ~/.claude/CLAUDE.md under the scratch home" test "$(count "^$BEGIN" "$H/.claude/CLAUDE.md")" -eq 1
t "global scope leaves the working directory alone" not test -e "$T/CLAUDE.md"

P="$T/elsewhere"; OTHER="$T/older install"; mkdir -p "$P" "$OTHER/setup"
printf 'An older template.\n' >"$OTHER/setup/mempalace-block.md"   # And no block.py, as before 1.2.0.
run_in "$P" CLAUDE_PLUGIN_ROOT="$OTHER" "$SH" "$ROOT/setup/setup.sh" local
t "setup ignores a CLAUDE_PLUGIN_ROOT naming another install" test "$RC" -eq 0
t "setup writes the template that sits beside it" cmp -s "$P/CLAUDE.md" "$ROOT/setup/mempalace-block.md"

P="$T/bom"; mkdir -p "$P"
{ printf '\357\273\277'; cat "$ROOT/setup/mempalace-block.md"; printf '\nMine.\n'; } >"$P/CLAUDE.md"
bom() { head -c 3 "$1" | od -An -tx1 | tr -d ' \n'; }
setup "$P" local
t "a file opening with a byte order mark and the BEGIN line is updated" test "$RC$(count 'MEMPALACE-HOOKS:BEGIN' "$P/CLAUDE.md")$(count '^Mine\.$' "$P/CLAUDE.md")" = 011
t "setup keeps the byte order mark" test "$(bom "$P/CLAUDE.md")" = efbbbf
before="$(backups "$P")"
setup "$P" local
t "a second setup on that file has nothing to change" test "$RC$(backups "$P")" = "0$before"
uninstall "$P" local
t "uninstall removes the block from that file" test "$RC$(count 'MEMPALACE-HOOKS' "$P/CLAUDE.md")$(count '^Mine\.$' "$P/CLAUDE.md")" = 001
t "uninstall keeps the byte order mark" test "$(bom "$P/CLAUDE.md")" = efbbbf

section "Setup and uninstall: damaged or quoted markers"
refuses() {   # Both scripts must stop and leave the file alone: refuses <label> <fixture file>
  local label="$1" fixture="$2" P="$T/damaged"
  for script in setup uninstall; do
    rm -rf "$P"; mkdir -p "$P"; cp "$fixture" "$P/CLAUDE.md"
    "$script" "$P" local
    t "$script refuses a file with $label" test "$RC" -ne 0
    t "$script leaves that file byte for byte" cmp -s "$P/CLAUDE.md" "$fixture"
    t "$script names the problem line" grep -q 'line [0-9]' "$T/out"
    t "$script writes no backup when it changes nothing" test "$(backups "$P")" -eq 0
  done
}
cat >"$T/orphan.md" <<EOF
# Project rules

Rule A.

$BEGIN — an older managed block whose END line was lost -->
## Long-running memory (mempalace)

Old block text.

## Deploy rules

Never force-push main.
EOF
refuses "a missing END marker" "$T/orphan.md"

cat >"$T/mispaired.md" <<EOF
# Notes
$END
Rule A.
$BEGIN — orphan -->
## Deploy rules
Never force-push main.
$BEGIN — fresh -->
Block body.
$END
EOF
refuses "balanced counts but mispaired markers" "$T/mispaired.md"

# A block that lost its END line, and further down an END line quoted in a fenced example: pairing the
# two would delete the user's section between them.
{ printf '# Rules\n\n'; sed '$d' "$ROOT/setup/mempalace-block.md"
  printf '\n## Deploy rules\n\nNever force-push main.\n\n```\n%s\n```\n' "$END"; } >"$T/fenced.md"
refuses "a lost END line and an END quoted in a \`\`\` fence further down" "$T/fenced.md"
{ printf '# Rules\n\n'; sed '$d' "$ROOT/setup/mempalace-block.md"
  printf '\n## Deploy rules\n\n```sh\ngit push\n```\n\n~~~~markdown\n%s\n~~~~\n' "$END"; } >"$T/tilde.md"
refuses "a lost END line and an END quoted in a ~~~ fence after other code" "$T/tilde.md"

# Fences count from line 1, so a marker line inside one stops both scripts, wherever the fence opens.
# Here a BEGIN line and an END line are quoted in two fenced examples: pairing them would delete the
# user's section between the examples.
printf '# Notes\n\nThe opening marker:\n\n```\n%s -->\n```\n\n## My deploy rules\n\nNever force-push main.\n\nThe closing marker:\n\n```\n%s\n```\n\nEnd.\n' "$BEGIN" "$END" >"$T/twofence.md"
refuses "a BEGIN and an END quoted in two separate fences" "$T/twofence.md"
printf '# Notes\n\n~~~markdown\n%s -->\nExample.\n%s\n~~~\n\nMine.\n' "$BEGIN" "$END" >"$T/onefence.md"
refuses "a whole marker pair quoted in one fence" "$T/onefence.md"
{ printf 'Top.\n\n```sh\ngit push\n\n'; cat "$ROOT/setup/mempalace-block.md"; } >"$T/unclosed-above.md"
refuses "a block below a code fence that is never closed" "$T/unclosed-above.md"
printf '# Notes\n\n```markdown\n  %s -->\n  Example.\n  %s\n```\n\nMine.\n' "$BEGIN" "$END" >"$T/indented.md"
P="$T/indented"; mkdir -p "$P"; cp "$T/indented.md" "$P/CLAUDE.md"
setup "$P" local
t "setup accepts indented markers quoted in a fence" test "$RC$(count "^$BEGIN" "$P/CLAUDE.md")" = 01
uninstall "$P" local
t "uninstall then restores that file byte for byte" cmp -s "$P/CLAUDE.md" "$T/indented.md"

# Setup would append the block inside a fence that is never closed, where no later run could find it.
P="$T/unclosed"; mkdir -p "$P"
printf 'Top.\n\n```sh\ngit push\n' >"$T/unclosed.md"; cp "$T/unclosed.md" "$P/CLAUDE.md"
setup "$P" local
t "setup refuses a file that ends inside a code fence never closed" test "$RC" -ne 0
t "setup leaves that file byte for byte" cmp -s "$P/CLAUDE.md" "$T/unclosed.md"
t "setup names the line that opens the fence" grep -q 'line 3' "$T/out"
t "setup writes no backup of that file" test "$(backups "$P")" -eq 0
uninstall "$P" local
t "uninstall finds no block in that file" test "$RC" -eq 0
t "uninstall leaves that file byte for byte" cmp -s "$P/CLAUDE.md" "$T/unclosed.md"

# Only a line feed ends a line. A marker after a form feed or a U+2028 sits within a line, and the
# line numbers in a message match the lines an editor shows.
{ printf '# Rules\n\n'; sed '$d' "$ROOT/setup/mempalace-block.md"
  printf '\n## Deploy\nNever force-push main.\nSee\014%s\n' "$END"; } >"$T/formfeed.md"
refuses "a lost END line and an END after a form feed" "$T/formfeed.md"

printf '# Notes\nKeep this rule.\nThe markers look like\342\200\250%s -->\342\200\250and my own text here\342\200\250%s\342\200\250End.\n' "$BEGIN" "$END" >"$T/linesep.md"
P="$T/linesep"; mkdir -p "$P"; cp "$T/linesep.md" "$P/CLAUDE.md"
uninstall "$P" local
t "uninstall finds no block in markers set apart by U+2028" test "$RC" -eq 0
t "uninstall leaves that file byte for byte" cmp -s "$P/CLAUDE.md" "$T/linesep.md"
setup "$P" local; uninstall "$P" local
t "setup then uninstall restore that file byte for byte" cmp -s "$P/CLAUDE.md" "$T/linesep.md"

P="$T/nofinal"; mkdir -p "$P"
printf '# Notes\nLast line, no line feed after it.' >"$T/nofinal.md"; cp "$T/nofinal.md" "$P/CLAUDE.md"
setup "$P" local
t "setup keeps a last line that has no line feed" grep -q -x 'Last line, no line feed after it\.' "$P/CLAUDE.md"
setup "$P" local
t "a second setup on a file with no final line feed has nothing to change" grep -q 'nothing to change' "$T/out"

P="$T/lineno"; mkdir -p "$P"
{ printf '# Rules\342\200\250and more\n\n'; sed '$d' "$ROOT/setup/mempalace-block.md"; } >"$P/CLAUDE.md"
uninstall "$P" local
t "a message counts lines by line feeds alone" grep -q 'line 3 opens a block' "$T/out"

P="$T/snippet"; mkdir -p "$P"
{ printf 'Top.\n\n%s — hand-edited -->\nOld text.\n```\nsnippet\n```\n%s\nBottom.\n' "$BEGIN" "$END"; } >"$P/CLAUDE.md"
setup "$P" local
t "a closed code fence inside a block does not stop setup" test "$RC$(count "^$BEGIN" "$P/CLAUDE.md")" = 01
t "setup replaces that block and keeps the text around it" test "$(count '^snippet$' "$P/CLAUDE.md")$(count '^Top\.$' "$P/CLAUDE.md")$(count '^Bottom\.$' "$P/CLAUDE.md")" = 011

cat >"$T/quoted.md" <<EOF
# Notes

The plugin block sits between \`$BEGIN -->\` and \`$END\` markers.

- \`$BEGIN -->\` opens the block.
- Keep me too.
- \`$END\` closes it.
EOF
P="$T/quoted"; mkdir -p "$P"; cp "$T/quoted.md" "$P/CLAUDE.md"
setup "$P" local; setup "$P" local
t "setup accepts markers quoted inside the user's text" test "$RC" -eq 0
kept=1
while IFS= read -r line; do
  [ -z "$line" ] || grep -q -F -x -- "$line" "$P/CLAUDE.md" || kept=0
done <"$T/quoted.md"
t "setup keeps every line that quotes a marker" test "$kept" -eq 1
t "setup adds exactly one real block" test "$(count "^$BEGIN" "$P/CLAUDE.md")$(count "^$END\$" "$P/CLAUDE.md")" = 11
uninstall "$P" local
t "uninstall removes the real block and nothing else" cmp -s "$P/CLAUDE.md" "$T/quoted.md"

P="$T/crlf"; mkdir -p "$P"
printf 'Line one\r\nLine two\r\n' >"$P/CLAUDE.md"; cp "$P/CLAUDE.md" "$T/crlf.orig"
setup "$P" local; setup "$P" local
t "a CRLF file gets exactly one block after two runs" test "$(count "^$BEGIN" "$P/CLAUDE.md")" -eq 1
t "a CRLF file keeps its line endings" test "$(count "$(printf '\r')\$" "$P/CLAUDE.md")" -eq "$(grep -c '' "$P/CLAUDE.md")"
uninstall "$P" local
t "uninstall restores the CRLF file byte for byte" cmp -s "$P/CLAUDE.md" "$T/crlf.orig"

section "Setup and uninstall: scope"
P="$T/noscope"; mkdir -p "$P"; printf 'Mine.\n' >"$P/CLAUDE.md"
setup "$P"
t "setup with no scope and no terminal stops" test "$RC" -ne 0
t "setup with no scope prints usage" grep -q -i 'usage' "$T/out"
t "setup with no scope changes nothing" test "$(cat "$P/CLAUDE.md")$(backups "$P")" = "Mine.0"
{ printf 'Mine.\n\n'; cat "$ROOT/setup/mempalace-block.md"; } >"$P/CLAUDE.md"; cp "$P/CLAUDE.md" "$T/noscope.orig"
uninstall "$P"
t "uninstall with no scope and no terminal stops" test "$RC" -ne 0
t "uninstall with no scope changes nothing" cmp -s "$P/CLAUDE.md" "$T/noscope.orig"
setup "$P" --help
t "an unknown scope is rejected" test "$RC" -ne 0
uninstall "$P" LOCAL
t "the scope is case-insensitive (uninstall LOCAL)" test "$RC$(count "^$BEGIN" "$P/CLAUDE.md")" = 00
rm -rf "$H/.claude"
setup "$P" Global
t "the scope is case-insensitive (setup Global)" test "$RC$(count "^$BEGIN" "$H/.claude/CLAUDE.md")" = 01

if [ "$HAVE_PTY" -eq 1 ]; then
  cp "$T/noscope.orig" "$P/CLAUDE.md"
  on_pty "$P" n "$SH" "$ROOT/setup/uninstall.sh"
  t "uninstall on a terminal: an unrecognised answer cancels" test "$RC" -ne 0
  t "uninstall on a terminal: a cancelled run changes nothing" cmp -s "$P/CLAUDE.md" "$T/noscope.orig"
  on_pty "$P" l "$SH" "$ROOT/setup/uninstall.sh"
  t "uninstall on a terminal: answering l removes the local block" test "$RC$(count "^$BEGIN" "$P/CLAUDE.md")" = 00
  on_pty "$P" q "$SH" "$ROOT/setup/setup.sh"
  t "setup on a terminal: an unrecognised answer cancels" test "$RC$(count "^$BEGIN" "$P/CLAUDE.md")" = 10
  on_pty "$P" l "$SH" "$ROOT/setup/setup.sh"
  t "setup on a terminal: answering l installs locally" test "$RC$(count "^$BEGIN" "$P/CLAUDE.md")" = 01
else
  printf 'skip the terminal cases: no pseudo-terminal available here\n'
fi

section "Setup and uninstall: symlinks"
# A dangling link planted at each backup name this run could pick must not be written through.
P="$T/planted"; mkdir -p "$P"
printf '# Rules\n\nRule P.\n' >"$P/CLAUDE.md"
now="$(date +%s)"
for d in 0 1 2 3 4 5; do ln -s "$T/victim-$d" "$P/CLAUDE.md.mempalace-hooks-bak.$((now + d))"; done
setup "$P" local
t "setup with links at the backup names exits 0" test "$RC" -eq 0
victims=0; for d in 0 1 2 3 4 5; do [ -e "$T/victim-$d" ] && victims=$((victims + 1)); done
t "no file is created through a link at a backup name" test "$victims" -eq 0
regular=0; for b in "$P"/CLAUDE.md.mempalace-hooks-bak.*; do [ -f "$b" ] && [ ! -L "$b" ] && regular=$((regular + 1)); done
t "the backup is a regular file at a free name" test "$regular" -eq 1
t "the backup is readable by its owner only" test "$(ls -l "$P"/CLAUDE.md.mempalace-hooks-bak.*.1 2>/dev/null | cut -c1-10)" = "-rw-------"

# A cloned repository's CLAUDE.md could point at a shell startup file.
P="$T/link-rc"; mkdir -p "$P" "$T/rc"
printf 'export PATH=/usr/bin\n' >"$T/rc/zshrc"; cp "$T/rc/zshrc" "$T/zshrc.orig"
ln -s "$T/rc/zshrc" "$P/CLAUDE.md"
setup "$P" local
t "setup refuses a CLAUDE.md that links to a file that is not Markdown" test "$RC" -eq 1
t "the refusal says why" grep -q 'not a Markdown file' "$T/out"
t "the linked file is unchanged" cmp -s "$T/rc/zshrc" "$T/zshrc.orig"
t "no backup is left beside the link" test "$(backups "$P")" -eq 0

# A dotfiles setup links CLAUDE.md to a Markdown file elsewhere: that is written through.
P="$T/link-md"; mkdir -p "$P" "$T/dotfiles"
printf '# Dotfiles rules\n\nRule D.\n' >"$T/dotfiles/CLAUDE.md"
ln -s "$T/dotfiles/CLAUDE.md" "$P/CLAUDE.md"
setup "$P" local
t "setup writes through a link to a Markdown file" test "$RC" -eq 0 -a "$(count "^$BEGIN" "$T/dotfiles/CLAUDE.md")" -eq 1
t "the link is still a link" test -L "$P/CLAUDE.md"
t "the user's text in the linked file is kept" grep -q '^Rule D\.$' "$T/dotfiles/CLAUDE.md"
uninstall "$P" local
t "uninstall removes the block through the link" test "$RC" -eq 0 -a "$(count "^$BEGIN" "$T/dotfiles/CLAUDE.md")" -eq 0

# A link to nothing would create a file wherever it points.
P="$T/link-none"; mkdir -p "$P"
ln -s "$T/nowhere/CLAUDE.md" "$P/CLAUDE.md"
setup "$P" local
t "setup refuses a CLAUDE.md that links to nothing" test "$RC" -eq 1
t "nothing is created at the link's target" test ! -e "$T/nowhere/CLAUDE.md"

section "Housekeeping"
t "the plugin directory is unchanged by the run" test "$tree_before" = "$(cd "$ROOT" && find . -not -name '*.pyc' -not -name '__pycache__' | sort)"

printf '\n%d passed, %d failed\n' "$passed" "$failed"
[ "$failed" -eq 0 ]
