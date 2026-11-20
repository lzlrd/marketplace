#! /usr/bin/env bash

# Reload-claude-md · tests for the discovery script and for what the skill pre-approves. Builds a
# scratch tree with spaces and links in its paths under $TMPDIR, and a git repository with a
# worktree in it, runs the script from several working directories with HOME pointed into that
# tree, and compares the listed paths with the expected ones. Then reads the skill file: the exact
# tools it pre-approves, that its body runs the pre-approved command, that Claude cannot start it by
# itself, how it applies claudeMdExcludes, and that its settings search prints only that key.

# Run: bash reload-claude-md/tst/run.sh
# DISCOVER=<script> and SKILL=<file> point the tests at another copy, such as an older one. The
# script under test runs with the same bash that runs this file. Scratch is removed on exit. The
# worktree tests need git, and the settings search tests need ripgrep or perl; each set is skipped,
# with a line saying so, when what it needs is missing.

set -u
export LC_ALL=C
# Git variables that a git hook running these tests would set point git at that hook's repository.
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_COMMON_DIR GIT_OBJECT_DIRECTORY CDPATH

here="$(cd "$(dirname "$0")" && pwd -P)"
plugin="$(dirname "$here")"
skill="${SKILL:-$plugin/skills/reload-claude-md/SKILL.md}"
discover="${DISCOVER:-$plugin/skills/reload-claude-md/scripts/discover.sh}"
sh="${BASH:-bash}"

pass=0
fail=0

ok() {
  pass=$((pass + 1))
  printf 'ok   %s\n' "$1"
}

