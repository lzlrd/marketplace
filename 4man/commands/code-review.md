---
description: Review a diff, branch, or PR with the 4man Reviewer — runs one /security-review (bootstrapping claude-security-guidance.md first) and fans out CLAUDE.md-compliance and correctness sub-reviews in parallel, returning a confidence-scored verdict. Read-only; never modifies code.
argument-hint: "[PR number | branch | 'staged' | 'working' | 'HEAD~N' | range | empty = current branch vs default base]"
---

Review the target derived from: $ARGUMENTS

## Resolve the review target
- empty → diff of the current branch vs the default base: `git merge-base HEAD <default-branch>`.
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
2. **Run `/security-review` once** on the resolved diff and capture its findings. (This
   command runs in the main agent, which can invoke `/security-review`; the reviewer
   subagent cannot.) If `/security-review` is unavailable, note it and let the Reviewer
   do a focused manual security pass.

## Review
Invoke the **4man:reviewer** subagent on the resolved diff (tell it the base/range and
hand it the `/security-review` findings). It fans out compliance and correctness
sub-reviewers in parallel, folds in the security findings, scores by severity and
confidence, and returns a verdict. There is no spec here, so the Reviewer skips
requirement traceability and reviews the diff on its own merits. (If the Reviewer
reports it cannot spawn sub-agents in this version, run the fan-out yourself and pass
the reports back to it.)

## Report
Present the verdict: decision, then findings grouped by severity, each with confidence
and `file:line`. List low-confidence/possible-false-positives separately. This is a
read-only review — do not modify code.

If the target was a PR, OFFER to post the findings as PR review comments — via the
GitHub MCP (`mcp__github__pull_request_review_write` to open the review,
`mcp__github__add_comment_to_pending_review` per finding, then `submit_pending`) when
the remote is GitHub, else `gh` — but only post after the user explicitly confirms.
