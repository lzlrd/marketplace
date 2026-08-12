# prompting-claude

An expert Claude prompt engineer for [Claude Code](https://github.com/anthropics/claude-code).
Describe what you want a Claude model to do, name the target model, and the skill returns a
single prompt optimised for that model's documented behaviour. Or paste an existing prompt and
ask to optimise or migrate it. It covers the Claude 5 generation (Fable 5, Mythos 5, Opus 5,
Sonnet 5) and, as a secondary target, Opus 4.8, grounds every change in Anthropic's official
prompting docs, and hands back **only the finished prompt** in a copy-ready code block. There is
no command to type.

```
You: "optimise this system prompt for Opus 5"   (no command)
        │  skill `prompting-claude` engages and:
        ▼
   1. Target      ── which Claude model, and the surface (system prompt / one-shot, agentic, effort, thinking)
   2. Consult KB  ── cross-model principles + the target model's tuning checklist (bundled, offline)
   3. Draft       ── clear instruction · the reason behind it · role · XML tags · explicit scope, kept minimal
   4. Tune        ── the target model's behaviour: effort, thinking, verbosity, subagents, verification, tools
   5. Strip       ── constructs that break or degrade (manual CoT, over-verification, prefill, budget_tokens…)
   6. Output      ── ONLY the finished prompt, in one fenced code block
```

## Auto-Engagement

The entry point is an auto-invoked skill named `prompting-claude`. Claude loads it whenever a
request is to build or tune a prompt for a named Claude 5 generation model: "write a system
prompt for Opus 5…", "make Fable 5 stop over-planning…", "why is Sonnet 5 ignoring my
instruction…", "migrate this prompt to Claude 5…". It needs no command, and is slash-available
as `/prompting-claude:prompting-claude` if you want to force it.

Its one output is the prompt itself, with no preamble or explanation. The only time it says
anything else is to ask a single clarifying question when a decision-changing fact is missing and
cannot be defaulted.

## When to use it

This skill is for tuning a prompt to a **specific Claude 5 generation model or Opus 4.8**, where
the value is in that model's behaviour: effort, adaptive thinking, verbosity, subagents,
verification, tool triggering, API constraints, or migrating a prompt to a newer Claude version.
For a general, model-agnostic prompt for any LLM app (a Gemini Gem, a custom GPT, a plain Claude
Project with no model-specific tuning), the sibling [`prompt-engineering`](../prompt-engineering)
plugin is the better fit.

## Install

```sh
/plugin marketplace add lzlrd/marketplace
/plugin install prompting-claude@lzlrd
```

Restart the session. Check: the `prompting-claude` skill shows in the skills list and
`/prompting-claude:prompting-claude` is registered.

## What it applies

The defining move is subtraction. Current Claude models are held back by over-specification:
Anthropic removed over 80% of Claude Code's system prompt for Claude 5 models with no measured
loss. So the skill prefers a brief instruction that trusts the model's judgement over an
enumerated ruleset, and prefers removing a legacy instruction over rewriting it. On top of that it
applies the cross-model principles (clarity, the reason behind an instruction, roles, XML
structure, long-context ordering, positive framing) and the target model's specific tuning, and it
strips constructs that break the API or degrade the model:

- **Manual chain-of-thought / show-your-reasoning** trips the `reasoning_extraction` refusal on
  Fable 5 and Mythos 5 and silently falls back to Opus 4.8. Read the structured thinking blocks
  instead.
- **Over-verification** instructions on Opus 5, which self-verifies.
- **Prefilled assistant turns** (a 400 on Claude 4.6+), **`budget_tokens`** (a 400 on 4.7+), and
  **`temperature` / `top_p` / `top_k`** on Sonnet 5 (a 400).
- **Aggressive `CRITICAL` / `You MUST`** language, which makes current models overtrigger.

## Knowledge base: offline by default

The skill is grounded in Anthropic's official Claude prompting docs, bundled so it works fully
offline. `SKILL.md` carries a self-sufficient quick reference; the depth lives in two references
loaded on demand: `claude-5-prompting.md` for the cross-model principles and the Claude 5
context-engineering rules, and `model-tuning.md` for the per-model checklists and a copy-paste
snippet library. When a live source for the docs is connected, treat it as the source of truth for
fast-moving specifics; otherwise the bundled references stand alone.

## Structure

```
prompting-claude/
├── .claude-plugin/
│   └── plugin.json                 # manifest
└── skills/prompting-claude/
    ├── SKILL.md                    # role, procedure, quick reference, strip-list, output rules (always loaded)
    └── references/                 # loaded on demand
        ├── claude-5-prompting.md       # cross-model principles + the six context-engineering rules
        └── model-tuning.md             # per-model tuning (Fable 5, Opus 5, Sonnet 5, Opus 4.8) + snippets
```