bad() {
  fail=$((fail + 1))
  printf 'FAIL %s\n' "$1"
  [ $# -gt 1 ] && printf '%s\n' "$2" | sed 's/^/       /'
  return 0
}

# Has <name> <lines> <line>: the line is one of the lines.
has() {
  if printf '%s\n' "$2" | grep -Fxq -- "$3"; then ok "$1"; else bad "$1" "not listed: $3"; fi
}

# Lacks <name> <lines> <text>: no line contains the text.
lacks() {
  if printf '%s\n' "$2" | grep -Fq -- "$3"; then
    bad "$1" "listed: $(printf '%s\n' "$2" | grep -F -- "$3")"
  else
    ok "$1"
  fi
}

# Same <name> <expected lines> <actual lines>.
same() {
  if [ "$2" = "$3" ]; then
    ok "$1"
  else
    bad "$1" "expected:
$2
got:
$3"
  fi
}

# Put <file> <text>: write a file, creating its directory.
put() {
  mkdir -p "$(dirname "$1")" && printf '%s\n' "$2" > "$1"
}

tmp="$(mktemp -d "${TMPDIR:-/tmp}/reload-claude-md-tst.XXXXXX")" || exit 1
trap 'rm -rf "$tmp"' EXIT
root="$(cd "$tmp" && pwd -P)"
home="$root/fake home"
proj="$home/My Projects/app one"
# The same two directories as the tests name them: relative to the scratch tree.
up="fake home/My Projects"
app="$up/app one"

# List <cwd> [VAR=value ...]: run the script there and print the paths it lists under the scratch
# tree, sorted, without the tree's own prefix. Paths above the tree are real ancestors and are left
# out of the comparison.
list() {
  local cwd="$1" line
  shift
  (cd "$cwd" && env -u CLAUDE_CONFIG_DIR HOME="$home" ${1+"$@"} "$sh" "$discover") |
    while IFS= read -r line; do
      case "$line" in "$root"/*) printf '%s\n' "${line#"$root"/}" ;; esac
    done | sort
}

# Not_files: print the lines on stdin that are not absolute paths to existing files.
not_files() {
  local line
  while IFS= read -r line; do
    case "$line" in
      /*) [ -f "$line" ] || printf '%s\n' "$line" ;;
      *) printf '%s\n' "$line" ;;
    esac
  done
}

# The tree. In effect: the user file, the chain from the working directory up, local files, and
# nested files down to five directories below the working directory.
put "$home/.claude/CLAUDE.md" "user"
put "$home/alt config/CLAUDE.md" "user, other config directory"
put "$home/My Projects/CLAUDE.md" "parent"
put "$home/My Projects/.claude/CLAUDE.md" "parent, in .claude"
put "$home/My Projects/CLAUDE.local.md" "parent, local"
put "$proj/CLAUDE.md" "project"
put "$proj/.claude/CLAUDE.md" "project, in .claude"
put "$proj/CLAUDE.local.md" "project, local"
put "$proj/packages/a/CLAUDE.md" "nested"
put "$proj/packages/a/CLAUDE.local.md" "nested, local"
put "$proj/sp ace/CLAUDE.md" "nested, space in the directory name"
put "$proj/vendor/lib/CLAUDE.md" "nested, vendored"
put "$proj/d1/d2/d3/d4/d5/CLAUDE.md" "nested, five directories down"
put "$proj/d1/d2/d3/d4/d5/d6/CLAUDE.md" "nested, six directories down"

# Not in effect: copies in other worktrees, in dependency and environment directories, a directory
# named like a memory file, and a link to nothing.
put "$proj/.claude/worktrees/wt1/CLAUDE.md" "worktree copy"
put "$proj/.claude/worktrees/wt1/pkg/CLAUDE.md" "worktree copy, nested"
put "$proj/.git/CLAUDE.md" "inside .git"
put "$proj/node_modules/dep/CLAUDE.md" "dependency"
put "$proj/.venv/lib/python3/site-packages/pkg/CLAUDE.md" "environment"
put "$proj/venv/lib/CLAUDE.md" "environment"
mkdir -p "$proj/odd/CLAUDE.md" "$proj/dangling"
ln -s "missing.md" "$proj/dangling/CLAUDE.md"

# Links: one file reached a second time through a link, and a CLAUDE.md that links to AGENTS.md.
mkdir -p "$proj/link" "$proj/packages/b"
ln -s "../packages/a/CLAUDE.md" "$proj/link/CLAUDE.md"
put "$proj/packages/b/AGENTS.md" "agents"
ln -s "AGENTS.md" "$proj/packages/b/CLAUDE.md"

# Working directories named like a pruned directory, and one with nothing to find.
put "$home/My Projects/venv/CLAUDE.md" "project that is itself named venv"
put "$home/My Projects/venv/sub/CLAUDE.md" "nested under it"
put "$home/My Projects/node_modules/sub/CLAUDE.md" "nested under a directory named node_modules"
mkdir -p "$root/bare/work" "$root/bare/home"

# Working directories reached through links: one below a linked directory, and one that is a link.
ln -s "fake home" "$root/home link"
ln -s "app one" "$home/My Projects/app alias"

printf '# discovery: %s\n' "$discover"

out="$(list "$proj")"
has "user file is listed" "$out" "fake home/.claude/CLAUDE.md"
has "parent directory's CLAUDE.md is listed" "$out" "$up/CLAUDE.md"
has "parent directory's .claude/CLAUDE.md is listed" "$out" "$up/.claude/CLAUDE.md"
has "parent directory's CLAUDE.local.md is listed" "$out" "$up/CLAUDE.local.md"
has "working directory's CLAUDE.md is listed" "$out" "$app/CLAUDE.md"
has "working directory's .claude/CLAUDE.md is listed" "$out" "$app/.claude/CLAUDE.md"
has "working directory's CLAUDE.local.md is listed" "$out" "$app/CLAUDE.local.md"
has "nested CLAUDE.md is listed" "$out" "$app/packages/a/CLAUDE.md"
has "nested CLAUDE.local.md is listed" "$out" "$app/packages/a/CLAUDE.local.md"
has "nested file under a directory with a space is listed" "$out" "$app/sp ace/CLAUDE.md"
has "vendored nested file is listed (documented)" "$out" "$app/vendor/lib/CLAUDE.md"
has "file five directories down is listed" "$out" "$app/d1/d2/d3/d4/d5/CLAUDE.md"
lacks "file six directories down is not listed" "$out" "/d6/"
lacks "worktree copies are not listed" "$out" "/.claude/worktrees/"
lacks ".git is not searched" "$out" "/.git/"
lacks "node_modules is not searched" "$out" "/node_modules/"
lacks ".venv is not searched" "$out" "/.venv/"
lacks "venv is not searched" "$out" "/venv/"
lacks "a directory named CLAUDE.md is not listed" "$out" "/odd/"
lacks "a link to a missing file is not listed" "$out" "/dangling/"
lacks "a file reached again through a link is listed once, by its own path" "$out" "/link/"
has "a CLAUDE.md that links to AGENTS.md is listed" "$out" "$app/packages/b/CLAUDE.md"
same "no path is listed twice" "$(printf '%s\n' "$out" | sort -u)" "$out"
same "exact set from the project directory" "$(sort <<LIST
fake home/.claude/CLAUDE.md
fake home/My Projects/.claude/CLAUDE.md
fake home/My Projects/CLAUDE.local.md
fake home/My Projects/CLAUDE.md
fake home/My Projects/app one/.claude/CLAUDE.md
fake home/My Projects/app one/CLAUDE.local.md
fake home/My Projects/app one/CLAUDE.md
fake home/My Projects/app one/d1/d2/d3/d4/d5/CLAUDE.md
fake home/My Projects/app one/packages/a/CLAUDE.local.md
fake home/My Projects/app one/packages/a/CLAUDE.md
fake home/My Projects/app one/packages/b/CLAUDE.md
fake home/My Projects/app one/sp ace/CLAUDE.md
fake home/My Projects/app one/vendor/lib/CLAUDE.md
LIST
)" "$out"

# A directory under .claude/worktrees that git does not know as a worktree is an ordinary directory.
out="$(list "$proj/.claude/worktrees/wt1")"
same "from a plain directory under .claude/worktrees: its own files and the chain above it" \
  "$(sort <<LIST
fake home/.claude/CLAUDE.md
fake home/My Projects/.claude/CLAUDE.md
fake home/My Projects/CLAUDE.local.md
fake home/My Projects/CLAUDE.md
fake home/My Projects/app one/.claude/CLAUDE.md
fake home/My Projects/app one/.claude/worktrees/wt1/CLAUDE.md
fake home/My Projects/app one/.claude/worktrees/wt1/pkg/CLAUDE.md
fake home/My Projects/app one/CLAUDE.local.md
fake home/My Projects/app one/CLAUDE.md
LIST
)" "$out"

out="$(list "$home/My Projects/venv")"
has "working directory named venv: its own file is listed" "$out" "$up/venv/CLAUDE.md"
has "working directory named venv: nested files are still found" "$out" "$up/venv/sub/CLAUDE.md"
out="$(list "$home/My Projects/node_modules")"
has "working directory named node_modules: nested files are still found" "$out" \
  "$up/node_modules/sub/CLAUDE.md"

# Claude Code walks up from the working directory's real path, and the shell that runs the script
# may still hold the path through the link in PWD, which cd through the link reproduces here.
out="$(list "$root/home link/My Projects/app one")"
same "below a linked directory: the same files, by real path, as from the real directory" \
  "$(list "$proj")" "$out"
lacks "below a linked directory: no path goes through the link" "$out" "home link/"
out="$(list "$home/My Projects/app alias")"
has "working directory that is a link: nested files are listed by real path" "$out" \
  "$app/packages/a/CLAUDE.md"
lacks "working directory that is a link: no path goes through the link" "$out" "/app alias/"

# A git worktree inside its main checkout, where `claude --worktree` puts one. Claude Code loads
# CLAUDE.local.md from the main checkout's root and the directories between it and the worktree,
# but not CLAUDE.md or .claude/CLAUDE.md there. Git runs with no user or system configuration.
repo="$root/repo one"
wt="$repo/.claude/worktrees/wt1"
git_t() {
  env HOME="$home" XDG_CONFIG_HOME="$home/.config" GIT_CONFIG_NOSYSTEM=1 \
    GIT_CONFIG_GLOBAL=/dev/null git -c user.name=test -c user.email=test@example.invalid \
    -c commit.gpgsign=false -c init.defaultBranch=main "$@"
}
if command -v git > /dev/null 2>&1 && mkdir -p "$repo" && git_t -C "$repo" init -q &&
  git_t -C "$repo" commit -q --allow-empty --no-verify -m init &&
  git_t -C "$repo" worktree add -q "$wt" 2> /dev/null; then
  put "$repo/CLAUDE.md" "main checkout"
  put "$repo/.claude/CLAUDE.md" "main checkout, in .claude"
  put "$repo/CLAUDE.local.md" "main checkout, local"
  put "$repo/.claude/worktrees/CLAUDE.md" "between the two roots"
  put "$repo/.claude/worktrees/CLAUDE.local.md" "between the two roots, local"
  put "$wt/CLAUDE.md" "worktree"
  put "$wt/.claude/CLAUDE.md" "worktree, in .claude"
  put "$wt/CLAUDE.local.md" "worktree, local"
  put "$wt/pkg/CLAUDE.md" "worktree, nested"
  ln -s "repo one/.claude/worktrees/wt1" "$root/worktree link"
  in_wt="$(sort <<LIST
fake home/.claude/CLAUDE.md
repo one/.claude/worktrees/CLAUDE.local.md
repo one/.claude/worktrees/wt1/.claude/CLAUDE.md
repo one/.claude/worktrees/wt1/CLAUDE.local.md
repo one/.claude/worktrees/wt1/CLAUDE.md
repo one/.claude/worktrees/wt1/pkg/CLAUDE.md
repo one/CLAUDE.local.md
LIST
)"
  same "git worktree: its own files, and only local files from the main checkout up to it" \
    "$in_wt" "$(list "$wt")"
  same "git worktree, from a subdirectory: the same files" "$in_wt" "$(list "$wt/pkg")"
  same "git worktree, reached through a link: the same files" "$in_wt" \
    "$(list "$root/worktree link")"
  same "main checkout of that worktree: its own files" "$(sort <<LIST
fake home/.claude/CLAUDE.md
repo one/.claude/CLAUDE.md
repo one/CLAUDE.local.md
repo one/CLAUDE.md
LIST
)" "$(list "$repo")"
  have_wt=1
else
  have_wt=0
  printf 'skip git worktree tests: git could not make a repository with a worktree\n'
fi

out="$(list "$root/bare/work" "CLAUDE_CONFIG_DIR=$home/alt config")"
has "CLAUDE_CONFIG_DIR names the user file" "$out" "fake home/alt config/CLAUDE.md"
lacks "with CLAUDE_CONFIG_DIR set, ~/.claude/CLAUDE.md is not the user file" "$out" \
  "fake home/.claude/CLAUDE.md"

out="$(cd "$root/bare/work" && env -u CLAUDE_CONFIG_DIR HOME="$root/bare/home" "$sh" "$discover")"
status=$?
same "nothing to find: exit status 0" "0" "$status"
lacks "nothing to find: nothing listed under the tree" "$out" "$root/"

out="$(cd "$proj" && env -u CLAUDE_CONFIG_DIR HOME="$home" "$sh" "$discover")"
same "every line is an absolute path to a file" "" "$(printf '%s\n' "$out" | not_files)"

# A PATH with the tools the script uses, except realpath and git.
mkdir -p "$root/tools"
for tool in find sort awk cut dirname; do
  ln -s "$(command -v "$tool")" "$root/tools/$tool"
done
out="$(list "$proj" "PATH=$root/tools")"
has "without realpath: files are still listed" "$out" "$app/packages/a/CLAUDE.md"
has "without realpath: a link to a listed file is listed too" "$out" "$app/link/CLAUDE.md"
if [ "$have_wt" = 1 ]; then
  out="$(list "$wt" "PATH=$root/tools")"
  has "without git: a worktree's own files are still listed" "$out" \
    "repo one/.claude/worktrees/wt1/CLAUDE.md"
  has "without git: the main checkout's files are listed too (documented)" "$out" \
    "repo one/CLAUDE.md"
fi

printf '# skill: %s\n' "$skill"

front="$(awk 'NR == 1 && $0 == "---" { f = 1; next } f && $0 == "---" { exit } f' "$skill")"
body="$(awk '
  NR == 1 && $0 == "---" { f = 1; next }
  f == 1 && $0 == "---" { f = 2; next }
  f == 2' "$skill")"

# The allowed-tools entries, one per line: a YAML list, or a comma-separated value on one line.
tools="$(printf '%s\n' "$front" | awk '
  /^allowed-tools:/ {
    on = 1
    sub(/^allowed-tools:[ ]*/, "")
    if ($0 != "") { n = split($0, part, /,[ ]*/); for (i = 1; i <= n; i++) print part[i] }
    next
  }
  on && /^[ ]+- / { sub(/^[ ]+- /, ""); print; next }
  { on = 0 }' | sed "s/^'//; s/'\$//")"

