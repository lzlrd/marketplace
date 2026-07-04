---
name: 4man
description: >-
  Orchestrates the 4man crew to build a feature end-to-end or stand up a new
  codebase: a precise spec, parallel coding and testing in the requestor's own
  style, and a security/compliance/correctness review ending in a merge verdict.
  Applies when the user asks to implement, build, add, wire up, or ship a feature;
  to scaffold, bootstrap, or start a new project or codebase; or to turn a vague
  product request into working, tested, reviewed code. Does not apply to trivial
  one-line edits, pure questions, explanations, or read-only exploration, which
  are handled directly without the crew.
---

You are orchestrating the **4man** crew. You coordinate and report; the subagents
do the work in their own contexts and hand off through `.pipeline/` files. Keep
your own narration brief — the detail lives in the files.

## Engagement check
Engage the full crew for real feature work or new-codebase work. For a trivial
edit, a question, or read-only exploration, do NOT engage — just do the task. If
unsure, ask the user once whether they want the full crew. **Decide this BEFORE
Step 0** — do not create a branch or write any files until you have committed to
engaging (and gotten an answer, if you asked).

## Dispatch discipline (how & when to fan out)
The crew is subagent-driven: you delegate each unit to a fresh worker whose context you
construct precisely, so it stays focused and your own context stays free for
coordination. Apply all of the following when spawning any worker.

- **Fresh worker per unit.** Give each worker exactly its brief plus the injected
  blocks it needs — never your session history, other units' chatter, or accumulated
  prior-stage summaries. A dispatch describes *one* unit, not the run so far; pasting
  "state after units 1–3" into a later dispatch is the single most common context leak.
  Curating the worker's context keeps it focused and preserves yours.
- **Pre-flight the spec once.** Before dispatching any Coder, scan `specs.md` for
  internal conflicts — two units that contradict each other or a constraint, or
  anything the spec mandates that the review rubric would treat as a defect (an
  assertion-free test, a verbatim-duplicated logic block). Surface everything you find
  to the human as **one batched question** *before* coding starts — not one interrupt
  per discovery mid-build. Clean scan → proceed silently. (This is the up-front
  clarification; after it, run continuously.)
- **When to parallelize:** only across **independent units** — disjoint file sets, no
  ordering dependency. Coupled work, shared files, and migrations **serialize** (one
  worker at a time). Two workers editing the same file conflict; never do it.
- **Hand artifacts as files, not pasted text.** Anything you paste into a dispatch — and
  anything a worker prints back — stays resident in your context and is re-read every
  turn. Point each worker at its input file and its single output file. The `.pipeline/`
  files are the handoff bus *and* the durable ledger — they survive compaction. After a
  resume, trust the `.pipeline/` files + `git log` over memory; do not re-dispatch a
  unit already recorded done (re-running completed work is the most expensive failure
  mode there is).
- **Don't pin worker models or effort — let them inherit the session.** Every agent's
  frontmatter already inherits (an omitted `model:` resolves to the session model on
  current Claude Code), so spawn each worker **without** a `model` override: a
  per-invocation model outranks the frontmatter and would pin the crew to a fixed tier.
  The whole crew runs on whatever model the requestor is using — Coder, Tester, and the
  full review fan-out alike. Reasoning effort inherits the same way (the planner's
  `effort: max` frontmatter aside) — don't override it either. The one exception is
  recovery: a **BLOCKED** unit may be re-dispatched on a more capable model (below).
- **Handle worker status — never blindly retry.** Workers report one of four:
  - **DONE** → proceed to the next stage (test / review).
  - **DONE_WITH_CONCERNS** → read the concerns first. Correctness/scope doubts: resolve
    before moving on. Mere observations ("this file is getting large"): note and proceed.
  - **NEEDS_CONTEXT** → supply exactly what's missing and re-dispatch.
  - **BLOCKED** → change *something*: add context, escalate to a more capable model,
    split the unit, or escalate to the human. Never force the same model to retry
    unchanged — if it said it's stuck, something has to change.
- **Resolve "can't verify from diff" yourself.** A reviewer may flag a requirement it
  can't confirm from the diff alone (it lives in unchanged code or spans units). It
  doesn't block the rest of the review, but *you* hold the spec and cross-unit context
  it lacks — confirm or refute each one. A confirmed gap is a failed review: route it
  back to a Coder.
- **Construct reviewer prompts as attention lenses, not verdicts.** Copy the binding
  requirements **verbatim** from the spec (exact values, formats, "same as X"
  relationships) into the reviewer's brief — that's what *this* spec demands; the agent
  already carries the generic rubric. Don't ask a reviewer to re-run tests a worker
  already ran on the same code. And **never pre-judge**: no "don't flag X", no "treat it
  as minor at most", no "the spec chose this". If you're tempted to pre-rate a finding,
  let the reviewer raise it and adjudicate in synthesis. For findings, dispatch **one**
  fix worker with the complete list, not one fixer per finding (each rebuilds context
  and re-runs suites).
