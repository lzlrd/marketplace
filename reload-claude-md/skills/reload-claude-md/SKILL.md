---
name: reload-claude-md
description: Re-read the in-effect CLAUDE.md memory files from disk and re-anchor the session to their current content, picking up edits made since the session started.
argument-hint: "[optional path to a specific CLAUDE.md]"
disable-model-invocation: true
allowed-tools:
  - 'Bash(bash "${CLAUDE_SKILL_DIR}/scripts/discover.sh")'
  - Bash(bash ${CLAUDE_SKILL_DIR}/scripts/discover.sh)
  - Read(//**/CLAUDE.md)
  - Read(//**/CLAUDE.local.md)
---

# /reload-claude-md — re-ingest CLAUDE.md into the running session

Claude Code loads `CLAUDE.md` memory files at session start and does not re-read them when they
change. There is no reload command: `/memory` only opens the files to edit, and compaction (manual
or automatic) re-injects the project-root file from disk, at the cost of summarizing the
conversation. So after you edit a `CLAUDE.md` mid-session, this agent is still following the
**stale** version. This command closes that gap: it re-reads the memory files that are in effect,
adopts their current on-disk content as authoritative, and reports what changed.

Optional argument — a specific file to reload: **$ARGUMENTS**
If it is empty, reload every in-effect `CLAUDE.md`. If it names a path, reload only that file (and its
imports).

## What to do when invoked

1. **Locate the in-effect memory files.** If a path was given, use just that path and skip
   discovery. Otherwise run the bundled discovery script with the Bash tool, typed exactly as
   written here, because this is the one command the skill pre-approves:

   ```bash
   bash "${CLAUDE_SKILL_DIR}/scripts/discover.sh"
   ```

   It prints one absolute path per line: the user file, the project chain from the current
   directory up to the filesystem root, local files, and nested files up to five directories
   below the working directory, each file once, by real paths when the working directory is
   reached through a symlink. It skips `.git`, `node_modules`, `.venv`, `venv`, and
   `.claude/worktrees`. In a git worktree inside its main checkout, it lists only
   `CLAUDE.local.md` from the main checkout's root and the directories between it and the
   worktree, because Claude Code does not load their other memory files there. Nothing else is
   skipped: a vendored or build-output copy is listed like any nested file.

   Then leave out the files the user excluded, as Claude Code does: it skips any memory file whose
   absolute path matches a glob pattern in the `claudeMdExcludes` setting, and the lists in all
   settings files apply together. A pattern that starts with `/` also matches when the part before
   its first glob character (`*`, `?`, `[` or `{`) is resolved through symlinks, so a pattern
   written through a link still matches the real path. Look for that key in `settings.json` in
   the user's config directory (`~/.claude`, unless `CLAUDE_CONFIG_DIR` names another), in
   `.claude/settings.json` in the working directory, and in `.claude/settings.local.json`, which
   sits at the root of the working directory's git repository (the main checkout's root, from a
   worktree) or, outside a repository, in the working directory. Get the patterns even when a
   path was given, because step 3 checks imports against them.

   Settings files can hold credentials, so never open one with Read. Fetch only the key: run the
   Grep tool on each file with `output_mode: "content"`, `multiline: true`, `"-o": true` and this
   pattern, which prints the key and its list and nothing else:

   ```text
   "claudeMdExcludes"\s*:\s*(\[(\s*"([^"\\]|\\.)*"\s*,?)*\s*\])?
   ```

   The strings in the list it prints are the patterns. Never quote or repeat any other part of a
   settings file. Without `"-o": true`, Grep prints each matching line whole, which on a settings
   file written as one line is the whole file, so if the Grep tool rejects that option, do not
   search without it: treat that file as one whose search failed. Drop each listed path that matches a pattern, and name it in the report as excluded, not
   reloaded. A path given as the argument is the user's own choice: keep it even when a pattern
   matches, and say so. A settings file that does not exist (Grep says the path does not exist),
   or in which Grep finds no match, adds no patterns. One whose search is refused or fails in any
   other way, or whose result shows the key without a complete list (for example, a line omitted
   as too long), leaves its exclusions unknown: say so. A file with no copy in your context,
   listed or imported, was then never checked against them, and the user may have excluded it:
   do not read or adopt it unless it is the path given as the argument. Name it in the report as
   not checked against exclusions, and say that running the command with its path loads it.
   Exclusions in managed settings are not checked.

   (If a file lives deeper than that, pass its path as the argument.)

   (Load order is not critical here — the goal is to find every file so the diff is complete.
   System/enterprise-managed memory is intentionally left alone.)

2. **Read each file's current content** with the Read tool — the point is the bytes on disk *now*,
   not what you remember from session start. The skill pre-approves reads of files named
   `CLAUDE.md` or `CLAUDE.local.md`, but not of one that links to a file with another name, such
   as `AGENTS.md`. Any other read follows the user's own permission rules: if one is refused,
   leave that file unread and name it in the report.

3. **Expand imports.** Claude Code inlines `@path` imports at launch, so a faithful reload follows
   them by the same rules. An import is an `@path` token outside code spans and fenced code blocks:
   a bare `@path/to/file` as well as `@./path` or `@~/path`. A space inside a path is written with
   a backslash before it, and a path in quotes is not an import. A relative path resolves against
   the file that contains the import, not the working directory. Imported files can import others,
   up to four hops deep. Claude Code checks every import against `claudeMdExcludes` too, so before
   you read one, compare its absolute path with the patterns from step 1: when one matches, do not
   read it, and name it in the report as excluded, not reloaded. Never follow an import out of a
   file that was left out, here or in step 1. Claude Code asks the user before it loads an import
   from a project file that resolves outside the working directory, so follow one of those only
   when its content is already in your context; otherwise ask the user before reading it. If you
   cannot ask, leave it unread, name it in the report, and say it can be loaded by running the
   command with that path.

4. **Diff against the copy in your context.** Compare what you just read to the most recent copy of
   each file in your context: the one loaded at session start (the user-instructions /
   codebase-memory block), or a newer one from a compaction or an earlier run of this command.
   Claude Code strips block-level HTML comments (`<!-- ... -->`) before it loads a file, so a
   comment that is on disk but missing from your copy is not a change. Identify, per file: rules
   **added**, **removed**, and **changed**. A file with no copy in your context (e.g., a nested
   CLAUDE.md that was never loaded, or a file created mid-session) has no baseline: skip the diff,
   report it as newly in effect, and adopt it whole, unless step 1 held it back as not checked
   against exclusions.

5. **Re-anchor.** Treat the freshly-read content as the authoritative instructions from here on,
   overriding the stale copy wherever they differ. Changed rules take their new form and added
   rules are now in effect for the rest of the session. **Removed** rules are the one soft spot:
   an in-session command can suppress them going forward but can't scrub them from the context
   already loaded, so re-state each removed rule explicitly as **RETRACTED — do not follow** in
   your report, and note that only a session restart guarantees they're fully gone.

6. **Report concisely.** For each file that changed, give a short bullet list of the delta (added /
   removed / modified). Do not paste whole files back — just the changes, then one line confirming
   you are now following the current version. (Step 5's RETRACTED restatements are the exception:
   quote a short removed rule verbatim; for a large removed block, name the block and restate its
   operative directives rather than the whole text.)

## Edge cases

- **Nothing found** (no memory files in effect, or the given path does not exist): say so in one
  line — there is nothing to reload.
- **Unchanged**: report "no changes — already current," list the files you checked so a file
  outside that list is not taken as current, and stop.
- **Nested CLAUDE.md**: subdirectory files officially reload only when Claude next reads a file in
  that directory; this command reloads them now, on demand.
- **Other instruction files**: `.claude/rules/` files, and an `AGENTS.md` that no `CLAUDE.md`
  imports or links to, are not found by this command. If the user's edit was to one of those and it
  was not passed as the path, say it was not reloaded rather than reporting "already current."
- **Read-only**: this command never edits memory files. Writing session learnings *into* `CLAUDE.md`
  is the opposite job — use the `claude-md-management` plugin's `/revise-claude-md` for that.