script='${CLAUDE_SKILL_DIR}/scripts/discover.sh'
bash_rules="$(printf '%s\n' "$tools" | sed -n 's/^Bash(\(.*\))$/\1/p')"

# The whole grant, so that any other entry, scoped or not, fails here: the discovery script run
# through bash, with and without quotes and with no wildcard, and reads of the two file names.
same "allowed-tools is exactly the discovery script and reads of CLAUDE.md and CLAUDE.local.md" \
  "$(sort <<'LIST'
Bash(bash "${CLAUDE_SKILL_DIR}/scripts/discover.sh")
Bash(bash ${CLAUDE_SKILL_DIR}/scripts/discover.sh)
Read(//**/CLAUDE.md)
Read(//**/CLAUDE.local.md)
LIST
)" "$(printf '%s\n' "$tools" | sort)"

# The body line that names the script must equal one of the pre-approved commands.
ran="$(printf '%s\n' "$body" | sed 's/^[ ]*//' | grep -F -- "$script" |
  grep -Fx -f <(printf '%s\n' "$bash_rules"))"
if [ -n "$ran" ]; then
  ok "the body runs a pre-approved command, character for character"
else
  bad "the body runs a pre-approved command, character for character" \
    "no body line equals one of: $bash_rules"
fi

# Step <n>: the text of step n of the procedure, on one line with runs of spaces squeezed, so that a
# phrase is found wherever the lines wrap.
step() {
  printf '%s\n' "$body" | awk -v n="$1" '
    $0 ~ "^" n "\\. \\*\\*" { on = 1; print; next }
    on && /^[0-9]+\. \*\*/ { exit }
    on' | tr '\n' ' ' | tr -s ' '
}

