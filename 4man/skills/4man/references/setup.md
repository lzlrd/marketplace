# Step 0 — Repo Hygiene and Working Mode

**Look first for a run already in flight.** If `.pipeline/run.md` exists and its `status` is
not `finished`, do not work through the items below: item 1 would move the start commit and
item 5 would delete the spec. If this conversation started that run (you are back here after
a compaction or a `/resume`), go to "Picking a Run Back Up" at the end of this file.
Otherwise tell the user what the record says and ask whether to pick that run up or discard
it.

With no run in flight, work through the five items in order, before anything else in the
run. Step 0.5 follows.

1. **Ensure a git repo with at least one commit.** If this isn't a git repo (`git rev-parse
   --git-dir` fails), run `git init` — this is the new-codebase/bootstrap case. If the repo has
   **no commits yet** (`git rev-parse HEAD` fails), create an initial commit now (an empty
   `git commit --allow-empty -m "Initial commit"` is fine) so the review has a base. **Record
   the start commit** (`git rev-parse HEAD`). Then, before item 2 touches `.gitignore`, take
   the **start and staged snapshots** of the user's uncommitted work ("The User's Uncommitted
   Work" below) and warn (don't block) when they hold any paths: they are the user's work,
   not this run's. The **review base**, which the Reviewer diffs against and the deep
   scan takes as its base (`/security-review` takes none), depends on mode: **in-place mode**
   → the start commit (this run's work);
   **PR mode** → the merge-base of HEAD with the hosted remote's `<default-branch>`, so the
   verdict covers the whole PR, not just this run: `git fetch <remote> <default-branch>`, then
   `git merge-base HEAD FETCH_HEAD`, with `<remote>` the hosted remote item 3 finds. A local
   `<default-branch>` can be stale or missing; use `<remote>/<default-branch>` only if the
   fetch fails, and the local branch only if that ref is missing too. Record the sha. Note
   the **current branch** (`git rev-parse --abbrev-ref HEAD`) and
   the **default branch** (`git symbolic-ref --short refs/remotes/origin/HEAD`, strip `origin/`;
   else `main`, then `master`) — call it `<default-branch>`. **If HEAD is detached**, create and
   switch to `4man/<kebab-slug-of-request>` now, before the mode decision, so commits attach to
   a real ref.
2. **Gitignore.** Note whether `.pipeline/` already exists (Step 0.5 asks). If the repo
   has no `.gitignore`, create one containing `.pipeline/`. If it has one and `.pipeline/` (or
   `.pipeline`) is not in it, append `.pipeline/`. Do this before creating any pipeline files.
   Coming after the start snapshot, this edit counts as the run's work and is committed with
   it; if the user already had `.gitignore` uncommitted, Step 5 asks about it instead.
3. **Decide the working mode.** 4man does not branch for its own sake — it works where you
   already are, and only raises a PR when it's shipping a new feature to a repo that's already
   hosted:
   - **Hosted?** Yes if a remote points at a known host — `git remote get-url origin` (or any
     remote) matches github.com, gitlab.*, bitbucket.org, codeberg.org, git.sr.ht,
     dev.azure.com, etc.
   - **No hosted remote → in-place.** Work on the **current branch** and commit there. No PR.
   - **Hosted remote with no branches yet** (`git ls-remote --heads <remote>` succeeds and
     prints nothing) → in-place too: there is no branch to raise a PR against. Say so; the
     first push is the user's.
   - **Hosted remote → the run ends in a PR against `<default-branch>`:** if you're already on
     a non-`<default-branch>` branch, build on **that** branch; if you're on `<default-branch>`,
     create and switch to `4man/<kebab-slug-of-request>` (append `-2`, `-3`… if taken) so the
     feature never lands straight on the hosted mainline.
   - Tell the user the mode and the working branch.
4. **Decide the build mode** — it governs who commits:
   - **new-project** — you're scaffolding/initializing a brand-new codebase (you ran `git init`
     in item 1, or there were no prior commits). Coders **commit their own units** as they
     finish, so the new repo gets real, attributable history in the requestor's style.
   - **feature-dev** — you're changing an existing codebase. Coders do **not** commit; the lead
     makes the single integrated commit at Step 5.
5. Create `.pipeline/`. If the plugin's `templates/pipeline-readme.md` exists (the skill body
   gives its full path), copy it to `.pipeline/README.md`.
   Remove a stale `specs.md`, `verdict.md`, or `run.md` from a prior run, then write
   `.pipeline/run.md` as "The Run Record" below describes. Besides `README.md`, `.pipeline/`
   holds only the two durable documents, the run record, and the path lists Step 5 writes
   afresh each time it commits (`user-paths`, `uncommitted-paths`, `commit-paths`).

## Step 0.5 — New or First-Touch Project (Optional, If Available)

If this is a new codebase (you're scaffolding it) or 4man's first run in this repo — there was
no `.pipeline/` directory before item 5 created it, and no `4man/*` branch — and the
`claude-code-setup` plugin is installed, offer to run
**`/claude-code-setup:claude-automation-recommender`** once to recommend project automations
(hooks, settings, CLAUDE.md) worth adding. It's a recommendation pass, not a gate: surface its
suggestions and let the user choose. Skip silently if the plugin isn't installed or the repo
is already established.

## The Run Record (`.pipeline/run.md`)

Your context is not a safe place for what Step 0 settles. A long run compacts, a compaction
keeps a summary and not the values, and a wrong start commit or a forgotten path means a
review of the wrong diff or the user's own work in the commit. Write the record in item 5,
and read it back whenever you are about to use one of its values:

```
status: in progress
start commit: <sha>
review base: <sha: the start commit in in-place mode, the merge-base from item 1 in PR mode>
working mode: in-place | PR
working branch: <name>
default branch: <name>
build mode: new-project | feature-dev
start snapshot: <tree id>
staged snapshot: <tree id>
snapshot commit: <the commit HEAD named when the snapshots were taken>
uncommitted at start: <number of the user's paths, or "none">
in scope: <those paths the user put in scope at pre-flight, or "none">
security pass: not asked
units: <only without the Task tools: one line per unit with owner, state, retries>
```

Keep it current: the pre-flight answer goes on the `security pass` line, a path the user
puts in scope at pre-flight goes on the `in scope` line, and without the
Task tools the `units` lines change as units do. Never put the style profile or the
development preferences in it.

## The User's Uncommitted Work

The user may start a run with work in progress, staged or not, and may edit again between a
verdict and a `continue`. None of it goes into the run's commits unless the user puts it in
scope. Track it with snapshots: tree ids written through a scratch index in the git dir,
which leaves the real index and the files as they are. Run these from the repository root.

A snapshot of the files, over `<base>`:

```sh
(export GIT_INDEX_FILE="$(git rev-parse --path-format=absolute --git-path 4man.index)"; git read-tree <base> && git add -A && git write-tree)
```

The **staged snapshot**, a copy of the real index. It holds work the files do not show: a
file untracked with `git rm --cached`, a staged change since undone in the file, a staged
new file since deleted.

```sh
git ls-files -s -z --full-name :/ | (export GIT_INDEX_FILE="$(git rev-parse --path-format=absolute --git-path 4man.index)"; git read-tree --empty && git update-index -z --index-info && git write-tree)
```

It fails while a merge or rebase has unmerged paths: tell the user, and start once they have
finished or aborted it (Step 5 cannot make a partial commit during a merge either).

Each snapshot command must print one tree id. If either prints an error or no id (a file
`git add -A` cannot read stops it, for one), stop and tell the user what failed: never record
an empty id or run a later step with one, since an empty snapshot would count the user's work
as the run's.

The scratch index stays in the git dir, where `git status` does not show it, and the next
snapshot's `read-tree` replaces it. Do not delete it by a computed path: Claude Code's safety
check stops an `rm` whose target comes from `git rev-parse`. A snapshot of the files hashes
every file that is not ignored into the object store, so a large untracked folder costs time
and space in `.git` once (3,000 small files: about 2 seconds); `git gc` prunes those objects
later.

- **Take the start snapshot** with `HEAD` as `<base>`, then the staged snapshot: at item 1,
  and again when a `continue` reply arrives, before the Coders get the verdict (the last
  cycle's work is committed by then, so whatever is uncommitted is the user's; set `in scope`
  back to `none`). Record both tree ids, the commit HEAD names, and the count below. Never
  retake them after a compaction or a `/resume`: the crew's uncommitted work would then count
  as the user's.
- **The user's paths** are those where either snapshot differs from the snapshot commit:

  ```sh
  (git diff --name-only --no-renames <snapshot commit> <start snapshot> && git diff --name-only --no-renames <snapshot commit> <staged snapshot>)
  ```

  Never print that list into your context: an untracked dependency folder alone runs to
  thousands of lines. Count it (`| sort -u | wc -l`: a path can be in both). At pre-flight,
  see which of the spec's files are among them:

  ```sh
  (git --literal-pathspecs diff --name-only --no-renames <snapshot commit> <start snapshot> -- <the spec's paths> && git --literal-pathspecs diff --name-only --no-renames <snapshot commit> <staged snapshot> -- <the spec's paths>) | sort -u
  ```
- **At Step 5 item 3**, take a new snapshot of the files with the start snapshot as `<base>`,
  so that files the run's `.gitignore` now hides do not read as deleted. Then write the path
  lists to `.pipeline/`, where no snapshot sees them, with this one command:

  ```sh
  : > .pipeline/commit-paths && (git diff --name-only --no-renames <snapshot commit> <start snapshot> && git diff --name-only --no-renames <snapshot commit> <staged snapshot>) > .pipeline/user-paths && git diff --name-only --no-renames HEAD <new snapshot> > .pipeline/uncommitted-paths && git diff --name-only --no-renames <start snapshot> <new snapshot> | grep -vFxf .pipeline/user-paths | grep -Fxf .pipeline/uncommitted-paths > .pipeline/commit-paths
  ```

  It empties the commit list, writes the user's paths and the paths still uncommitted, then
  lists the paths the run changed that are not the user's and are still uncommitted: a
  deletion a Coder already committed would make `git add` fail. When that list is empty, the
  last `grep` exits 1 and prints nothing. An error message means a command failed (a shell
  with `noclobber` set refuses to overwrite the lists, for one), and a list it left stale or
  empty would read as none of the user's work: stop there, commit nothing, and tell the user.
  1. `git diff --name-only --no-renames <start snapshot> <new snapshot> | grep -Fxf .pipeline/user-paths`
     prints the user's files that the run changed as well, a lockfile rewritten by an
     install for one. Each one not in scope is a question for the user: does the run's change
     belong in the commit? Never leave one out silently. When the user also has a version of
     it staged (`git --literal-pathspecs diff --cached --quiet -- <path>` fails), say that a
     yes replaces it. A path that is ignored now (`git check-ignore -q <path>`), or gone and
     never committed, has nothing to commit: mention it instead of asking.
  2. Append to `.pipeline/commit-paths` every path on the record's `in scope` line, changed by
     the run or not, and each path from 1 the user says yes to.
  3. Only when that file is not empty (`test -s .pipeline/commit-paths`):
     `git --literal-pathspecs add --pathspec-from-file=.pipeline/commit-paths`, then
     `git --literal-pathspecs commit -m "<message>" --pathspec-from-file=.pipeline/commit-paths`.
     An empty path list would commit whatever the user had staged.
     `--literal-pathspecs` stops a name such as `[id].tsx` from matching the user's `i.tsx`,
     and the file form reads git's quoted names back. In new-project mode the Coders have
     committed their own paths, so an empty file, or `nothing to commit`, means it is all in.

A file the user edits while the crew is running is indistinguishable from the crew's work
unless it was among the user's paths at the start snapshot.

## Picking a Run Back Up

After a compaction or a `/resume`, or when a `continue` reply arrives, do not work from
memory.
1. Re-read the skill file (the skill body gives its path; a compaction can cut off its last
   steps), this file, and `.pipeline/run.md`. Read raw, the skill file shows
   `${CLAUDE_PLUGIN_ROOT}` unexpanded: it is the plugin directory that holds `skills/`.
2. Take the start commit, review base, modes, branch, start and staged snapshots, and snapshot
   commit from the record. Do not redo the five items above. Only a `continue` retakes the
   snapshots.
3. Rebuild the two context blocks (Step 1) if they are no longer in your context: they are
   never on disk.
4. After a `/resume` the teammates are gone: spawn a new one for each task not marked done.
   After a compaction, message a teammate by name before you consider re-spawning it.
