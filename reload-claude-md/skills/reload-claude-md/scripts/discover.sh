#! /usr/bin/env bash

# Reload-claude-md · discovery. Prints the CLAUDE.md memory files in effect for the current working
# directory, one absolute path per line, for the /reload-claude-md skill to read. It reads no memory
# file and writes nothing: it looks at file names, asks git where the repository's roots are, and
# prints paths.

# Listed: the user file (in CLAUDE_CONFIG_DIR, or ~/.claude), then CLAUDE.md, .claude/CLAUDE.md and
# CLAUDE.local.md in the working directory and in every directory above it, then CLAUDE.md and
# CLAUDE.local.md files up to five directories below the working directory. Like Claude Code, it
# starts from the working directory's real path, so when that directory is reached through a link,
# the paths listed are the ones the link resolves to. A path is listed when it is a file or a link
# to one, and a file reached by two paths is listed once, by a path that is not itself a link when
# there is one.

# Not listed: anything under .git, node_modules, .venv, venv or .claude/worktrees below the working
# directory. In a git worktree nested inside its main checkout, as `claude --worktree` makes under
# .claude/worktrees, Claude Code skips CLAUDE.md and .claude/CLAUDE.md in the main checkout's root
# and in the directories between it and the worktree, so only CLAUDE.local.md is listed there. When
# git is missing or cannot read the repository, the worktree is not detected and those files are
# listed. Nothing else is skipped, so a vendored or build-output copy is listed like any other
# nested file. The claudeMdExcludes setting is not read here: the skill applies it to this list.
# Managed memory, .claude/rules files and AGENTS.md are out of scope.

# Claude Code finds the repository from the working directory alone, so git must too, and a
# relative cd below must not search CDPATH.
unset GIT_DIR GIT_WORK_TREE GIT_COMMON_DIR CDPATH

here="$(pwd -P)" && [ -n "$here" ] || exit 1

# The worktree's root, and the root of the main checkout it sits in, when it is nested inside it:
# the common git directory is then the main checkout's .git directory.
top="" main=""
if { IFS= read -r top && IFS= read -r common; } < <(
  git -C "$here" rev-parse --show-toplevel --git-common-dir 2>/dev/null
) && common="$(cd "$here" && cd "$common" && pwd -P)" && top="$(cd "$top" && pwd -P)"; then
  case "$common" in */.git) main="${common%/.git}" ;; esac
  case "$top" in "$main"/*) ;; *) main="" ;; esac
fi

{
  printf '%s\n' "${CLAUDE_CONFIG_DIR:-${HOME:-}/.claude}/CLAUDE.md"
  d="$here"
  between=0
  while :; do
    if [ "$between" = 1 ]; then
      printf '%s\n' "$d/CLAUDE.local.md"
    else
      printf '%s\n' "$d/CLAUDE.md" "$d/.claude/CLAUDE.md" "$d/CLAUDE.local.md"
    fi
    # The directories above the worktree's root, up to and including the main checkout's root, get
    # only the local file.
    [ -n "$main" ] && [ "$d" = "$top" ] && between=1
    [ "$d" = "$main" ] && between=0
    [ "$d" = "/" ] && break
    d="$(dirname "$d")"
  done
  # Nested files, as absolute paths so they de-duplicate against the walk above. The depth bound and
  # the pruning keep this fast from a high directory such as $HOME. With -mindepth 1 the working
  # directory itself is never pruned, whatever it is named.
  find "$here" -mindepth 1 -maxdepth 6 \
    \( -name .git -o -name node_modules -o -name .venv -o -name venv \
    -o -path '*/.claude/worktrees' \) -prune \
    -o \( -name CLAUDE.md -o -name CLAUDE.local.md \) -print 2>/dev/null
} | while IFS= read -r f; do
  # Keep files and links to files, which drops a directory named CLAUDE.md and a link to nothing.
  [ -f "$f" ] || continue
  # Key each path by the file it resolves to, and mark a path that is not itself a link with 0, so
  # it sorts ahead of a link to the same file, even when a directory above both is a link. Without
  # realpath, each path is its own key.
  r="$(realpath "$f" 2>/dev/null)" || r="$f"
  [ -L "$f" ] && own=1 || own=0
  printf '%s\t%s\t%s\n' "$r" "$own" "$f"
done | LC_ALL=C sort | awk -F '\t' '!seen[$1]++' | cut -f 3-
