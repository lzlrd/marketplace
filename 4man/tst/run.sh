#! /usr/bin/env bash

# 4man tests: run the git recipes the skill and /4man:code-review give, taken word for word from the
# plugin's own text where they are commands, in scratch repositories. Each section runs the recipe
# the instructions used to give and asserts its bad result, then the one they give now and asserts
# the good one.

# Every repository lives in a scratch directory with HOME, XDG_STATE_HOME and git's global and
# system config pointed away from the real ones, so nothing outside it is read or written.

# Usage: tst/run.sh [plugin-root]   (default: the plugin this file sits in)
# Scratch goes under ${TMPDIR:-/tmp} and is removed on exit; set KEEP=1 to keep it. Needs bash 3.2 or
# newer and git 2.31 or newer.

set -u

PLUGIN="$(cd "${1:-$(dirname "$0")/..}" && pwd)" || exit 2
SETUP="$PLUGIN/skills/4man/references/setup.md"
CR="$PLUGIN/commands/code-review.md"
SEC="$PLUGIN/skills/4man/references/security-pass.md"
ROOT="$(mktemp -d "${TMPDIR:-/tmp}/4man-tst.XXXXXX")" || exit 1
ROOT="$(cd "$ROOT" && pwd -P)"
cleanup() { [ "${KEEP:-0}" = "1" ] && echo "scratch kept: $ROOT" || rm -rf "$ROOT"; }
trap cleanup EXIT
mkdir -p "$ROOT/home"
export HOME="$ROOT/home"
export XDG_STATE_HOME="$ROOT/home/state"
export GIT_CONFIG_GLOBAL=/dev/null
export GIT_CONFIG_SYSTEM=/dev/null
export GIT_AUTHOR_NAME=tst GIT_AUTHOR_EMAIL=tst@example.invalid
export GIT_COMMITTER_NAME=tst GIT_COMMITTER_EMAIL=tst@example.invalid

fail=0
say() { printf '\n== %s\n' "$*"; }
ok() { printf 'ok    %s\n' "$*"; }
bad() { printf 'FAIL  %s\n' "$*"; fail=1; }
expect() { if [ "$2" = "$3" ]; then ok "$1: $3"; else bad "$1: expected [$2], got [$3]"; fi; }
flat() { tr '\n' ' ' | sed 's/ *$//'; }
# Asserts that a doc gives a command word for word (line breaks in the doc count as spaces).
need() { if tr -s ' \n' ' ' < "$1" | grep -qF -- "$2"; then ok "$(basename "$1") gives: $2"; else bad "$(basename "$1") lacks: $2"; fi; }
# A repository as Step 0 leaves it: .pipeline/ exists and is ignored (item 2's .gitignore line does
# that in a run; E7 tests the line itself, so here it goes in .git/info/exclude).
mkrepo() { rm -rf "$1" && mkdir -p "$1" && cd "$1" && git init -q -b main . && pipeline_dir || exit 1; }
pipeline_dir() { mkdir -p .pipeline && echo .pipeline/ >> "$(git rev-parse --git-path info/exclude)"; }
# The line of a fenced block in a doc that starts with a prefix, indentation dropped.
block() { awk -v p="$2" '/^ *```/ { f = !f; next } f { sub(/^ +/, ""); if (index($0, p) == 1) print }' "$1"; }

# The commands as the plugin gives them. The fenced ones are read from setup.md, so a change to the
# text changes what runs; the inline ones must appear in it word for word. Placeholders are filled in
# below and run with eval.
SNAP_CMD="$(block "$SETUP" '(export GIT_INDEX_FILE=')"
STAGED_CMD="$(block "$SETUP" 'git ls-files -s -z')"
USER_CMD="$(block "$SETUP" '(git diff --name-only')"
PREFLIGHT_CMD="$(block "$SETUP" '(git --literal-pathspecs diff')"
LISTS_CMD="$(block "$SETUP" ': > .pipeline/commit-paths')"
ASK_CMD='git diff --name-only --no-renames <start snapshot> <new snapshot> | grep -Fxf .pipeline/user-paths'
ADD_CMD='git --literal-pathspecs add --pathspec-from-file=.pipeline/commit-paths'
COMMIT_CMD='git --literal-pathspecs commit -m "<message>" --pathspec-from-file=.pipeline/commit-paths'
# What the instructions gave before: the user's paths from the start snapshot alone, read through
# process substitution, and a list without the still-uncommitted filter, which an earlier draft used.
OLD_USER_CMD='git diff --name-only --no-renames <snapshot commit> <start snapshot>'
OLD_PREFLIGHT="git --literal-pathspecs diff --name-only --no-renames <snapshot commit> <start snapshot> -- <the spec's paths>"
OLD_LIST="git diff --name-only --no-renames <start snapshot> <new snapshot> | grep -vFxf <($OLD_USER_CMD) | grep -Fxf <(git diff --name-only --no-renames HEAD <new snapshot>)"
LIST_NOFILTER='git diff --name-only --no-renames <start snapshot> <new snapshot> | grep -vFxf .pipeline/user-paths > .pipeline/commit-paths'

