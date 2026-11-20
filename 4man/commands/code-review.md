---
description: Review a diff, branch, or PR with the 4man Reviewer — runs one security pass (the claude-security deep scan when the diff is large enough to earn it and the plugin is installed, approved, and the target is committed; else /security-review where its scope matches the target, else the Reviewer's own manual pass; bootstrapping claude-security-guidance.md first) and spawns CLAUDE.md-compliance and correctness reviewers as teammates in parallel, returning a confidence-scored verdict. Never modifies source code; it may write the security-guidance policy file, fetch a PR's head, and check out the target branch. Requires agent teams.
argument-hint: "[empty = pending changes on current branch | PR number | branch | 'staged' | 'working' | 'HEAD~N' | range]"
---

Review the target derived from: $ARGUMENTS

## Prerequisite — agent teams must be enabled
The review runs as an agent team (reviewer + compliance + correctness teammates), so
`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` must be set (`printenv` shows it) and the session
must be interactive: a `-p` or Agent SDK session never forms a team. If either fails,
**stop**: tell the user to enable it in `~/.claude/settings.json` (or project settings) and
restart. There is no fallback.

## Resolve the review target
- **empty → the pending changes on the current branch** (`git diff HEAD`).
- a number → a PR: get its diff via the GitHub MCP (`mcp__github__pull_request_read`,
  `method: get_diff`; derive `owner`/`repo` from the remote) when the remote is GitHub;
  else `gh pr diff <n>` if `gh` is available and authenticated; else fetch/checkout the
  PR branch and diff vs base. Note the PR's base branch: it is not always the default one.
- a branch name → diff that branch vs the default base.
- `staged` → `git diff --cached`; `working`/`unstaged` → `git diff`.
- `HEAD~N`, a SHA, or `A..B` → that diff range.
If you cannot resolve a target, ask the user once.

The reviewers read the target with local git and have no MCP tools, so a PR that is not
checked out has to become a local range before the review. Fetch its base branch
(`git fetch origin <base>`) and record the base commit (`git rev-parse FETCH_HEAD`) at once,
then fetch its head (`git fetch origin pull/<n>/head` on GitHub, `merge-requests/<n>/head`
on GitLab) and record the head commit the same way, and use
`git diff <base commit>...<head commit>`: in a single-branch clone `origin/<base>` does not
exist. A fetch adds objects and switches nothing. If a fetch or the diff fails, say so; on
`no merge base` (a shallow clone) offer `git fetch --unshallow`, which only adds history, or
ask the user to check the PR out.

## Security pass (before the reviewer)
1. **Bootstrap guidance.** Using the `security-guidance` convention, if no
   `claude-security-guidance.md` exists in the workspace (check
   `<repo>/.claude/claude-security-guidance.md`, `…/claude-security-guidance.local.md`,
   `~/.claude/claude-security-guidance.md`, and for a target that is not checked out
   `git cat-file -e <head commit>:.claude/claude-security-guidance.md`, which succeeds when
   the target tracks one), create
   `<repo>/.claude/claude-security-guidance.md` with concrete rules for this repo's
   stack. It's a committed project policy — writing it is intended. If the repo
   `.gitignore`s `.claude/`, note it and place the file where it'll be tracked (or tell
   the user).
2. **Offer the claude-security deep scan only when the diff earns it.** The deep scan is slow and
   burns a significant number of tokens, so size the target first — `git diff --shortstat
   <base>...<target>`. A **small** diff goes straight to step 4 without asking: under roughly 200
   changed lines **and** touching none of authentication or authorization, secrets or crypto, a
   network or IPC boundary, deserialization of untrusted input, file-path or subprocess/shell
   handling, query construction, or a new dependency. Any one of those makes it a larger diff
   however few the lines. Otherwise, if the `claude-security:claude-security` skill is in
   your skill list, the Workflow tool is among your tools, **and** the resolved target is
   committed work its changes scan accepts — the checked-out branch's commits against a base
   (a branch target, a checked-out PR, `HEAD~N`), or the checked-out commit alone — ask once
   with AskUserQuestion (header "Security pass"): **"Deep scan: I understand it may take a
   long time and use a lot of tokens"** — panel-verified — vs **"Fast pass"**. The scan
   starts only on the user's own acknowledgment of its cost, which is why the option says
   so. An uncommitted target (empty/pending, `staged`, `working`), a target that is not
   checked out, an absent plugin or Workflow tool, or a "Fast pass" answer → step 4.
