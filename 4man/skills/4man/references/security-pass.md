# The Security Pass

Two parts: the size gate, settled at pre-flight while the user is present, and the engines,
run at Step 5 item 4.

## Size Gate (Pre-Flight)

The `claude-security` deep verified changes scan is slow and burns a significant number of
tokens, so the run has to earn it. Raise it only when the scan could actually run: the
`claude-security:claude-security` skill is in your skill list and the Workflow tool is among
your tools. Otherwise Step 5 uses the fast pass and there is nothing to ask. Size the run
from `specs.md`:
- **new-project mode** → deep scan. A codebase built from scratch is the one case that always
  earns it. Still put its cost acceptance in the batched question, but recommend it.
- **larger changes** → **ask.** Add a "Security pass" item to the batched question: the deep
  scan (panel-verified, slow, significant tokens) or `/security-review`.
- **small changes** → don't ask, don't scan. Step 5 runs the fast pass; don't spend the
  user's attention on the question.

A change is **small** only when the spec projects a single unit under roughly 200 changed
lines **and** touches none of: authentication or authorization, secrets or crypto, a network
or IPC boundary, deserialization of untrusted input, file-path or subprocess/shell handling,
query construction, or a new dependency. Any one of those makes it a larger change however
few the lines.

Word the deep-scan option so that choosing it is the user's own cost acknowledgment, for
example "Deep scan: I understand it may take a long time and use a lot of tokens". The scan
starts only on those words from the user, and they will be away when Step 5 runs. Plugin not
installed, no Workflow tool in your session, or no cost acceptance collected → the fast pass.

Write the outcome on the `security pass` line of `.pipeline/run.md`: which engine, and for the
deep scan the user's answer word for word. Step 5 comes long after the question, and you
quote that answer to start the scan.

## Engines (Step 5, Item 4)

Run one pass, in the lead's own session: teammates cannot invoke either engine. The run's
work is committed by now. Pick the engine in this order.

### Deep Scan (claude-security)

Use it only when all three hold; otherwise go to the fast pass.
- The pre-flight size gate selected it (new-project mode, or a larger change), and the
  user's own answer there accepted the scan's time and token cost. That answer covers one
  scan: once it has run, say so on the record's `security pass` line. In a `continue` cycle,
  use the deep scan again only when the user's `continue` reply asks for it and accepts the
  cost in their own words, and quote that reply instead.
- The `claude-security:claude-security` skill is in your skill list.
- The Workflow tool is among your tools. The scan runs as a workflow, and the skill stops
  without one.

Invoke the `claude-security:claude-security` **skill** yourself and ask it to scan this
branch's changes with `--base <review base>`, the sha in the run record, quoting the
user's cost acceptance in the request. Do not spawn the `claude-security:claude-security`
agent: it cannot scan when another session dispatches it. The scan starts only on the
user's own words that it may take a long time or use a lot of tokens, which is why the
pre-flight option is worded that way. Without them it asks a fixed confirmation, and with
the user away an unanswered confirmation starts nothing.

The skill gives you its own role while it runs. When it has delivered its report, come back
to this run: keep the surviving findings, the stamped verification status, and the report
path, then continue with the review spawn. The scan leaves a self-gitignored
`CLAUDE-SECURITY-<timestamp>/` directory — an artifact, not part of the diff — and its
findings arrive panel-verified. If the skill stops without scanning, or the scan fails, say
so and fall through to the fast pass.

### Fast Pass (/security-review)

`/security-review` reviews the checked-out branch against `origin/HEAD`, the default branch
of the `origin` remote. It does not take the run's diff, and it fails outright when that ref
does not exist.
- Check first: `git rev-parse --verify --quiet origin/HEAD`. If it fails (a `git init`
  bootstrap, no `origin` remote, a remote never fetched), skip the command and go to "No
  pass".
- Otherwise run `/security-review` once and capture its findings. In PR mode its scope
  matches the review. In in-place mode on a branch that already had commits ahead of the
  default branch, it also covers those earlier commits: tell the Reviewer which findings
  fall outside `<start commit>..HEAD`.
- If the command is unavailable or errors, go to "No pass".

### No Pass

Say plainly that no security command covered the run, and tell the Reviewer so when you
spawn it. It then does its own focused manual security pass over the review-base diff.