say "0. The commands these tests run are the ones the plugin gives"
for v in SNAP_CMD STAGED_CMD USER_CMD PREFLIGHT_CMD LISTS_CMD; do
  eval "c=\"\$$v\""
  case "$c" in
    "") bad "setup.md has no fenced command for $v" ;;
    *"
"*) bad "setup.md has more than one fenced command for $v" ;;
    *) ok "setup.md gives ($v): $c" ;;
  esac
done
for c in "$ASK_CMD" "$ADD_CMD" "$COMMIT_CMD" "test -s .pipeline/commit-paths" '| sort -u | wc -l' 'git check-ignore -q <path>' \
  'git --literal-pathspecs diff --cached --quiet -- <path>' 'An error message means a command failed' \
  'git fetch <remote> <default-branch>' 'git merge-base HEAD FETCH_HEAD' 'staged snapshot: <tree id>'; do need "$SETUP" "$c"; done
for c in '`git fetch origin <base>`) and record the base commit (`git rev-parse FETCH_HEAD`)' \
  'git diff <base commit>...<head commit>' 'git fetch --unshallow' \
  'git cat-file -e <head commit>:.claude/claude-security-guidance.md' \
  'git status --porcelain --untracked-files=all' 'a checkout that fails' \
  'For any target whose head is not the checked-out HEAD' '`git rev-parse <ref>`'; do need "$CR" "$c"; done
need "$SEC" '`--base <review base>`, the sha in the run record'
if grep -q 'rm -f "\$GIT_INDEX_FILE"' "$SETUP"; then bad "setup.md deletes the scratch index by a computed path"; else ok "setup.md leaves the scratch index in place"; fi
# Claude Code asks before it runs process substitution, or a redirect to a path built by expansion,
# and Step 5 runs while the user is away.
ps="$(find "$PLUGIN" -name '*.md' ! -path '*/tst/*' -exec grep -nE '<\(|>\(|>[[:space:]]*"?\$' {} + )"
if [ -z "$ps" ]; then ok "no process substitution or computed redirect target in the plugin's text"; else bad "needs approval to run: $ps"; fi

SC='' SS='' SG='' NS=''
fill() {
  local s="$1"
  s="${s//<snapshot commit>/$SC}"; s="${s//<start snapshot>/$SS}"; s="${s//<staged snapshot>/$SG}"; s="${s//<new snapshot>/$NS}"
  printf '%s' "$s"
}
snap() { eval "${SNAP_CMD//<base>/$1}"; }
staged_snap() { eval "$STAGED_CMD"; }
start_snapshot() { SC="$(git rev-parse HEAD)"; SS="$(snap HEAD)"; SG="$(staged_snap)"; }
user_paths() { eval "$(fill "$USER_CMD")"; }
preflight() { local c="${PREFLIGHT_CMD//"<the spec's paths>"/$1}"; eval "$(fill "$c")"; }
new_snap() { NS="$(snap "$SS")"; }
ask_list() { eval "$(fill "$ASK_CMD")"; }
write_list() { eval "$(fill "$LISTS_CMD")"; }
listfile() { printf '%s' .pipeline/commit-paths; }
commit_list() {
  local c="${COMMIT_CMD//<message>/$1}"
  if test -s .pipeline/commit-paths; then eval "$ADD_CMD" && eval "$c -q"; fi
}
# The recipe the skill gave before: status now minus the Step 0 listing.
old_set() { git status --porcelain --untracked-files=all | cut -c4- | grep -v -x -F -f "$1"; }

# A. No origin/HEAD: the fast pass's own commands fail.
say "A. /security-review inputs in a 'git init' bootstrap"
mkrepo "$ROOT/a"; git commit -q --allow-empty -m "Initial commit"
echo x > app.txt && git add app.txt && git commit -q -m "Add app"
git rev-parse --verify --quiet origin/HEAD >/dev/null; expect "origin/HEAD check exit" 1 "$?"
git diff --name-only origin/HEAD... >/dev/null 2>&1; expect "/security-review's diff exit" 128 "$?"

# B. With an origin: an uncommitted target is invisible to the three-dot diff.
say "B. Pending changes versus what /security-review diffs"
git init -q --bare -b main "$ROOT/b-origin.git"
git clone -q "$ROOT/a" "$ROOT/b" 2>/dev/null; cd "$ROOT/b" || exit 1
git remote set-url origin "$ROOT/b-origin.git" && git push -q origin main && git remote set-head origin main
echo pending >> app.txt; echo new > staged.txt && git add staged.txt
expect "the command target (git diff HEAD)" "app.txt staged.txt" "$(git diff HEAD --name-only | flat)"
expect "what /security-review reads (origin/HEAD...)" "" "$(git diff origin/HEAD... --name-only | flat)"

# C. A PR that is not checked out, in full, single-branch and shallow clones.
say "C. PR fetch: base commit from FETCH_HEAD, not origin/<base>"
git init -q --bare -b main "$ROOT/c-origin.git"
git clone -q "$ROOT/c-origin.git" "$ROOT/c-seed" 2>/dev/null; cd "$ROOT/c-seed" || exit 1
for i in 1 2 3; do echo "$i" > "base$i.txt"; git add .; git commit -q -m "base $i"; done
git push -q origin main; git push -q origin main:release
git checkout -q -b pr && echo pr > pr.txt && git add . && git commit -q -m "PR work" && git push -q origin pr:refs/pull/9/head
git checkout -q main && echo 4 > base4.txt && git add . && git commit -q -m "base 4" && git push -q origin main main:release
old_pr() { git fetch -q origin release && git fetch -q origin pull/9/head && git diff --name-only "origin/release...$(git rev-parse FETCH_HEAD)" 2>&1; }
new_pr() {
  git fetch -q origin release && b="$(git rev-parse FETCH_HEAD)" &&
    git fetch -q origin pull/9/head && h="$(git rev-parse FETCH_HEAD)" && git diff --name-only "$b...$h" 2>&1
}
git clone -q --single-branch --branch main "$ROOT/c-origin.git" "$ROOT/c-single" 2>/dev/null; cd "$ROOT/c-single" || exit 1
out="$(old_pr)"; expect "single-branch clone, old recipe exit" 128 "$?"
expect "single-branch clone, new recipe" "pr.txt" "$(new_pr | flat)"
git clone -q --depth 1 "file://$ROOT/c-origin.git" "$ROOT/c-shallow" 2>/dev/null; cd "$ROOT/c-shallow" || exit 1
out="$(new_pr)"; st=$?
case "$out" in *"no merge base"*) ok "shallow clone, new recipe reports 'no merge base' (exit $st)" ;; *) bad "shallow clone: expected 'no merge base', got [$out]" ;; esac
git fetch -q --unshallow origin 2>/dev/null
expect "shallow clone after git fetch --unshallow" "pr.txt" "$(new_pr | flat)"