3. **Deep scan.** Invoke the **`claude-security:claude-security`** skill yourself, in this
   session, and ask it to scan this branch's changes against `--base <resolved base>` (or
   `--commit <sha>` for the checked-out commit), quoting the user's answer. Do not spawn the
   agent of the same name: it cannot scan when another session dispatches it. The skill
   gives you its own role while it runs; when it has delivered its report, come back to this
   review with the surviving findings (file:line, severity, what the panel concluded), the
   stamped verification status, and the report directory path. It leaves a self-gitignored
   `CLAUDE-SECURITY-<timestamp>/` report directory in the repo — an artifact, not a code
   change. Its findings are already adversarially verified: hand them to the Reviewer marked
   as such. If the skill stops without scanning or the scan fails, say so and fall back to
   step 4.
4. **Fast pass — `/security-review`, only where its scope is the target.** `/security-review`
   reviews the checked-out branch's commits against `origin/HEAD` (the default branch of
   `origin`). It does not see uncommitted changes, and it fails when `origin/HEAD` does not
   exist. Run it once and capture its findings when all of these hold:
   - `git rev-parse --verify --quiet origin/HEAD` succeeds;
   - the target is committed work on a branch whose base is that default branch (a branch
     target, or a PR against the default branch);
   - the working tree is clean: `git status --porcelain --untracked-files=all` lists nothing
     except the policy file you may have written in step 1. `/security-review` works in the
     checked-out tree, so uncommitted edits there would be read as part of the target;
   - that branch is checked out, or you check it out, restoring the original branch and
     HEAD when the review finishes.

   For every other target — the default pending changes, `staged`, `working`, a range or
   SHA, a PR against another base, uncommitted changes in the tree, a repo without
   `origin/HEAD`, a checkout that fails, or the command being unavailable — run no security
   command. Say so, and tell the Reviewer that no pass covered the diff, so it does its
   focused manual security pass over the resolved diff.

## Review — three teammates
Spawn `reviewer` (**4man:reviewer**) first, so that its name exists when the other two
start, then `compliance-reviewer` (**4man:compliance-reviewer**) and `correctness-reviewer`
(**4man:correctness-reviewer**); all three work in parallel on the resolved diff. Teammates
cannot spawn teammates, and a teammate's closing text reaches only you, so every hand-off is
a message:
- Give all three the command that prints the target (`git diff HEAD`, `git diff --cached`,
  `git diff`, or `git diff <base>...<head>`), not a description of it. For any target whose
  head is not the checked-out HEAD (a PR, a branch, or a range ending elsewhere), give them
  that head commit too (`git rev-parse <ref>`, or the fetched one for a PR) and tell them to
  read surrounding code, the security policy included, with `git show <commit>:<path>`: the
  working tree holds a different branch.
- Tell all three there is no spec for this review: a `.pipeline/specs.md` left by an
  earlier crew run describes different work. The Reviewer skips requirement traceability
  and reviews the diff on its own merits.
- Tell both sub-reviewers that the Reviewer is named `reviewer`: each **messages its report
  directly to it**.
- Hand the Reviewer the security findings — which engine ran, for the deep scan that they
  arrived panel-verified, or that no pass covered the diff. It folds in those findings and
  both reports, scores by severity and confidence, and sends you the verdict with
  SendMessage.
- Keep the hand-off moving. A sub-review that lands with you instead (a message, or closing
  text marked `UNDELIVERED`) → forward it to `reviewer`. A Reviewer that goes idle with no
  verdict is waiting on a report, and its closing line names which. That is normal while
  that sub-reviewer is still working: leave it alone. Step in once that sub-reviewer has
  itself gone idle or failed. If it delivered nothing: forward what it left with you,
  re-spawn it, or tell the Reviewer the report is not coming so it issues the verdict
  without it. If its closing line says the report was sent, the Reviewer's next turn should
  bring the verdict; if the Reviewer goes idle again without one, ask it which report it
  lacks or have the sub-reviewer send it again, and use the first set of moves only if that
  fails. A verdict that arrives as the Reviewer's closing text instead of a message is still
  the verdict.

## Report
Present the verdict: decision, then findings grouped by severity, each with confidence
and `file:line`. List low-confidence/possible-false-positives separately. This is a
read-only review — do not modify code.

If the target was a PR, OFFER to post the findings as PR review comments — via the
GitHub MCP (`mcp__github__pull_request_review_write` to open the review,
`mcp__github__add_comment_to_pending_review` per finding, then `submit_pending`) when
the remote is GitHub, else `gh` — but only post after the user explicitly confirms. A
compliance finding that quotes a rule from a user-level file (`~/.claude/CLAUDE.md`,
`CLAUDE.local.md`; the Reviewer marks these `[user-level rule]`) is private: paraphrase it
or hold it back, and tell the user which findings you held back.