# Says <name> <text> <phrase>...: the text contains every phrase.
says() {
  local name="$1" text="$2" missing="" phrase
  shift 2
  for phrase in "$@"; do
    printf '%s\n' "$text" | grep -Fq -- "$phrase" || missing="$missing
$phrase"
  done
  if [ -z "$missing" ]; then ok "$name"; else bad "$name" "the text does not say:$missing"; fi
}

has "Claude cannot start the skill by itself" "$front" "disable-model-invocation: true"
# The script reads no settings, so the body must tell Claude to apply claudeMdExcludes: the setting,
# the three settings files it is read from, and how an excluded file is reported.
says "the skill drops files matched by claudeMdExcludes, which the script does not read" \
  "$(step 1)" 'claudeMdExcludes' '`settings.json`' '`.claude/settings.json`' \
  '`.claude/settings.local.json`' 'excluded, not reloaded'
# Claude Code also matches an absolute pattern with its leading part resolved through symlinks.
says "a pattern written through a link matches the real path" "$(step 1)" \
  'its first glob character' 'is resolved through symlinks'
# Claude Code checks every import against claudeMdExcludes, and follows none out of a dropped file.
says "imports are checked against claudeMdExcludes before they are read" "$(step 3)" \
  'claudeMdExcludes' 'before you read one, compare its absolute path with the patterns' \
  'excluded, not reloaded' 'Never follow an import out of a file that was left out'