# D. New-project mode: commits through one shared index.
say "D. Shared index: bare commit sweeps, path-limited commit does not"
mkrepo "$ROOT/d"; git commit -q --allow-empty -m "Initial commit"
mkdir unit_a unit_b && echo a > unit_a/a.txt && echo b > unit_b/b.txt
git add unit_b/b.txt; git add unit_a/a.txt && git commit -q -m "unit A, bare commit"
expect "bare commit holds" "unit_a/a.txt unit_b/b.txt" "$(git show --name-only --format= HEAD | flat)"
git reset -q --soft HEAD~1 && git reset -q
git add unit_b/b.txt; git add unit_a/a.txt && git commit -q -m "unit A, path-limited" -- unit_a/a.txt
expect "path-limited commit holds" "unit_a/a.txt" "$(git show --name-only --format= HEAD | flat)"
expect "still staged for the sibling" "unit_b/b.txt" "$(git diff --cached --name-only | flat)"

say "D2. Five Coders committing at once, with the index.lock retry"
mkrepo "$ROOT/d2"; git commit -q --allow-empty -m "Initial commit"
for i in 1 2 3 4 5; do mkdir "u$i"; for j in $(seq 1 40); do echo "$i $j" > "u$i/f$j.txt"; done; done
for i in 1 2 3 4 5; do
  (
    n=0
    until git add "u$i" 2>/dev/null && git commit -q -m "unit $i" -- "u$i" 2>/dev/null; do
      n=$((n + 1)); [ "$n" -gt 200 ] && exit 1; sleep 0.05
    done
  ) &
done
wait
expect "unit commits" 5 "$(( $(git rev-list --count HEAD) - 1 ))"
mixed=0; for c in $(git rev-list HEAD); do [ "$(git show --name-only --format= "$c" | cut -d/ -f1 | sort -u | wc -l)" -gt 1 ] && mixed=1; done
expect "commits mixing units" 0 "$mixed"

