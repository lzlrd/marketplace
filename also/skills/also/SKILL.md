---
name: also
description: >-
  Dispatch a side task to a SEPARATE sub-agent that inherits this session's power
  level — same reasoning effort (incl. max/xhigh) and ultracode, with full tools
  and full conversation context — so a tangential task gets done without derailing
  the main one. The action-counterpart to Claude Code's built-in /btw, which
  answers a side question from context but has no tools and does no work. Invoke
  as /also <task or query>.
argument-hint: <task or query to run in a side agent>
disable-model-invocation: true
---

# /also — run a side task in a separate agent, at this session's power level

Claude Code's built-in `/btw` is a side **question**: it has the full conversation context but **no tools**, and only answers from what is already known. `/also` is the side **task**: same full context, **plus full tools**, handed to a separate sub-agent that actually *does the work* — at whatever level this session is running (`max`, `xhigh`, ultracode). "By the way, also go do this," without losing the main thread.

## What to do when invoked

The task to dispatch is: **$ARGUMENTS**

1. **Delegate it — don't do it inline.** Work the task in a separate agent, not in this thread. Keeping the current task's context clean is the whole reason `/also` exists; the moment you start doing it here, you have defeated the point.

2. **Spawn a `fork`** (`Agent` tool, `subagent_type: "fork"`). Reach for a fork specifically because a fork *is* this session — it inherits your model, your reasoning effort (Claude Code's documented default is that subagents inherit the session's effort, so `max`/`xhigh` carry over), your ultracode state, and the full conversation context. That one choice buys "same power level as the session" with nothing to detect or wire up, and it means the fork already knows what "this" refers to — the `/btw` property, now with tools attached.

3. **Brief the fork.** You know this session's effort and ultracode state; the fork might not, so state them outright. A prompt along these lines:

   > You are a side-task fork dispatched via `/also`, with this session's full context and tools. This session is at **\<current effort\>** effort and ultracode is **\<on/off\>** — work at that level. If ultracode is on, tackle this the ultracode way (author and run a Workflow); otherwise do it directly at your inherited effort. **Task: $ARGUMENTS.** Resolve any references from the shared context. See it through — search before building, verify before claiming done. Come back with a **concise** result: what you did, key paths/outcomes, and anything the main session needs. No long log dumps.

4. **Relay tightly, then resume.** When the fork returns, give a few-line summary of what it did and the outcome, and pick the main task back up. The digression should cost the main thread a short recap, not a wall of text.

## Example

`/also add a CHANGELOG entry for the fork-effort fix and open a draft PR`

→ You leave the main task where it is and spawn a `fork` briefed with that sentence. Running at your current effort/ultracode with the whole session in view, it writes the entry, opens the draft PR, and returns three lines — the file it touched, the PR URL, and anything you should know. You relay those three lines and carry on.

## Edge cases

- **No task given** (`$ARGUMENTS` is empty): spawn nothing. Reply with one line — what `/also` does and how to call it (`/also <task>`).
- **The side task edits files** while the main thread is also editing: pass `isolation: "worktree"` to the fork so the two do not collide on the same files, then reconcile when it returns.
- **Genuinely independent task** (no bearing on current work): a fork still works and still inherits effort — the extra context is cheap. Only reach for a fresh `general-purpose` subagent when you deliberately want an empty-context worker.