# A settings file that cannot be read leaves its exclusions unknown, so a file the session never
# loaded may be one the user excluded: it is held back, not adopted.
says "unknown exclusions hold back a file with no copy in context" "$(step 1)" \
  'leaves its exclusions unknown' 'listed or imported' \
  'do not read or adopt it unless it is the path given as the argument' \
  'not checked against exclusions'
says "a file with no baseline is adopted only when it was checked against exclusions" \
  "$(step 4)" 'adopt it whole, unless step 1 held it back as not checked against exclusions'
# Settings files can hold credentials in env, so the skill fetches the one key with a search that
# prints only what it matches.
says "settings files are searched for the one key, not read" "$(step 1)" \
  'never open one with Read' 'Grep tool' '`output_mode: "content"`' '`multiline: true`' \
  '`"-o": true`'
# Without -o, Grep prints the whole matching line: on a one-line settings file, every setting.
says "a search without -o is never run: the file counts as one whose search failed" "$(step 1)" \
  'if the Grep tool rejects that option, do not search without it' \
  'treat that file as one whose search failed'

# The pattern the skill gives, run on settings files as the Grep tool runs it with multiline and
# -o: ripgrep with -U, --multiline-dotall and -o, or perl where ripgrep is not installed.
pat="$(printf '%s\n' "$body" | sed 's/^[ ]*//' | grep -F -- '"claudeMdExcludes"\s*:' | head -n 1)"
only() {
  if command -v rg > /dev/null 2>&1; then
    rg --no-config -U --multiline-dotall -o --no-filename --no-line-number -e "$pat" -- "$1"
  else
    PAT="$pat" perl -0777 -ne 'print "$&\n" while /$ENV{PAT}/gs' -- "$1"
  fi
}
if [ -z "$pat" ]; then
  bad "the skill gives the pattern for the settings search" "no body line starts with the key"