# E. The user's uncommitted work: start snapshot, Step 5.3, continue.
say "E1. A lockfile the user had dirty, rewritten by the crew's install"
mkrepo "$ROOT/e1"
printf '{ "deps": {} }\n' > package.json; printf '{ "lock": 3, "deps": {} }\n' > package-lock.json
mkdir src && echo 'module.exports = 1;' > src/app.js && git add . && git commit -q -m "Initial commit"
printf '{ "lock": 3, "requires": true, "deps": {} }\n' > package-lock.json
git status --porcelain --untracked-files=all | cut -c4- > "$ROOT/e1.old"
start_snapshot
SPEC='package.json src/rate.js src/app.js'
expect "pre-flight overlap with the spec" "" "$(preflight "$SPEC" | flat)"
printf '{ "deps": { "limiter": "2" } }\n' > package.json; printf '{ "lock": 3, "requires": true, "deps": { "limiter": "2" } }\n' > package-lock.json
echo 'module.exports = require("limiter");' > src/rate.js; echo 'module.exports = require("./rate");' > src/app.js
expect "old recipe's commit set (lockfile silently left out)" "package.json src/app.js src/rate.js" "$(old_set "$ROOT/e1.old" | sort | flat)"
new_snap; write_list; expect "new recipe asks about" "package-lock.json" "$(ask_list | flat)"
expect "new recipe's commit list" "package.json src/app.js src/rate.js" "$(sort "$(listfile)" | flat)"
echo package-lock.json >> "$(listfile)"   # The user says yes.
commit_list "Add rate limiting"
expect "HEAD lockfile has the dependency HEAD:package.json declares" 1 "$(git show HEAD:package-lock.json | grep -c limiter)"

say "E2. Edits the user makes between the verdict and 'continue'"
mkrepo "$ROOT/e2"; echo a > app.py && echo cfg > settings.toml && git add . && git commit -q -m "Initial commit"
echo "user wip" > notes-at-start.txt
git status --porcelain --untracked-files=all | cut -c4- > "$ROOT/e2.old"
start_snapshot; S1="$SS"; C1="$SC"
echo "crew v1" > feature.py; new_snap; write_list; commit_list "Feature"
echo "debug = true" >> settings.toml; echo scratch > try.py      # The user, after the verdict.
expect "old recipe's cycle 2 set (Step 0 list reused)" "feature.py settings.toml try.py" \
  "$(echo "crew v2" > feature.py; old_set "$ROOT/e2.old" | sort | flat)"
git checkout -q -- feature.py 2>/dev/null; git show HEAD:feature.py > feature.py
start_snapshot                                                    # A continue retakes it.
echo "crew v2" > feature.py; new_snap; write_list; expect "new recipe asks about" "" "$(ask_list | flat)"
commit_list "Fix review findings"
expect "cycle 2 commit holds" "feature.py" "$(git show --name-only --format= HEAD | flat)"
expect "left for the user" "notes-at-start.txt settings.toml try.py" "$(git status --porcelain --untracked-files=all | cut -c4- | sort | flat)"
expect "re-review diff vs the review base" "feature.py" "$(git diff --name-only "$C1..HEAD" | flat)"
expect "the retaken snapshot differs from the Step 0 one" "yes" "$([ "$SS" != "$S1" ] && echo yes || echo no)"

say "E3. A new-project folder with an untracked node_modules"
rm -rf "$ROOT/e3" && mkdir -p "$ROOT/e3" && cd "$ROOT/e3" || exit 1
printf '{ "name": "cli" }\n' > package.json
for p in $(seq 1 40); do mkdir -p "node_modules/p$p"; for f in $(seq 1 50); do echo "$p $f" > "node_modules/p$p/f$f.js"; done; done
git init -q -b main . && pipeline_dir && git commit -q --allow-empty -m "Initial commit"
n_old="$(git status --porcelain --untracked-files=all | wc -l | tr -d ' ')"
[ "$n_old" -ge 2000 ] && ok "old record: $n_old lines of paths in run.md" || bad "old record: expected >= 2000 lines, got $n_old"
start_snapshot
expect "new record: uncommitted at start (a count)" 2001 "$(user_paths | sort -u | wc -l | tr -d ' ')"
printf '.pipeline/\n' > .gitignore                                  # Item 2.
printf '.pipeline/\nnode_modules/\n' > .gitignore; printf '{ "name": "cli", "main": "src/i.js" }\n' > package.json
mkdir src && echo i > src/i.js
new_snap; write_list; expect "new recipe asks about (node_modules now ignored, not 2,000 deletions)" "package.json" "$(ask_list | flat)"
expect "new recipe's commit list" ".gitignore src/i.js" "$(sort "$(listfile)" | flat)"
rm -f "$(listfile)"

say "E3b. An ask-list path the run's .gitignore now hides has nothing to commit"
mkrepo "$ROOT/e3b"; echo '{}' > package.json && git add . && git commit -q -m "Initial commit"
mkdir -p node_modules && echo '{ "v": 1 }' > node_modules/.package-lock.json
start_snapshot
echo '{ "v": 2 }' > node_modules/.package-lock.json; printf 'node_modules/\n' > .gitignore
new_snap; write_list; expect "asks about" "node_modules/.package-lock.json" "$(ask_list | flat)"
git check-ignore -q node_modules/.package-lock.json; expect "git check-ignore -q exit (ignored now: mention, don't ask)" 0 "$?"
git --literal-pathspecs add node_modules/.package-lock.json 2>/dev/null; expect "a yes would make git add fail, exit" 1 "$?"
rm -f "$(listfile)"

