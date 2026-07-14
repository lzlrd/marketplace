---
description: Re-read the in-effect CLAUDE.md memory files from disk and re-anchor the session to their current content, picking up edits made since the session started.
argument-hint: "[optional path to a specific CLAUDE.md]"
allowed-tools: Bash, Read
---

# /reload-claude-md — re-ingest CLAUDE.md into the running session

Claude Code loads `CLAUDE.md` memory files **once, at session start**, and does not re-read them when
they change. There is no native reload — `/memory` only opens the files to edit, and only `/compact`
re-injects the project-root file (with other side effects). So after you edit a `CLAUDE.md`
mid-session, this agent is still following the **stale** version. This command closes that gap: it
re-reads the memory files that are in effect, adopts their current on-disk content as authoritative,
and reports what changed.

Optional argument — a specific file to reload: **$ARGUMENTS**
If it is empty, reload every in-effect `CLAUDE.md`. If it names a path, reload only that file (and its
imports).

## What to do when invoked

1. **Locate the in-effect memory files.** If `$ARGUMENTS` names a path, use just that path and skip
   discovery. Otherwise list them with the Bash tool (this walks the user file, the project chain
   from the current directory up to the filesystem root, local files, and nested files under the
   working directory, then de-duplicates):

   ```bash
   {
     [ -f "$HOME/.claude/CLAUDE.md" ] && echo "$HOME/.claude/CLAUDE.md"
     d="$PWD"
     while :; do
       for f in "$d/CLAUDE.md" "$d/.claude/CLAUDE.md" "$d/CLAUDE.local.md"; do
         [ -f "$f" ] && echo "$f"
       done
       [ "$d" = "/" ] && break
       d="$(dirname "$d")"
     done
     # Nested files under the working dir, as ABSOLUTE paths so they de-duplicate against
     # the up-walk above (which emits absolute paths). Depth-bounded and vendor-pruned so
     # this stays fast even when run from a deep or high directory such as $HOME.
     find "$PWD" -maxdepth 6 \( -name .git -o -name node_modules \) -prune -o -name CLAUDE.md -print 2>/dev/null
   } | awk 'NF && !seen[$0]++'
   ```

   (The `find` is bounded at 6 levels — deep enough for real project trees, cheap enough to
   run anywhere; pass an explicit path as the argument if a file lives deeper.)

   (Load order is not critical here — the goal is to find every file so the diff is complete.
   System/enterprise-managed memory is intentionally left alone.)

2. **Read each file's current content** with the Read tool — the point is the bytes on disk *now*,
   not what you remember from session start.

3. **Expand `@imports`.** If a file contains lines like `@./path` or `@~/path`, read those too:
   Claude Code inlines imports at launch, so a faithful reload must follow them.

4. **Diff against the session-start version.** Compare what you just read to the `CLAUDE.md` content
   loaded into your context at the start of this session (the user-instructions / codebase-memory
   block). Identify, per file: rules **added**, **removed**, and **changed**.

5. **Re-anchor.** Treat the freshly-read content as the authoritative instructions from here on,
   overriding the stale session-start copy wherever they differ. Changed rules take their new form
   and added rules are now in effect for the rest of the session. **Removed** rules are the one
   soft spot: an in-session command can suppress them going forward but can't scrub them from the
   context already loaded, so re-state each removed rule explicitly as **RETRACTED — do not
   follow** in your report, and note that only a session restart guarantees they're fully gone.

6. **Report concisely.** For each file that changed, give a short bullet list of the delta (added /
   removed / modified). Do not paste whole files back — just the changes, then one line confirming
   you are now following the current version.

## Edge cases

- **Nothing found** (no memory files in effect, or the given path does not exist): say so in one
  line — there is nothing to reload.
- **Unchanged**: report "no changes since session start — already current," and stop.
- **Nested CLAUDE.md**: subdirectory files officially reload only when Claude next reads a file in
  that directory; this command reloads them now, on demand.
- **Read-only**: this command never edits memory files. Writing session learnings *into* `CLAUDE.md`
  is the opposite job — use the `claude-md-management` plugin's `/revise-claude-md` for that.
