# 4man

Four roles for [Claude Code](https://github.com/anthropics/claude-code): a Planner,
parallel Coders and Testers, and a fan-out Reviewer. Describe a feature in plain
language; the crew plans it, builds and tests it in parallel, runs a security and review
pass, and lands it in your own style. No command to type.

```
You: "add rate limiting to the login endpoint"      (no command)
        │  skill `4man` auto-engages and orchestrates:
   context blocks   ← your voice + dev prefs (mempalace) + distilled CLAUDE.md
        ▼
   Planner ───────────────▶ .pipeline/specs.md
   Coder ×N   (parallel)  ─▶ .pipeline/changes.md
   Tester ×N  (parallel)  ─▶ .pipeline/test-results.md
   orchestrator ─▶ one /security-review (+ claude-security-guidance.md)
   Reviewer ─ fans out ─▶ compliance │ correctness  ─▶ .pipeline/verdict.md
```

## Auto-Engagement

The entry point is an auto-invoked skill named `4man`. Claude loads it when a request
looks like feature or new-codebase work: "implement…", "add…", "build…", "scaffold a
new…". No command. It is slash-available as `/4man:4man` if you want to force it; there is
no separate command for the crew.

It stays out of trivial edits, questions, and read-only exploration. If a request is
genuinely ambiguous, it asks once before touching anything.

## Install

```sh
/plugin marketplace add lzlrd/marketplace
/plugin install 4man@lzlrd
```

Restart the session. Check: `/agents` lists the six `4man:*` agents, `/4man:code-review`
is registered, and the `4man` skill shows in the skills list.

## Branches

4man branches only when it has to.

- **No hosted remote:** it works on your **current branch** and commits there. Nothing
  else to run.
- **Hosted remote (GitHub/GitLab/etc.):** shipping a new feature ends in a **PR** against
  the default branch. If you are already on a feature branch it builds there (the PR is
  that whole branch vs the default base); if you are on the default branch or in detached
  HEAD it creates `4man/<slug>` so the feature never lands straight on the mainline. It
  opens the PR, returns the URL, and never merges.

## The Pipeline

The crew does not run in your main session. Each stage gets a fresh context, reads one
file, writes one file:

| File | Written by | Read by |
|---|---|---|
| `specs.md` | Planner | Coders, Testers, Reviewer |
| `changes.<unit>.md` → `changes.md` | Coders | Testers, Reviewer |
| `test-results.<unit>.md` → `test-results.md` | Testers | Reviewer |
| `verdict.md` | orchestrator | you |
| `interject.md` | orchestrator (from your messages) | orchestrator |

`.pipeline/` is gitignored on the first action of every run, so it never lands in a
commit. It doubles as a ledger: it survives compaction, so the crew resumes from it
instead of redoing finished units.

## Context It Writes From

Subagents cannot reach MCP or the full CLAUDE.md set cheaply, so the orchestrator distils
three blocks once and injects them into Planner, Coder, and Tester:

1. **Your voice.** Identity from `.gitconfig`; style from mempalace, else derived from
   your human-authored commits (AI commits filtered out). Held in mempalace/session only,
   never written to disk.
2. **Development preferences.** Your durable standing instructions from mempalace:
   latest-stable SDK/runtime versions, shebang style, toolchain, formatting.
3. **Binding CLAUDE.md rules.** Every applicable CLAUDE.md, distilled to the checkable
   rules. CLAUDE.md is binding and wins on conflict.

To save tokens the subagents do not each re-read CLAUDE.md. They follow the distilled
block. The one exception is the compliance-reviewer, which reads it in full.

## Parallelism

The Planner splits work into independent units (disjoint files, no ordering). The
orchestrator fans out up to 5 Coders, then Testers, then the review, all concurrently.
Shared files and migrations serialise. On a failure it loops Coder→Tester up to twice per
unit, then reports with the failures documented.

Testers find the root cause before touching anything: read the error, reproduce, trace
the bad value to its source, weigh competing hypotheses, then fix a test defect or report
an implementation defect with the smallest failing input. They never loosen an assertion
to force a pass.

## Steering

The crew runs to the verdict without stopping to ask — but you can steer it mid-run without
aborting. Just message the orchestrator (Claude Code queues it and delivers it at the next
stage boundary). A steer — "use Postgres, not SQLite", "make the tests table-driven", "drop
unit C" — is logged to `.pipeline/interject.md` and applied at the next boundary: folded into
the next stage, or looped back to re-do the unit it invalidates. A question is answered
inline; "stop" is an Esc-level halt. Because it lands at the next boundary and never
mid-agent — in-flight workers finish first — it's cooperative checkpointing, not a hard
interrupt.

## Security

In the review stage (and in `/4man:code-review`) the orchestrator bootstraps
`claude-security-guidance.md` if the workspace has no security policy (a committed,
codebase-specific file), then runs `/security-review` once on the diff and hands the
findings to the Reviewer. If `/security-review` is unavailable, the Reviewer does a
focused manual pass.

## The Reviewer

Read-only: no Write/Edit on any reviewer, enforced by their tool lists. The lead Reviewer
fans out two sub-reviewers in parallel:

- **compliance-reviewer:** CLAUDE.md conformance (reads it in full).
- **correctness-reviewer:** logic, boundaries, error paths, races, idempotency, data
  integrity, spec edge cases.

It folds in the `/security-review` findings and its own diff pass, tags each finding with
severity and confidence, drops likely false positives, and issues APPROVED or CHANGES
REQUESTED. If the running version cannot let a subagent spawn subagents, the orchestrator
runs the fan-out itself. Both paths are wired.

## /4man:code-review

Review an arbitrary diff, branch, or PR through the same read-only fan-out:

```sh
/4man:code-review                 # current branch vs its default base
/4man:code-review 123             # PR #123 (via GitHub MCP, else gh)
/4man:code-review staged          # git diff --cached
/4man:code-review working         # unstaged working tree
/4man:code-review HEAD~3          # a range
```

It bootstraps the security guidance, runs one `/security-review`, fans out compliance and
correctness, and returns a confidence-scored verdict. For a PR (via the GitHub MCP, else
`gh`) it offers to post the findings as inline comments, only after you confirm.

## Models and Effort

The agents inherit whatever model the session runs. The planner alone pins its
reasoning effort (`effort: max` in `agents/planner.md`); the rest inherit the session
effort.