say "E4. Quoted names, a bracket name, a deletion"
mkrepo "$ROOT/e4"; mkdir pages && echo gone > gone.txt && git add . && git commit -q -m "Initial commit"
echo user > pages/i.tsx; echo notes > "my notes.txt"; echo cv > "résumé.md"
start_snapshot
echo crew > "pages/[id].tsx"; echo crew > "crew é.txt"; rm gone.txt
git add -- "$(git status --porcelain --untracked-files=all | grep 'crew' | cut -c4-)" 2>/dev/null
expect "old recipe: git add with a listed (quoted) path exit" 128 "$?"
git add 'pages/[id].tsx'; expect "plain pathspec [id].tsx also stages" "pages/[id].tsx pages/i.tsx" "$(git diff --cached --name-only | flat)"
git reset -q
new_snap; write_list; expect "new recipe asks about" "" "$(ask_list | flat)"
commit_list "Crew work"
expect "commit holds" "D:gone.txt A:pages/[id].tsx A:crew é.txt" \
  "$(git -c core.quotePath=false show --name-status --format= HEAD | awk -F'\t' '{print $1":"$2}' | sort -r | flat)"
expect "left for the user" "my notes.txt pages/i.tsx résumé.md" \
  "$(git status --porcelain -z --untracked-files=all | tr '\0' '\n' | cut -c4- | sort | flat)"

say "E5. An empty commit list with work the user staged"
mkrepo "$ROOT/e5"; echo a > a.txt && git add . && git commit -q -m "Initial commit"
echo staged > s.txt && git add s.txt
printf '' | git --literal-pathspecs commit -q -m "unguarded" --pathspec-from-file=- 2>/dev/null
expect "unguarded empty list commits the user's staged file" "s.txt" "$(git show --name-only --format= HEAD | flat)"
git reset -q --soft HEAD~1
start_snapshot; new_snap; write_list; before="$(git rev-parse HEAD)"; commit_list "Crew work"
expect "guarded: HEAD unchanged" "$before" "$(git rev-parse HEAD)"
expect "guarded: still staged for the user" "s.txt" "$(git diff --cached --name-only | flat)"

say "E6. New-project mode: the Coders committed their own paths"
mkrepo "$ROOT/e6"; git commit -q --allow-empty -m "Initial commit"
echo staged > s.txt && git add s.txt
start_snapshot
echo u1 > u1.txt && git add u1.txt && git commit -q -m "unit 1" -- u1.txt
new_snap; write_list; expect "commit list" "" "$(flat < "$(listfile)")"
before="$(git rev-parse HEAD)"; commit_list "Integration"
expect "HEAD is still the unit commit" "$before" "$(git rev-parse HEAD)"
expect "still staged for the user" "s.txt" "$(git diff --cached --name-only | flat)"

say "E6b. A continue cycle in which a Coder commits a deletion and a Tester adds a test"
echo old > old.js && git add old.js && git commit -q -m "unit 2" -- old.js
start_snapshot                                                    # The continue retakes it.
git rm -q old.js && git commit -q -m "unit 2: drop old.js" -- old.js
echo test > test_u1.js
new_snap; write_list; eval "$(fill "$LIST_NOFILTER")"
expect "unfiltered list" "old.js test_u1.js" "$(sort "$(listfile)" | flat)"
git --literal-pathspecs add --pathspec-from-file="$(listfile)" 2>/dev/null
expect "unfiltered list: git add exit (the committed deletion)" 128 "$?"; rm -f "$(listfile)"
write_list; expect "new recipe's list (still uncommitted only)" "test_u1.js" "$(flat < "$(listfile)")"
commit_list "Add tests"
expect "commit holds" "test_u1.js" "$(git show --name-only --format= HEAD | flat)"
expect "still staged for the user" "s.txt" "$(git diff --cached --name-only | flat)"

say "E6c. A file the user put in scope that the run did not change"
mkrepo "$ROOT/e6c"; echo a > app.py && git add . && git commit -q -m "Initial commit"
echo "half-written" > wip.py
start_snapshot
echo crew > other.py
new_snap; write_list; echo wip.py >> "$(listfile)"                # The record's in-scope line.
commit_list "Crew work"
expect "commit holds the in-scope file too" "other.py wip.py" "$(git show --name-only --format= HEAD | sort | flat)"

say "E7. The run's .gitignore line"
mkrepo "$ROOT/e7"; echo 'dist/' > .gitignore && git add . && git commit -q -m "Initial commit"
start_snapshot; printf 'dist/\n.pipeline/\n' > .gitignore
new_snap; write_list; expect "clean .gitignore: asks about" "" "$(ask_list | flat)"
expect "clean .gitignore: committed with the run" ".gitignore" "$(flat < "$(listfile)")"; rm -f "$(listfile)"
git checkout -q -- .gitignore; printf 'dist/\nbuild/\n' > .gitignore   # The user's own edit.
start_snapshot; printf 'dist/\nbuild/\n.pipeline/\n' > .gitignore
new_snap; write_list; expect "user-edited .gitignore: asks about" ".gitignore" "$(ask_list | flat)"