elif ! command -v rg > /dev/null 2>&1 && ! command -v perl > /dev/null 2>&1; then
  printf 'skip settings search tests: neither ripgrep nor perl is installed\n'
else
  ok "the skill gives the pattern for the settings search"
  mkdir -p "$root/settings"
  cat > "$root/settings/pretty.json" <<'JSON'
{
  "env": {
    "ANTHROPIC_API_KEY": "FAKE-SECRET-VALUE"
  },
  "claudeMdExcludes": [
    "**/[Vv]endor/**",
    "/abs/link dir/CLAUDE.md",
    "a \"quote\", a \\ and a ] inside"
  ],
  "permissions": { "allow": ["Read(FAKE-SECRET-VALUE)"] }
}
JSON
  pad="$(printf '%0600d' 0)"
  printf '{"env":{"ANTHROPIC_AUTH_TOKEN":"FAKE-SECRET-VALUE","PAD":"%s"},%s,"model":"%s"}\n' \
    "$pad" '"claudeMdExcludes":["**/vendor/**","/a/[b]/CLAUDE.md"]' "FAKE-SECRET-VALUE" \
    > "$root/settings/one line.json"
  printf '{"env":{"AWS_BEARER_TOKEN_BEDROCK":"FAKE-SECRET-VALUE"},"claudeMdExcludes":"%s"}\n' \
    "FAKE-SECRET-VALUE" > "$root/settings/not a list.json"
  printf '{"env":{"ANTHROPIC_API_KEY":"FAKE-SECRET-VALUE"}}\n' > "$root/settings/no key.json"

  out="$(only "$root/settings/pretty.json")"
  same "settings search, pretty-printed: the key and its whole list, brackets in strings too" \
    "$(cat <<'LIST'
"claudeMdExcludes": [
    "**/[Vv]endor/**",
    "/abs/link dir/CLAUDE.md",
    "a \"quote\", a \\ and a ] inside"
  ]
LIST
)" "$out"
  out="$(only "$root/settings/one line.json")"
  same "settings search, one line of more than 500 characters: only the key and its list" \
    '"claudeMdExcludes":["**/vendor/**","/a/[b]/CLAUDE.md"]' "$out"
  out="$(only "$root/settings/not a list.json")"
  same "settings search, a value that is not a list: the key alone, which reads as unknown" \
    '"claudeMdExcludes":' "$out"
  out="$(only "$root/settings/no key.json")"
  same "settings search, no key: nothing" "" "$out"
  out="$(for f in "$root/settings"/*.json; do only "$f"; done)"
  lacks "settings search: no other setting is printed" "$out" "SECRET"
fi

same "no argument placeholder is hidden in the skill text" "" "$(grep -n '\$[0-9]' "$skill")"

printf '%s passed, %s failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
