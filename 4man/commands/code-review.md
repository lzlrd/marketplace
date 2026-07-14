---
description: Review a diff, branch, or PR with the 4man Reviewer — runs one /security-review (bootstrapping claude-security-guidance.md first) and spawns CLAUDE.md-compliance and correctness reviewers as teammates in parallel, returning a confidence-scored verdict. Read-only; never modifies code. Requires agent teams.
argument-hint: "[empty = pending changes on current branch | PR number | branch | 'staged' | 'working' | 'HEAD~N' | range]"
---

Review the target derived from: $ARGUMENTS

## Prerequisite — agent teams must be enabled
The review runs as an agent team (reviewer + compliance + correctness teammates), so
`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` must be set. If it isn't, **stop**: tell the user to
enable it in `~/.claude/settings.json` (or project settings) and restart. There is no fallback.

## Resolve the review target
- **empty → the pending changes on the current branch** (`git diff HEAD`) — the same scope
  `/security-review` reviews natively, so the two passes cover the same code.
- a number → a PR: get its diff via the GitHub MCP (`mcp__github__pull_request_read`,
  `method: get_diff`; derive `owner`/`repo` from the remote) when the remote is GitHub;
  else `gh pr diff <n>` if `gh` is available and authenticated; else fetch/checkout the
  PR branch and diff vs base.
- a branch name → diff that branch vs the default base.
- `staged` → `git diff --cached`; `working`/`unstaged` → `git diff`.
- `HEAD~N`, a SHA, or `A..B` → that diff range.
If you cannot resolve a target, ask the user once.

## Security pass (before the reviewer)
1. **Bootstrap guidance.** Using the `security-guidance` convention, if no
   `claude-security-guidance.md` exists in the workspace (check
   `<repo>/.claude/claude-security-guidance.md`, `…/claude-security-guidance.local.md`,
   `~/.claude/claude-security-guidance.md`), create
   `<repo>/.claude/claude-security-guidance.md` with concrete rules for this repo's
   stack. It's a committed project policy — writing it is intended. If the repo
   `.gitignore`s `.claude/`, note it and place the file where it'll be tracked (or tell
   the user).
2. **Run `/security-review` once** and capture its findings. `/security-review` reviews the
   **pending changes on the current branch**, so it lines up with the default (empty) target
   directly. For an explicit non-current-branch target (a PR, a range, another branch), first
   check it out (or apply its diff to the working tree) so `/security-review` sees the same code;
   if that isn't possible, note that the security command covered the current branch and have the
   Reviewer run a focused manual security pass over the resolved diff instead. If `/security-review`
   is unavailable entirely, note it and let the Reviewer do the manual security pass.

## Review — all teammates
Spawn three teammates in parallel on the resolved diff: the **4man:reviewer** (hand it the
base/range and the `/security-review` findings), the **4man:compliance-reviewer**, and the
**4man:correctness-reviewer**. Teammates cannot spawn teammates, so the compliance and correctness
reviewers **message their reports directly to the Reviewer**; it folds in the security findings and
both reports, scores by severity and confidence, and returns the verdict. There is no spec here, so
the Reviewer skips requirement traceability and reviews the diff on its own merits.

## Report
Present the verdict: decision, then findings grouped by severity, each with confidence
and `file:line`. List low-confidence/possible-false-positives separately. This is a
read-only review — do not modify code.

If the target was a PR, OFFER to post the findings as PR review comments — via the
GitHub MCP (`mcp__github__pull_request_review_write` to open the review,
`mcp__github__add_comment_to_pending_review` per finding, then `submit_pending`) when
the remote is GitHub, else `gh` — but only post after the user explicitly confirms.