say "E8. The snapshots leave the index and the files alone, and work from a subdirectory"
mkrepo "$ROOT/e8"; mkdir sub && echo a > sub/a.txt && echo t > t.txt && git add . && git commit -q -m "Initial commit"
echo b >> sub/a.txt; echo n > new.txt; echo s > s.txt && git add s.txt; echo x >> t.txt && git add t.txt
st0="$(git status --porcelain --untracked-files=all)"; ix0="$(cksum < .git/index)"
root_tree="$(snap HEAD)"; root_staged="$(staged_snap)"
expect "real index checksum after both snapshots" "$ix0" "$(cksum < .git/index)"
expect "status after the snapshots" "$st0" "$(git status --porcelain --untracked-files=all)"
cp .git/index "$ROOT/e8.index"
expect "staged snapshot is the index's own tree" "$(GIT_INDEX_FILE="$ROOT/e8.index" git write-tree)" "$root_staged"
cd sub || exit 1
(export GIT_INDEX_FILE="$(git rev-parse --git-path 4man.index)"; git read-tree HEAD 2>/dev/null)
expect "relative --git-path from a subdirectory exit" 128 "$?"
expect "absolute index path from a subdirectory: same tree" "$root_tree" "$(snap HEAD)"
expect "staged snapshot from a subdirectory: same tree" "$root_staged" "$(staged_snap)"
plain="$(git ls-files -s -z | (export GIT_INDEX_FILE="$(git rev-parse --path-format=absolute --git-path 4man.index)"; git read-tree --empty && git update-index -z --index-info && git write-tree))"
expect "without --full-name :/, ls-files from a subdirectory gives another tree" "differs" "$([ "$plain" != "$root_staged" ] && echo differs || echo same)"
cd .. || exit 1
expect "scratch index stays in the git dir" "present" "$(test -e .git/4man.index && echo present || echo absent)"