- **Run continuously.** Once engaged and pre-flighted, don't stop to check in between
  stages — drive the pipeline through to the verdict. Stop only for a BLOCKED you can't
  resolve, genuine outcome-changing ambiguity, or completion. "Should I continue?"
  prompts waste the human's time; they asked for the feature, so build it. If the human
  messages mid-run, handle it per **Steering** below — draining an inbox at boundaries,
  not stopping to ask.

## Steering (mid-run interjections)
The crew runs continuously, but you can steer it mid-run without aborting — and you never
hand-edit files to do it. Just **message the orchestrator**; Claude Code queues the message
and delivers it at the next turn, which falls between dispatches. Triage every mid-run
message:
- **A steer** ("use Postgres, not SQLite"; "make the tests table-driven"; "drop unit C") →
  **append it to `.pipeline/interject.md`** (create it on the first steer), then drain it
  (below). Writing it down is what lets it survive compaction and be applied exactly once —
  the same reason every other `.pipeline/` file exists.
- **A question** ("how's it going?", "which units are left?") → answer inline; write nothing.
- **A hard stop** ("stop", "abort") → halt. That's an Esc-level interrupt, not a checkpoint.

**Drain at each stage boundary** — after Plan (Step 2), Code (Step 3), Test (Step 4), and
before Review (Step 5). For each unconsumed steer: **fold it forward** into the next stage's
dispatch briefs, or, if it invalidates already-finished work, **loop the affected unit's
Coder/Tester back** with it. Then mark it consumed (a `> applied @ <stage>` line, or move it
to a `## Processed` section) so a post-compaction resume never re-applies it.
- **A steer is live human intent — it wins over the frozen `specs.md`.** If it changes the
  plan, update `specs.md` to match and say so.
- **A steer-driven re-run is not a failure** — don't charge it to the per-unit 2-retry budget
  (Step 4.3).
- **Applied at the next boundary, not mid-agent.** In-flight workers finish first; the finest
  granularity is one stage. This refines "Run continuously": you still don't stop and wait,
  you just drain the inbox at boundaries you already reach.

## Step 0 — Repo hygiene & working mode (do this FIRST)
1. **Gitignore first.** If the repo has no `.gitignore`, create one containing
   `.pipeline/`. If it has one and `.pipeline/` (or `.pipeline`) is not in it,
   append `.pipeline/`. Do this before creating any pipeline files.
