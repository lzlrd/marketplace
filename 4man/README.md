# 4man

Four roles for [Claude Code](https://github.com/anthropics/claude-code): a Planner, parallel
Coders and Testers, and a fan-out Reviewer, run as a Claude Code **agent team**. Describe a
feature in plain language; the crew plans it, builds and tests it in parallel, runs a security
and review pass, and lands it in your own style. No command to type.

```
You: "add rate limiting to the login endpoint"      (no command)
        │  skill `4man` auto-engages and leads an agent team:
   context   ← your voice + dev prefs (mempalace); teammates read CLAUDE.md themselves
        ▼
   Planner   (teammate) ─▶ .pipeline/specs.md ─▶ seeds the shared task list
   Coder ×N  (teammates, parallel) ─▶ edit the code, claim tasks, message at seams
   Tester ×N (teammates, parallel) ─▶ write and run tests, report on the task list
   lead ─▶ one /security-review (+ claude-security-guidance.md)
   Reviewer  (teammate) ─ fans out ─▶ compliance │ correctness ─▶ .pipeline/verdict.md
```

The crew coordinates through the native **shared task list** and **mailbox**, not through files:
teammates claim units of work, edit disjoint file sets in parallel, and message each other
directly at integration seams. The lead spawns them, steers, and synthesises.

## Enable agent teams

4man runs the crew as a Claude Code **agent team**, which is experimental and off by default.
Turn it on with one environment variable, in `~/.claude/settings.json` (or your project
settings):

```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

Restart the session. Without it, 4man cannot form a team: it says so, and offers to run the crew
sequentially with subagents for that one run, or to proceed once you enable it. Agent teams are
[experimental](https://code.claude.com/docs/en/agent-teams) and use more tokens than a single
session, because each teammate is its own Claude instance; they earn that on the parallel
build-and-test work the crew is built around.

## Auto-Engagement

The entry point is an auto-invoked skill named `4man`. Claude loads it when a request looks like
feature or new-codebase work: "implement…", "add…", "build…", "scaffold a new…". No command. It
is slash-available as `/4man:4man` if you want to force it; there is no separate command for the
crew.

It stays out of trivial edits, questions, and read-only exploration. If a request is genuinely
ambiguous, it asks once before touching anything.

## Install

```sh
/plugin marketplace add lzlrd/marketplace
/plugin install 4man@lzlrd
```

Restart the session, then enable agent teams (above). Check: `/agents` lists the six `4man:*`
agents, `/4man:code-review` is registered, and the `4man` skill shows in the skills list.

## Branches

4man branches only when it has to.

- **No hosted remote:** it works on your **current branch** and commits there. Nothing else to
  run.
- **Hosted remote (GitHub/GitLab/etc.):** shipping a new feature ends in a **PR** against the
  default branch. If you are already on a feature branch it builds there (the PR is that whole
  branch vs the default base); if you are on the default branch or in detached HEAD it creates
  `4man/<slug>` so the feature never lands straight on the mainline. It opens the PR, returns the
  URL, and never merges.

## The Team

The crew does not run in your main session. The lead spawns **teammates**, each a full Claude Code
session in its own context, and they coordinate through two native channels:

- **The shared task list** is the ledger. The lead turns the spec's units into tasks, one per
  independent unit, with dependencies on the serialised ones (shared files, migrations). A
  teammate claims a task, works it, and marks it done; a dependent task unblocks automatically.
  The list persists across compaction and resume, so the crew picks up where it left off instead
  of redoing finished units.
- **The mailbox** carries direct messages between teammates and the lead. Two units that meet at a
  seam reconcile by messaging each other, which subagents could never do. Your mid-run steers
  arrive the same way.

`.pipeline/` is gitignored on the first action of every run and holds only two durable documents:
`specs.md` (the spec every teammate reads) and `verdict.md` (the review result). Coordination is
native now, so there are no per-unit hand-off files.

## Context It Writes From

A teammate loads CLAUDE.md, MCP, and skills natively, the same as any session, so the lead does
not distil or inject CLAUDE.md. It hands each teammate only the two things that are **not on
disk**, in the spawn prompt:

1. **Your voice.** Identity from `.gitconfig`; style from mempalace, else derived from your
   human-authored commits (AI commits filtered out). Held in mempalace/session only, never written
   to disk.
2. **Development preferences.** Your durable standing instructions from mempalace: latest-stable
   SDK/runtime versions, shebang style, toolchain, formatting.

CLAUDE.md is binding and wins on conflict. Every teammate reads it; the compliance-reviewer reads
it in full.

## Parallelism

The Planner splits the work into independent units (disjoint files, no ordering). The lead spawns
a Coder teammate per unit (up to five, the practical sweet spot), then Testers, all working at
once; shared files and migrations serialise as dependent tasks. Two teammates never edit the same
file. On a failure the lead loops a unit's Coder and Tester up to twice, then reports with the
failures documented.

Testers find the root cause before touching anything: read the error, reproduce, trace the bad
value to its source, weigh competing hypotheses, then fix a test defect or report an implementation
defect with the smallest failing input. They never loosen an assertion to force a pass.

## Steering

The crew runs to the verdict without stopping to ask, but you can steer it mid-run. Just message
the lead (Claude Code delivers it at the next turn). A steer, such as "use Postgres, not SQLite",
"make the tests table-driven", or "drop unit C", updates the shared task list and goes out to the
affected teammates; if it invalidates finished work, the lead reopens that unit's task. A question
is answered inline; "stop" halts the team. Steering is native, so there is no interject file to
hand-edit.

## Security

In the review stage (and in `/4man:code-review`) the lead bootstraps `claude-security-guidance.md`
if the workspace has no security policy (a committed, codebase-specific file), then runs
`/security-review` once on the diff and hands the findings to the Reviewer. If `/security-review`
is unavailable, the Reviewer does a focused manual pass.

## Companion plugins & integrations

4man works standalone; these make it better when present. Each is optional, and 4man degrades
gracefully without it.

Two are worth installing. **claude-code-setup** (from `claude-plugins-official`) supplies
`/claude-code-setup:claude-automation-recommender`, the new-project recommendation pass in
Step 0.5. **security-guidance** (from `claude-plugins-official`) is the
`claude-security-guidance.md` convention the review bootstraps before `/security-review`.

| Integration | Kind | Used for | Without it |
|---|---|---|---|
| `/claude-code-setup:claude-automation-recommender` | skill (claude-code-setup) | new-project automation recommendations | skipped silently |
| `security-guidance` / `claude-security-guidance.md` | convention (security-guidance) | the committed security policy the review bootstraps | 4man writes a starter policy itself |
| `/security-review` | built-in command | the single security pass in review | Reviewer does a focused manual pass |
| `/prompt-engineering:prompt-engineering` | skill (this marketplace) | optionally sharpen teammate briefs | briefs sent as-is |
| `/humanizer:humanizer` | skill (this marketplace) | de-AI crew-authored prose (commit messages, PR body, docs) | prose committed as written |
| `mempalace` MCP (or `mempalace` CLI) | memory | off-disk style profile (`coding-style`/`writing-voice`) + `working-prefs` | derived from your human-authored commits |
| GitHub MCP (or `gh` / `glab`) | VCS host | opening the PR in hosted mode | falls back to `gh`, then a compare URL |

## The Reviewer

Read-only: no Write/Edit on any reviewer, enforced by their tool lists. The lead spawns the
Reviewer as a teammate; because a teammate can spawn subagents (just not more teammates), it fans
out two read-only sub-reviewers in parallel as its own foreground subagents:

- **compliance-reviewer:** CLAUDE.md conformance (reads it in full).
- **correctness-reviewer:** logic, boundaries, error paths, races, idempotency, data integrity,
  spec edge cases.

It folds in the `/security-review` findings and its own diff pass, tags each finding with severity
and confidence, drops likely false positives, and issues APPROVED or CHANGES REQUESTED. If the
running version cannot let a teammate spawn subagents, the lead runs the fan-out itself. Both paths
are wired.

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
correctness, and returns a confidence-scored verdict. This one stays a read-only subagent review:
a focused report-back job suits a subagent rather than a team. For a PR (via the GitHub MCP, else
`gh`) it offers to post the findings as inline comments, only after you confirm.

## Models and Effort

Teammates inherit the lead's reasoning effort and run on the session's model. If they would
otherwise diverge, set **Default teammate model → leader's model** in `/config`. The planner alone
pins `effort: max` in `agents/planner.md`; the rest follow the session. A stuck unit may be
re-spawned on a more capable model.