# Work only the index holds: the snapshot of the files cannot see it.
# e9 <case> <path> <the user's setup> <the crew's edit>
e9() {
  mkrepo "$ROOT/e9-$1"; echo app > app.py; eval "$3"
  local cached; cached="$(git diff --cached --name-status | flat)"
  start_snapshot
  expect "$1: old recipe's user paths" "" "$(eval "$(fill "$OLD_USER_CMD")" | flat)"
  expect "$1: old pre-flight overlap" "" "$(c="${OLD_PREFLIGHT//"<the spec's paths>"/app.py $2}"; eval "$(fill "$c")" | flat)"
  expect "$1: user paths" "$2" "$(user_paths | sort -u | flat)"
  expect "$1: pre-flight overlap" "$2" "$(preflight "app.py $2" | flat)"
  eval "$4"; echo crew >> app.py
  new_snap
  expect "$1: old recipe's commit list (the user's path as crew work)" "$(printf '%s\n' "$2" app.py | sort | flat)" "$(eval "$(fill "$OLD_LIST")" | sort | flat)"
  write_list; expect "$1: commit list" "app.py" "$(flat < .pipeline/commit-paths)"
  expect "$1: asks about" "$2" "$(ask_list | flat)"
  git --literal-pathspecs diff --cached --quiet -- "$2"; expect "$1: diff --cached --quiet exit (a yes replaces the staged version)" 1 "$?"
  commit_list "Crew work"                                           # The user says no.
  expect "$1: commit holds" "app.py" "$(git show --name-only --format= HEAD | flat)"
  expect "$1: still staged for the user" "$cached" "$(git diff --cached --name-status | flat)"
}
say "E9. Work only the index holds, and a crew edit to the same file"
e9 untracked .env "printf 'API_KEY=old\n' > .env && git add . && git commit -q -m 'Initial commit' && git rm -q --cached .env" \
  "printf 'API_KEY=real-secret-123\n' > .env"
expect "untracked: HEAD:.env is the committed one, not the crew's" "API_KEY=old" "$(git show HEAD:.env)"
e9 undone settings.py "printf 'timeout = 10\n' > settings.py && git add . && git commit -q -m 'Initial commit' && printf 'timeout = 30  # user fix\n' > settings.py && git add settings.py && printf 'timeout = 10\n' > settings.py" \
  "printf 'timeout = 10\nretries = 3\n' > settings.py"
expect "undone: the staged fix is still in the index" "timeout = 30  # user fix" "$(git show :settings.py)"
e9 deleted plan.md "git add . && git commit -q -m 'Initial commit' && echo draft > plan.md && git add plan.md && rm plan.md" \
  "echo crew > plan.md"
expect "deleted: the staged draft is still in the index" "draft" "$(git show :plan.md)"
expect "deleted: plan.md is not in HEAD" "absent" "$(git cat-file -e HEAD:plan.md 2>/dev/null && echo present || echo absent)"

say "E9b. A command in the Step 5 list command fails"
mkrepo "$ROOT/e9b"; echo a > a.txt && git add . && git commit -q -m "Initial commit"
echo wip >> a.txt                                                   # The user's.
start_snapshot; echo crew > c.txt; echo crew >> a.txt; new_snap        # The crew changes the user's a.txt too.
good="$SC"; SC=0000000000000000000000000000000000000000            # A snapshot commit misread from the record.
expect "old recipe's commit list (the user's a.txt in it)" "a.txt c.txt" "$(eval "$(fill "$OLD_LIST")" 2>/dev/null | sort | flat)"
SC="$good"; printf 'a.txt\n' > .pipeline/commit-paths              # A list left from the last cycle.
good="$SG"; SG=0000000000000000000000000000000000000000            # A staged snapshot misread from the record.
err="$(write_list 2>&1 >/dev/null)"; st=$?
[ "$st" -gt 1 ] && ok "list command exit: $st" || bad "list command exit: expected > 1, got $st"
[ -n "$err" ] && ok "list command prints an error: $err" || bad "list command printed no error"
expect "commit list after the failure" "" "$(flat < .pipeline/commit-paths)"
before="$(git rev-parse HEAD)"; commit_list "Crew work"
expect "HEAD unchanged" "$before" "$(git rev-parse HEAD)"
SG="$good"; write_list; expect "with the right ids: commit list" "c.txt" "$(flat < .pipeline/commit-paths)"
expect "with the right ids: asks about" "a.txt" "$(ask_list | flat)"
printf 'a.txt\n' > .pipeline/commit-paths                         # A shell with noclobber set.
err="$(set -C; write_list 2>&1 >/dev/null)"; st=$?
expect "noclobber: list command exit (as for an empty list)" 1 "$st"
[ -n "$err" ] && ok "noclobber: but it prints an error: $err" || bad "noclobber: no error printed"
expect "noclobber: the last cycle's list is left" "a.txt" "$(flat < .pipeline/commit-paths)"
git add c.txt && git commit -q -m "Crew work" -- c.txt; err="$(write_list 2>&1 >/dev/null)"; st=$?
expect "an empty list: exit" 1 "$st"; expect "an empty list: error output" "" "$err"

say "E10. Unmerged paths: no staged snapshot, and no partial commit either"
mkrepo "$ROOT/e10"; echo a > f && git add . && git commit -q -m "Initial commit"
git checkout -q -b other && echo b > f && git commit -q -am other && git checkout -q main && echo c > f && git commit -q -am main
git merge -q other >/dev/null 2>&1
staged_snap >/dev/null 2>&1; expect "staged snapshot exit during a conflicted merge" 128 "$?"
echo crew > g && git add g && git commit -q -m crew -- g 2>/dev/null; expect "partial commit exit during the merge" 128 "$?"

# F. A hosted remote with no branches: nothing to raise a PR against.
say "F. Empty remote"
git init -q --bare -b main "$ROOT/f-origin.git"
git clone -q "$ROOT/f-origin.git" "$ROOT/f" 2>/dev/null; cd "$ROOT/f" || exit 1
git commit -q --allow-empty -m "Initial commit"
expect "git ls-remote --heads origin lines" 0 "$(git ls-remote --heads origin | wc -l | tr -d ' ')"

# G. Work the user had already staged, and the lead's commit at Step 5.
say "G. Staged user work: bare commit takes it, path-limited commit leaves it"
for mode in bare pathspec; do
  mkrepo "$ROOT/g"; echo base > app.txt && git add . && git commit -q -m "Initial commit"
  echo "user wip" > user-staged.txt && git add user-staged.txt; echo crew > crew.txt; git add crew.txt
  if [ "$mode" = bare ]; then git commit -q -m "Crew work"; else git commit -q -m "Crew work" -- crew.txt; fi
  want="crew.txt"; [ "$mode" = bare ] && want="crew.txt user-staged.txt"
  expect "$mode commit holds" "$want" "$(git show --name-only --format= HEAD | flat)"
done

# H. The PR-mode review base against a stale or missing local default branch.
say "H. PR-mode review base from the remote's default branch"
git init -q --bare -b main "$ROOT/h-origin.git"
git clone -q "$ROOT/h-origin.git" "$ROOT/h-up" 2>/dev/null; cd "$ROOT/h-up" || exit 1
echo base > base.txt && git add . && git commit -q -m base && git push -q origin main
git clone -q "$ROOT/h-origin.git" "$ROOT/h" 2>/dev/null
cd "$ROOT/h-up" || exit 1; for u in up1 up2; do echo "$u" > "$u.txt" && git add . && git commit -q -m "$u"; done; git push -q origin main
cd "$ROOT/h" || exit 1; git fetch -q origin && git checkout -q -b feature origin/main && echo mine > mine.txt && git add . && git commit -q -m mine
expect "old base (local main is stale): files reviewed" "mine.txt up1.txt up2.txt" "$(git diff --name-only "$(git merge-base HEAD main)..HEAD" | flat)"
git fetch -q origin main && base="$(git merge-base HEAD FETCH_HEAD)"
expect "new base: files reviewed (what the PR shows)" "mine.txt" "$(git diff --name-only "$base..HEAD" | flat)"
expect "deep scan's merge-base <review base> HEAD is the review base" "$base" "$(git merge-base "$base" HEAD)"
git clone -q --single-branch --branch main "$ROOT/h-origin.git" "$ROOT/h2" 2>/dev/null; cd "$ROOT/h2" || exit 1
git checkout -q -b feature && echo mine > mine.txt && git add . && git commit -q -m mine && git branch -q -D main
git merge-base HEAD main >/dev/null 2>&1; expect "old base with no local main exit" 128 "$?"
git fetch -q origin main && expect "new base with no local main: files reviewed" "mine.txt" "$(git diff --name-only "$(git merge-base HEAD FETCH_HEAD)..HEAD" | flat)"

# I. A branch or range target that is not checked out.
say "I. Range target 'main...topic' with main checked out and a local edit"
mkrepo "$ROOT/i"; printf 'def load(p):\n    return open(p).read()\n' > io.py && git add . && git commit -q -m "Initial commit"
git checkout -q -b topic && printf 'def load(p):\n    if ".." in p:\n        raise ValueError(p)\n    return open(p).read()\n' > io.py && git add . && git commit -q -m "Guard paths"
git checkout -q main && printf 'def load(p):\n    return open(p, "rb").read()  # local\n' > io.py
expect "working tree io.py has the guard (what Read returns)" 0 "$(grep -c 'ValueError' io.py)"
expect "git show \$(git rev-parse topic):io.py has the guard" 1 "$(git show "$(git rev-parse topic)":io.py | grep -c 'ValueError')"

# J. The policy file and the checkout in /4man:code-review.
say "J. Policy file versus the checkout, and the clean-tree listing"
mkrepo "$ROOT/j"; echo x > a.txt && git add . && git commit -q -m "Initial commit"
git checkout -q -b feature && mkdir .claude && echo "rule: no eval" > .claude/claude-security-guidance.md && git add . && git commit -q -m "Policy"
git checkout -q main
mkdir -p .claude && echo "written by step 1" > .claude/claude-security-guidance.md
git checkout -q feature 2>/dev/null; expect "old: write the policy, then check out a target that tracks it, exit" 1 "$?"
rm -rf .claude
git cat-file -e "$(git rev-parse feature)":.claude/claude-security-guidance.md; expect "new: git cat-file -e <head>:policy exit (target tracks it, write nothing)" 0 "$?"
git checkout -q feature; expect "new: checkout exit" 0 "$?"
git checkout -q main
mkdir .claude && echo notes > .claude/review-notes.md && echo policy > .claude/claude-security-guidance.md
expect "git status --porcelain" "?? .claude/" "$(git status --porcelain | flat)"
expect "git status --porcelain --untracked-files=all" "?? .claude/claude-security-guidance.md ?? .claude/review-notes.md" \
  "$(git status --porcelain --untracked-files=all | flat)"

# K. Claude Code's Bash tool runs the user's shell, zsh or bash.
say "K. The Step 5 commands under zsh"
if command -v zsh >/dev/null 2>&1; then
  mkrepo "$ROOT/k"; echo a > a.txt && printf 'K=1\n' > .env && git add . && git commit -q -m "Initial commit"
  git rm -q --cached .env; echo wip >> a.txt
  zsh -f -c "$(fill "$SNAP_CMD" | sed 's/<base>/HEAD/')" > "$ROOT/k.ss" && zsh -f -c "$STAGED_CMD" > "$ROOT/k.sg"
  SC="$(git rev-parse HEAD)"; SS="$(cat "$ROOT/k.ss")"; SG="$(cat "$ROOT/k.sg")"
  expect "zsh: snapshots match bash's" "$(snap HEAD) $(staged_snap)" "$SS $SG"
  echo crew >> a.txt; echo crew > .env; echo crew > c.txt; new_snap
  zsh -f -c "$(fill "$LISTS_CMD")"
  expect "zsh: commit list" "c.txt" "$(flat < .pipeline/commit-paths)"
  expect "zsh: asks about" ".env a.txt" "$(zsh -f -c "$(fill "$ASK_CMD")" | flat)"
else
  ok "zsh not installed: skipped"
fi

if [ "$fail" -eq 0 ]; then printf '\nall tests passed\n'; else printf '\nTESTS FAILED\n'; fi
exit "$fail"
