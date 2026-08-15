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
   lead ─▶ one security pass (claude-security scan if the run earns it, else /security-review)
   Reviewer + compliance + correctness  (teammates, parallel) ─▶ .pipeline/verdict.md
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

Restart the session. Agent teams are **required** — without the flag 4man stops and asks you to
enable it; there is no subagent fallback. Agent teams are
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

Restart the session, then enable agent teams (above — required). Check: `/agents` lists the six
`4man:*` agents, `/4man:code-review` is registered, and the `4man` skill shows in the skills list.

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

The Planner splits the work into independent units (disjoint files, no ordering). A single-feature
change is usually one unit, so one Coder; larger work or a new-project build fans out a Coder
teammate per unit (up to five, the practical sweet spot). Then Testers, all working at once; shared
files and migrations serialise as dependent tasks. Two teammates never edit the same file. On a
failure the lead loops a unit's Coder and Tester up to twice, then reports with the failures
documented.

Who commits depends on the build mode: for a feature change the lead makes one integrated commit at
review; for a new-project build the Coders commit their own units so the fresh repo gets real
history.

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
if the workspace has no security policy (a committed, codebase-specific file), then runs a single
security pass on the diff and hands the findings to the Reviewer. That pass is one
`/security-review` run by default; if it isn't available either, the Reviewer does a focused
manual pass.

With the **claude-security** plugin installed (from `claude-plugins-official`), the pass can be
upgraded to its deep changes scan — multi-agent research plus an adversarial verifier panel,
leaving a gitignored `CLAUDE-SECURITY-<timestamp>/` report directory in the repo. It is slow and
uses a significant number of tokens, so 4man gates it on the size of the run rather than offering
it every time:

| Run | Deep scan |
|---|---|
| New project (scaffolding a fresh codebase) | Yes — recommended, with your cost go-ahead |
| Larger change | 4man asks, folded into its one pre-flight question |
| Small change | No — `/security-review` only, and no question asked |

A change counts as **small** only when it is a single unit under roughly 200 changed lines *and*
touches none of: authentication or authorization, secrets or crypto, a network or IPC boundary,
deserialization of untrusted input, file-path or subprocess/shell handling, query construction, or
a new dependency. Any one of those makes it a larger change however few the lines. You can always
run `/claude-security` yourself on a diff 4man treated as small.

The deep scan covers committed changes only, so `/4man:code-review` applies the same size gate and
offers it for committed targets (a branch, a PR, a range, a commit), keeping `/security-review` for
uncommitted ones.

## Companion plugins & integrations

4man works standalone; these make it better when present. Each is optional, and 4man degrades
gracefully without it.

Three are worth installing. **claude-code-setup** (from `claude-plugins-official`) supplies
`/claude-code-setup:claude-automation-recommender`, the new-project recommendation pass in
Step 0.5. **security-guidance** (from `claude-plugins-official`) is the
`claude-security-guidance.md` convention the review bootstraps before the security pass.
**claude-security** (from `claude-plugins-official`) upgrades that pass to a panel-verified deep
scan on new projects and larger changes, with your consent to its cost.

| Integration | Kind | Used for | Without it |
|---|---|---|---|
| `/claude-code-setup:claude-automation-recommender` | skill (claude-code-setup) | new-project automation recommendations | skipped silently |
| `security-guidance` / `claude-security-guidance.md` | convention (security-guidance) | the committed security policy the review bootstraps | 4man writes a starter policy itself |
| `claude-security` deep scan | plugin (claude-plugins-official) | the security pass on committed diffs for new projects and larger changes — panel-verified, needs your cost go-ahead | one `/security-review` run |
| `/security-review` | built-in command | the security pass otherwise | Reviewer does a focused manual pass |
| `/prompt-engineering:prompt-engineering` | skill (this marketplace) | optionally sharpen teammate briefs | briefs sent as-is |
| `/humanizer:humanizer` | skill (this marketplace) | de-AI crew-authored prose (commit messages, PR body, docs) | prose committed as written |
| `mempalace` MCP (or `mempalace` CLI) | memory | off-disk style profile (`coding-style`/`writing-voice`) + `working-prefs` | derived from your human-authored commits |
| GitHub MCP (or `gh` / `glab`) | VCS host | opening the PR in hosted mode | falls back to `gh`, then a compare URL |

## The Reviewer

Read-only: no Write/Edit on any reviewer, enforced by their tool lists. The lead spawns three
review teammates in parallel — the Reviewer and its two sibling reviewers:

- **compliance-reviewer:** CLAUDE.md conformance (reads it in full).
- **correctness-reviewer:** logic, boundaries, error paths, races, idempotency, data integrity,
  spec edge cases.

Teammates can't spawn teammates, so the compliance and correctness reviewers message their reports
straight to the Reviewer. It folds in those reports, the security findings, its own diff
pass, and a style-drift check against your profile, tags each finding with severity and confidence,
drops likely false positives, and issues APPROVED or CHANGES REQUESTED.

## /4man:code-review

Review an arbitrary diff, branch, or PR through the same read-only review team:

```sh
/4man:code-review                 # pending changes on the current branch
/4man:code-review 123             # PR #123 (via GitHub MCP, else gh)
/4man:code-review staged          # git diff --cached
/4man:code-review working         # unstaged working tree
/4man:code-review HEAD~3          # a range
```

With no argument it reviews the **pending changes on the current branch** — the same scope
`/security-review` covers, so the two passes line up. It bootstraps the security guidance, runs one
security pass (the claude-security deep scan on a committed target when the diff is large enough to
earn it, the plugin is installed, and you approve its cost — else `/security-review`), spawns the
compliance and correctness reviewers as teammates
alongside the Reviewer, and returns a confidence-scored verdict. It needs agent teams enabled, like the full crew.
For a PR (via the GitHub MCP, else `gh`) it offers to post the findings as inline comments, only
after you confirm.

## Models and Effort

Each agent pins its own model in frontmatter, matched to what its stage needs:

| Agent | Model | Why |
| --- | --- | --- |
| `planner` | `fable[1m]` | The spec gates the whole run — deepest model, plus `effort: max` |
| `coder`, `tester` | `opus[1m]` | Implementation and its proof are the hard part |
| `reviewer`, `compliance-reviewer`, `correctness-reviewer` | `sonnet[1m]` | Three of them run per review; auditing a diff against stated criteria is the cheaper job |

The `[1m]` suffix requests the 1M-token context window. On the Anthropic API it is a no-op —
Fable 5, Sonnet 5, and Opus 5 already run 1M natively — but it keeps the full window behind an
LLM gateway, where Claude Code can't confirm 1M support. On Pro plans, Opus with 1M context
[draws usage credits](https://code.claude.com/docs/en/model-config#extended-context); drop the
suffix from `agents/coder.md` to avoid that.

Reasoning effort still inherits from the lead, except the planner, which pins `effort: max` in
`agents/planner.md`. A per-invocation `model` on the spawn call overrides frontmatter — the crew
does that only to re-spawn a stuck unit on a more capable model.
