# also

A side-**task** command for [Claude Code](https://github.com/anthropics/claude-code), the
action-counterpart to the built-in [`/btw`](https://code.claude.com/docs/en/interactive-mode#side-questions-with-/btw).
`/btw` asks a quick side *question* — it sees the whole conversation but has no tools and does no
work. `/also` runs a side *task*: it keeps that same full context, adds full tools, and hands the
job to a **separate fork sub-agent** that inherits the session's power level, so a tangential job
gets done without derailing the main one. "By the way, also go do this."

```
You: /also add a CHANGELOG entry for the fork-effort fix and open a draft PR
        │  the main thread is left untouched, and a `fork` sub-agent spins up:
        ▼
   inherits ── model · reasoning effort (incl. max/xhigh) · ultracode state · full context
   works    ── with full tools, at the session's power level (ultracode → runs a Workflow)
   returns  ── a few tight lines: what it did, key paths/URLs, anything you must know
        │
        ▼
You: pick the main task back up, digression contained
```

## Invocation

There is a command to type: **`/also <task or query>`**. It is user-invoked only — the frontmatter
sets `disable-model-invocation: true`, so Claude never fires it on its own; spinning up a sub-agent
is a deliberate act. Slash path: `/also:also`.

## Why a fork

A fork *is* the session: it inherits your model, your reasoning effort (Claude Code's documented
default is that subagents inherit the session's effort, so `max`/`xhigh` carry over), your ultracode
state, and the full conversation context. That one choice buys "same power level as the session"
with nothing to detect or wire up — and, like `/btw`, the fork already knows what "this" refers to,
now with tools attached. If ultracode is on, the fork tackles the task the ultracode way (authors
and runs a Workflow); otherwise it does the work directly at the inherited effort.

## Install

```sh
/plugin marketplace add lzlrd/marketplace
/plugin install also@lzlrd
```

Restart the session. Check: the `also` skill shows in the skills list and `/also:also` is registered.

## Structure

```
also/
├── .claude-plugin/
│   └── plugin.json          # manifest
└── skills/also/
    └── SKILL.md             # the dispatch procedure (loaded when you invoke /also)
```