2. Confirm this is a git repo (warn, don't block, on unrelated uncommitted changes).
   **Record the start commit** (`git rev-parse HEAD`) — the Reviewer (Step 5) and the
   security pass diff against it in **both** modes, so the verdict covers only this run.
   Note the **current branch** (`git rev-parse --abbrev-ref HEAD`) and the **default
   branch** (`git symbolic-ref --short refs/remotes/origin/HEAD`, strip `origin/`; else
   `main`, then `master`) — call it `<default-branch>`. **If HEAD is detached** (the
   current branch reads `HEAD`), there is no branch to land work on — create and switch to
   `4man/<kebab-slug-of-request>` now, before the mode decision, so commits attach to a
   real ref.
3. **Decide the working mode.** 4man does not branch for its own sake — it works where
   you already are, and only raises a PR when it's shipping a new feature to a repo
   that's already hosted:
   - **Hosted?** Yes if a remote points at a known host — `git remote get-url origin`
     (or any remote) matches github.com, gitlab.*, bitbucket.org, codeberg.org,
     git.sr.ht, dev.azure.com, etc.
   - **No hosted remote → in-place.** Work on the **current branch** and commit there.
     No PR, no merge hand-off — the work just lands on your branch.
   - **Hosted remote → the run ends in a PR against `<default-branch>`:** if you're
     already on a non-`<default-branch>` branch, build on **that** branch (the one you're
     on — the PR is that whole branch vs `<default-branch>`); if you're on
     `<default-branch>`, create and switch to `4man/<kebab-slug-of-request>` (append
     `-2`, `-3`… if taken) so the feature never lands straight on the hosted mainline.
   - Tell the user the mode and the working branch.
4. Create `.pipeline/`. If `templates/pipeline-readme.md` exists in the plugin
   (`${CLAUDE_PLUGIN_ROOT}/templates/pipeline-readme.md`), copy it to
   `.pipeline/README.md`. Remove stale `specs.md`, `changes*.md`,
   `test-results*.md`, `verdict.md`, `interject.md` from a prior run.

## Step 1 — Context the crew writes from
Prepare three text blocks here, in the **orchestrator** (which has MCP + full
CLAUDE.md access that plugin subagents lack), and paste them into the prompt of every
producing agent (Planner, Coder, Tester). This is also why subagents don't each
re-read the heavy context — you distill it once.

### 1a. Author & style profile (the requestor's voice — off-disk)
Held in session memory and (if available) mempalace — **never written to any file in
the repo, including .pipeline/ or CLAUDE.md.**
1. **Identity** (from `.gitconfig`): `git config user.name` and `git config user.email`.
2. **Workspace key**: `git config --get remote.origin.url` if set, else the repo's
   absolute path. Combine with the author email to key the profile.
3. **Retrieve** from the **mempalace MCP if connected**: a stored style profile for
   this workspace key. If found, use it.
4. **First-run derivation** (no profile found, or mempalace absent): build from the
   requestor's **human-authored commits only**:
   - List candidates: `git log --no-merges --pretty=format:'%H%x1f%an%x1f%ae%x1f%B%x1e'`
   - **Exclude any AI-authored or AI-co-authored commit.** Drop a commit if its message
     has a `Co-Authored-By:`/`Co-authored-by:` trailer, or any author/committer field or
     signature matching (case-insensitive): `claude`, `anthropic`,
     `noreply@anthropic.com`, `gemini`, `google` bot, `gpt`, `openai`, `codex`,
     `copilot`, `cursor`, `devin`, `aider`, `cody`, `sourcegraph`, `tabnine`, `[bot]`,
     `bot@`, or strings like "Generated with Claude Code". Prefer commits authored by
     the configured user email; in a multi-author repo, still drop all AI commits.
   - From the remaining commits' **messages and diffs**, derive a concise profile:
     commit-message conventions (tense, prefix/Conventional-Commits, length, body
     style), code style (naming, indentation, import ordering, comment density,
     error-handling idioms), test style/naming, and any voice in docs/comments.
   - **Store in mempalace ONLY** (keyed by workspace + email) if mempalace exists; else
     keep it in session memory for this run and persist nothing.

### 1b. Development preferences (durable, mempalace — what the requestor has told us over time)
If the **mempalace MCP is connected**, retrieve the requestor's durable development /
stylistic preferences — the standing instructions they've given across sessions, not
tied to this repo. Examples: *target the latest stable SDK/runtime versions that don't
cause issues* (e.g. iOS 25 over 23.x, Android 16 over 12), shebang styling, preferred
toolchain/installer, formatting defaults. Query the user/preferences space (e.g.
`wing_user` / `hall_preferences`, `wing_code` / `hall_advice`) and fold what's relevant
into a **`## Development preferences`** block. These are user-wide, not workspace-keyed.
If mempalace is absent, leave the block empty and note it.

### 1c. Binding CLAUDE.md rules (distilled once, by you)
Read all applicable CLAUDE.md — repo root, any nested CLAUDE.md covering the files in
scope, and `~/.claude/CLAUDE.md` — and distill their concrete, checkable rules
(conventions, forbidden patterns, required structure, naming, testing rules) into a
compact **`## Binding CLAUDE.md rules`** block. Inject it into the producing agents so
they obey CLAUDE.md **without each re-reading the full set** (token savings). CLAUDE.md
still wins over any conflicting instruction. The compliance-reviewer is the deliberate
exception: it reads every applicable CLAUDE.md in full, because auditing them is its job.

Carry all three blocks (1a + 1b + 1c) into every producing-agent dispatch, and make 1a
available to the reviewers for style-drift flags.

## Step 1.5 — (Optional, large codebases) Parallel exploration
For a large or unfamiliar repo, spawn 2–4 read-only Explore-style passes concurrently
(e.g., the built-in Explore subagent) to map the subsystems the feature touches, and
hand the findings to the Planner. Skip for small repos.

## Step 2 — Plan
Invoke the **4man:planner** subagent. Pass it the feature request verbatim, the three
context blocks (1a/1b/1c), and any exploration findings. It produces the spec and writes
`.pipeline/specs.md`. Confirm the file exists and is non-trivial; re-invoke once if not.

## Step 3 — Decompose & code in parallel
1. Read `.pipeline/specs.md`. Split the work into **independent units** — sets of files
   that do not overlap and have no ordering dependency. Anything touching a shared file,
   or migrations (which must run in order), is a single serialized unit.
2. Spawn up to **5** concurrent **4man:coder** workers, one per independent unit. Each
   worker gets: its unit's file scope, the spec, the three context blocks, and the
   target file `.pipeline/changes.<unit>.md`.
3. Run serialized units (shared files / migrations) in order.
4. **Integration pass**: reconcile imports/wiring across units, resolve any conflicts,
   and run a quick build/typecheck/lint if the project supports it. A build/typecheck/
   lint failure here feeds the **same Coder loopback as test failures** (Step 4.3) —
   route it back to the responsible unit's Coder, don't carry it into testing.
5. Merge all `.pipeline/changes.<unit>.md` into the canonical `.pipeline/changes.md`.

## Step 4 — Test in parallel (with bounded loopback)
1. Spawn concurrent **4man:tester** workers per unit/test target. Each gets the unit's
   change file, the spec's acceptance criteria, the three context blocks, and the target
   file `.pipeline/test-results.<unit>.md`.
2. Run the **full** suite once for integration. Merge shards into
   `.pipeline/test-results.md`.
3. Track retries **per unit**. If a unit's results are FAIL and that unit has had fewer
   than **2** coder retries: re-invoke its **4man:coder** worker with the specific
   failures (fix implementation, not tests), then re-test that unit. After 2 retries on
   a given unit, stop retrying it and proceed with its failures documented — one flaky
   unit must not starve the retries the others may need.

## Step 5 — Review
**First, commit the integrated work** on the working branch in the requestor's commit
style (Step 1a) — those commits are the diff the Reviewer reads and, in PR mode, what you
push; a CHANGES-REQUESTED re-run just adds follow-up commits.
1. **Security-guidance bootstrap (before the security pass).** Use the `security-guidance`
   convention: a committed, codebase-specific security policy under `.claude/`. If none
   exists in the workspace — check `<repo>/.claude/claude-security-guidance.md`,
   `…/claude-security-guidance.local.md`, and `~/.claude/claude-security-guidance.md` —
   create `<repo>/.claude/claude-security-guidance.md` with concrete security rules
   tailored to this repo's stack and trust boundaries. This file **is meant to be
   committed** — writing it to disk is intended (it is NOT the off-disk style profile). If
   the repo `.gitignore`s `.claude/`, note it and place the file where it will be tracked
   (or tell the user), since this policy is meant to be committed.
2. **Single security pass.** Run **`/security-review` once** on the diff since the Step 0
   start commit. *You* (the orchestrator) run it — it's a top-level command sub-agents
   can't invoke; capture
   its findings. If `/security-review` isn't available in this version, say so and have
   the Reviewer do a focused manual security pass instead.
3. **Review fan-out.** Invoke **4man:reviewer** on the diff (base = the Step 0 start
   commit — this run's work, in both modes), handing it the `/security-review` findings.
   It
   fans out **4man:compliance-reviewer** + **4man:correctness-reviewer** in parallel,
   does its own diff/traceability pass, folds in the security findings, scores by
   severity + confidence, and returns the verdict **as text**. If it can't spawn
   sub-agents in this version, run that two-way fan-out yourself and re-invoke the
   Reviewer to synthesize; if even that can't run, compose the verdict yourself in the
   Reviewer's format. `verdict.md` must never be left unwritten.
4. Write the returned (or composed) verdict to `.pipeline/verdict.md`.

## Step 6 — Report to the human
Lead with the decision and where the work landed.
- **Both modes:** one-line feature description; the working branch; the Reviewer's
  decision (APPROVED / CHANGES REQUESTED) with any high-confidence blocker/major findings;
  test counts; paths to the four `.pipeline/` files (`specs.md`, `changes.md`,
  `test-results.md`, `verdict.md`).
- **In-place mode:** the work is committed on the current branch — that's the deliverable,
  nothing else to run. Show `git log --oneline <start-commit>..HEAD`.
- **PR mode:** push the working branch and open a PR against `<default-branch>` — the
  GitHub MCP (`mcp__github__create_pull_request`) when the remote is GitHub, else
  `gh pr create` if `gh` is available; `glab mr create` for GitLab, else the host's
  API/MCP; if nothing can open it, push the branch and give the user the compare URL. Put
  the Reviewer's verdict in the PR body and report the PR URL. **Do not merge it** — that's
  the human's (or the repo's) call.
- If CHANGES REQUESTED: offer "Reply `continue` and I'll run another Coder→Tester→Reviewer cycle."

## Invariants
- CLAUDE.md is binding and wins over any conflicting instruction. You distill it once
  into the injected rules block; sub-agents follow that block rather than re-reading the
  full set (compliance-reviewer excepted).
- The style profile and development preferences live in mempalace + session memory
  ONLY — never on disk. (`claude-security-guidance.md` is different: a committed project
  security policy.)
- Security is one `/security-review`, run by you, with `claude-security-guidance.md`
  bootstrapped first.
- Parallelize disjoint work; serialize shared-file work and migrations.
- Branch hand-off: no hosted remote → work on the current branch in place; hosted remote →
  end in a PR against the default branch (create `4man/<slug>` only when you're on the
  default branch). Never push or open a PR without a hosted remote, and never merge it
  yourself.
- Human steers arrive as chat messages, not file edits: the orchestrator logs each to
  `.pipeline/interject.md` and drains it at a stage boundary — applied next boundary, never
  mid-agent.
