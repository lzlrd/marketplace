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
   Tester ×N (teammates, parallel) ─▶ write and run tests, report to the lead
   lead ─▶ one security pass (claude-security scan if the run earns it, else /security-review)
   Reviewer + compliance + correctness  (teammates, parallel) ─▶ .pipeline/verdict.md
```

The crew coordinates through the native **shared task list** and **mailbox**, not through files:
teammates claim units of work, edit disjoint file sets in parallel, and message each other
directly at integration seams. The lead spawns them, steers, and synthesises.

## Enable Agent Teams and the Task Tools

4man runs the crew as a Claude Code **agent team** and keeps its ledger on the shared task
list. Both are off by default on current models. Turn them on with two environment variables,
in `~/.claude/settings.json` (or your project settings):

```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1",
    "CLAUDE_CODE_ENABLE_TODO_TOOLS": "1"
  }
}
```

Restart the session. Agent teams are **required**: without them the crew stops and asks you to
enable them, and there is no subagent fallback. The Task tools are strongly recommended: without
them the crew warns you, asks once, and can still run on messages alone, but nothing unblocks a
dependent unit automatically and there is no shared ledger, only the unit list the lead keeps in
`.pipeline/run.md`. The second
variable restores the Task tools
(`TaskCreate` and its siblings), which Claude Code leaves out by default on models newer than
Opus 4.7, Sonnet 4.6, and Haiku 4.5. Set both in settings, not as a shell export: an exported
variable does not reach teammates in split panes.

4man needs an interactive session (not `claude -p` or the Agent SDK) on Claude Code 2.1.288
or later, the first release in which a plugin's agent definitions apply to teammates. Claude
Code documents the messaging tool and the planner's effort setting for in-process teammates
only, the default display mode. If hand-offs stall in split panes (`teammateMode` set to tmux
or iTerm2), run the crew in-process. Agent teams are
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

Restart the session, then enable agent teams and the Task tools (above). Check:
`/agents` lists the six `4man:*` agents, `/4man:code-review` is registered, and the `4man` skill
shows in the skills list.

## Branches

4man branches only when it has to.

- **No hosted remote:** it works on your **current branch** and commits there. Nothing else to
  run. The same goes for a hosted remote that has no branches yet: there is nothing to raise a
  PR against, so the first push is yours.
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
  teammate works its task and marks it done, or the lead marks it when the completion report
  arrives by message; a dependent task then unblocks automatically.
  The list persists across compaction and resume, so finished units are not redone. Teammates
  themselves do not survive a resume; the lead spawns new ones for the unfinished tasks.
- **The mailbox** carries direct messages between teammates and the lead. The lead names every
  teammate so that they can address each other: two units that meet at a seam reconcile by
  message, and a Coder or Tester can put a spec question to the Planner. Your mid-run steers
  arrive the same way.

`.pipeline/` is gitignored before the run writes anything to it and holds two durable documents,
`specs.md` (the spec every teammate reads) and `verdict.md` (the review result), plus `run.md`,
the lead's record of the run: start commit, review base, branch, modes, snapshots of the work you
already had uncommitted (in your files and in the index), and your answer on the security pass. A
long run outlives the lead's context, so after a compaction or a resume the lead reads that record
back instead of trusting its memory, and a `continue` cycle reviews against the same base. Each
time the lead commits it also writes the path lists it commits from there. Coordination is native
now, so there are no per-unit hand-off files.

## Context It Writes From

A teammate reads CLAUDE.md itself, so the lead does not distil or inject it. The crew agents'
tool lists are allowlists, though, so a teammate has no MCP servers, skills, or web access. The
lead hands each one what it cannot fetch for itself, in the spawn prompt:

1. **Your voice.** Identity from `.gitconfig`; style from mempalace, else derived from your
   human-authored commits (AI commits filtered out). A derived profile is kept for the run
   only: 4man offers to save it to mempalace at the end and does so only if you say yes.
   Nothing is written to the repo.
2. **Development preferences.** Your durable standing instructions from mempalace: latest-stable
   SDK/runtime versions, shebang style, toolchain, formatting.
3. **Anything else the unit needs from MCP, a skill, or the web,** such as current library
   versions.

CLAUDE.md is binding and wins on conflict. Every teammate reads it; the compliance-reviewer reads
it in full.

## Parallelism

The Planner splits the work into independent units (disjoint files, no ordering). A single-feature
change is usually one unit, so one Coder; larger work or a new-project build fans out a Coder
teammate per unit (up to five at a time, the practical sweet spot; further units start as
Coders finish). Then Testers, all working at once; shared
files and migrations serialise as dependent tasks. Two teammates never edit the same file. On a
failure the lead loops a unit's Coder and Tester up to twice, then reports with the failures
documented.

Who commits depends on the build mode: for a feature change the lead makes one integrated commit at
review; for a new-project build the Coders commit their own units so the fresh repo gets real
history. Every commit names its paths. Work you already had uncommitted when the run started,
staged changes included, stays out of the crew's commits and out of the review, unless you put a
file in scope at the pre-flight question. If the crew had to change a file you were already
editing, a lockfile for example, the lead asks before committing it. A file you edit while the
crew is running counts as the crew's work, so leave the tree alone until the verdict; edits made
between the verdict and a `continue` stay yours.

Testers find the root cause before touching anything: read the error, reproduce, trace the bad
value to its source, weigh competing hypotheses, then fix a test defect or report an implementation
defect with the smallest failing input. They never loosen an assertion to force a pass.

## Steering

After its pre-flight question the crew runs to the verdict without stopping to ask, unless it
changed a file you were already editing, and you can steer it mid-run. Just message the lead
(Claude Code delivers it at the next turn). A steer, such as "use Postgres, not SQLite", "make the
tests table-driven", or "drop unit C", updates the shared task list and goes out to the affected
teammates; if it invalidates finished work, the lead reopens that unit's task. A question is
answered inline; "stop" halts the team. Steering is native, so there is no interject file to
hand-edit.

## Security

In the review stage (and in `/4man:code-review`) the lead bootstraps `claude-security-guidance.md`
if the workspace has no security policy (a committed, codebase-specific file), then runs a single
security pass on the diff and hands the findings to the Reviewer, which also checks the diff
against that policy. The pass is one `/security-review` run by default. `/security-review`
reviews the checked-out branch against the default branch of `origin`, so it needs an `origin`
remote that has been fetched. In a repository without one, which includes every project 4man
has just initialised, the Reviewer does a focused manual pass instead.

With the **claude-security** plugin installed (from `claude-plugins-official`), the pass can be
upgraded to its deep changes scan: multi-agent research plus an adversarial verifier panel,
leaving a gitignored `CLAUDE-SECURITY-<timestamp>/` report directory in the repo. The lead runs
it in its own session through the plugin's skill, which needs dynamic workflows (the Workflow
tool) and your own acknowledgement of the cost; the pre-flight option is worded to carry it. It
is slow and uses a significant number of tokens, so 4man gates it on the size of the run
rather than offering it every time:

| Run | Deep scan |
|---|---|
| New project (scaffolding a fresh codebase) | Yes, recommended, with your cost go-ahead |
| Larger change | 4man asks, folded into its one pre-flight question |
| Small change | No: `/security-review` only, and no question asked |

A change counts as **small** only when it is a single unit under roughly 200 changed lines *and*
touches none of: authentication or authorisation, secrets or crypto, a network or IPC boundary,
deserialisation of untrusted input, file-path or subprocess/shell handling, query construction, or
a new dependency. Any one of those makes it a larger change however few the lines. You can always
run `/claude-security` yourself on a diff 4man treated as small. Your go-ahead covers one scan: a
`continue` cycle after CHANGES REQUESTED uses the fast pass unless your reply asks for the deep
scan again and accepts its cost.

The deep scan covers committed changes only, so `/4man:code-review` applies the same size gate and
offers it for committed targets that are checked out (a branch, a PR, a range). Neither engine
sees uncommitted changes, so for those the Reviewer does the manual pass.

## Companion Plugins and Integrations

4man works standalone; these make it better when present. Each is optional, and 4man degrades
gracefully without it.

Three are worth installing. **claude-code-setup** (from `claude-plugins-official`) supplies
`/claude-code-setup:claude-automation-recommender`, the new-project recommendation pass in
Step 0.5. **security-guidance** (from `claude-plugins-official`) is the
`claude-security-guidance.md` convention the review bootstraps before the security pass.
**claude-security** (from `claude-plugins-official`) upgrades that pass to a panel-verified deep
scan on new projects and larger changes, with your consent to its cost.

**humanizer** lives in its own marketplace: `/plugin marketplace add blader/humanizer`, then
`/plugin install humanizer@humanizer`.

| Integration | Kind | Used for | Without it |
|---|---|---|---|
| `/claude-code-setup:claude-automation-recommender` | skill (claude-code-setup) | new-project automation recommendations | skipped silently |
| `security-guidance` / `claude-security-guidance.md` | convention (security-guidance) | the committed security policy the review bootstraps | 4man writes a starter policy itself |
| `claude-security` deep scan | plugin (claude-plugins-official) | the security pass on committed diffs for new projects and larger changes; panel-verified, needs your cost go-ahead | one `/security-review` run |
| `/security-review` | built-in command | the security pass otherwise | Reviewer does a focused manual pass |
| `/prompting` | skill (this marketplace) | optionally sharpen teammate briefs for the model each teammate runs on | briefs sent as-is |
| `/humanizer:humanizer` | skill (humanizer, from the blader/humanizer marketplace) | de-AI crew-authored prose (commit messages, PR body, docs) | prose committed as written |
| `mempalace` MCP (or `mempalace` CLI) | memory | off-disk style profile (`coding-style`/`writing-voice`) + `working-prefs` | derived from your human-authored commits |
| GitHub MCP (or `gh` / `glab`) | VCS host | opening the PR in hosted mode | falls back to `gh`, then a compare URL |

## The Reviewer

No reviewer has Write or Edit; their tool lists enforce that. Bash stays for inspection and is
kept read-only by instruction. The lead spawns three review teammates in parallel, the Reviewer
and its two sibling reviewers:

- **compliance-reviewer:** CLAUDE.md conformance (reads it in full).
- **correctness-reviewer:** logic, boundaries, error paths, races, idempotency, data integrity,
  spec edge cases.

Teammates can't spawn teammates, so the compliance and correctness reviewers message their reports
straight to the Reviewer, by the name the lead gave it. A report that reaches the lead instead is
forwarded. The Reviewer folds in those reports, the security findings, the Testers' results, its
own diff pass, and a style-drift check against your profile, tags each finding with severity and
confidence, drops likely false positives, and issues APPROVED or CHANGES REQUESTED. Before the
verdict goes into a PR body, the lead paraphrases or drops any finding that rests on your private
instruction files and tells you which.

## /4man:code-review

Review an arbitrary diff, branch, or PR through the same read-only review team:

```sh
/4man:code-review                 # pending changes on the current branch
/4man:code-review 123             # PR #123 (via GitHub MCP, else gh)
/4man:code-review staged          # git diff --cached
/4man:code-review working         # unstaged working tree
/4man:code-review HEAD~3          # a range
```

With no argument it reviews the **pending changes on the current branch**. It bootstraps the
security guidance, runs one security pass, spawns the compliance and correctness reviewers as
teammates alongside the Reviewer, and returns a confidence-scored verdict. The security pass is:

- the claude-security deep scan, for a committed and checked-out target, when the diff is large
  enough to earn it, the plugin is installed, and you approve its cost;
- `/security-review`, for a branch or PR against the default branch of `origin`, when the working
  tree is clean;
- the Reviewer's own manual pass for everything else, pending changes included, because
  `/security-review` only sees committed work on the checked-out branch.

It needs agent teams enabled, like the full crew, but not the Task tools. It never edits source
code; it may write the security-guidance file, fetch a PR's head so that the reviewers can read
it, and check out the target branch when the working tree is clean. For a PR (via the
GitHub MCP, else `gh`) it offers to post the findings as inline comments, only after you confirm,
and it paraphrases or holds back any finding that quotes your private instruction files.

## Models and Effort

Each agent pins its own model in frontmatter, matched to what its stage needs:

| Agent | Model | Why |
| --- | --- | --- |
| `planner` | `fable[1m]` | The spec gates the whole run: deepest model, plus `effort: max` |
| `coder`, `tester` | `opus[1m]` | Implementation and its proof are the hard part |
| `reviewer`, `compliance-reviewer`, `correctness-reviewer` | `sonnet[1m]` | Three of them run per review; auditing a diff against stated criteria is the cheaper job |

The `[1m]` suffix requests the 1M-token context window. It has no effect on the Anthropic API,
where the aliases resolve to models with a native 1M window. On other providers an alias can
resolve to an older model. On a 4.6 model the suffix selects the 1M variant. Where `sonnet`
resolves to Sonnet 4.5, the
[model configuration page](https://code.claude.com/docs/en/model-config#extended-context) lists
no 1M window for it and does not say what the suffix does, so you can drop the suffix from the
reviewer files there.

The planner is the costly stage: Fable at maximum effort. On some plans Fable bills to usage
credits and asks for consent once. In a teammate's session that prompt expires after five
minutes and the planner's turn ends with no spec, so accept it in a Fable session of your own
beforehand. To plan on another model, edit `model` in `agents/planner.md`.

Reasoning effort follows the model. A teammate on the same model as your session (the coders and
testers when you run Opus) runs at your session's level. A teammate on another model runs at that
model's own saved or default level (`medium` unless you have set one for it with `/effort`); the
reviewers are in that group unless you run Sonnet. Only the planner sets its own, `effort: max` in
`agents/planner.md`, which Claude Code applies to in-process teammates. A per-invocation `model`
on the spawn call overrides frontmatter; the crew does that only to re-spawn a stuck unit on a
more capable model.

## Tests

From the repo root:

```sh
bash 4man/tst/run.sh
```

They run the git recipes the skill and `/4man:code-review` give, read from the plugin's own text, in
scratch repositories under `$TMPDIR`, and need only bash and git 2.31 or newer.
