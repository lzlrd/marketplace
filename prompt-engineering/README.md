# prompt-engineering

An expert prompt engineer for [Claude Code](https://github.com/anthropics/claude-code).
Describe what you want an LLM to do in plain language and the skill returns a single
optimized, ready-to-paste prompt for a Gemini Gem, a Claude Project, a custom GPT, or any
other LLM app, or refines a prompt you paste in. It grounds every prompt in the
promptingguide.ai prompt-engineering guide and hands back **only the finished prompt**, in a
copy-ready code block. There is no command to type.

```
You: "write a prompt for an expert code reviewer that reports bugs by severity"   (no command)
        │  skill `prompt-engineering` engages and:
        ▼
   1. Understand   ── infer the task type (classification, extraction, agent, reasoning…)
   2. Consult KB   ── query the NotebookLM notebook if connected, else the bundled reference
   3. Draft        ── role · instruction-first · context · delimiters · output format · few-shot
   4. Guardrails   ── fold in the applicable behavioral guardrails, adapted to fit
   5. Output       ── ONLY the finished prompt, in one fenced code block
```

## Auto-Engagement

The entry point is an auto-invoked skill named `prompt-engineering`. Claude loads it whenever a
request is to produce a prompt for an LLM: "write a prompt for…", "create a Gem that…", "make a
system prompt for…", "optimize / refine this prompt…", "turn this into a meta-prompt…". It needs
no command, and is slash-available as `/prompt-engineering:prompt-engineering` if you want to
force it.

Its one output is the prompt itself, with no preamble or explanation. The only time it says
anything else is to ask a single clarifying question when the request is too vague to build a
useful prompt.

## Install

```sh
/plugin marketplace add lzlrd/marketplace
/plugin install prompt-engineering@lzlrd
```

Restart the session. Check: the `prompt-engineering` skill shows in the skills list and
`/prompt-engineering:prompt-engineering` is registered.

## Knowledge Base: online and offline

The skill is grounded in the *"Promptingguide.ai's Prompt Engineering Guide"* NotebookLM
notebook, and works either way:

- **MCP connected** (a NotebookLM MCP server providing `mcp__notebooklm__chat_ask`): it queries
  the live notebook for source material on the request's task type.
- **MCP unavailable** (headless run, no server): it falls back to a bundled, distilled copy of
  the guide at `skills/prompt-engineering/references/prompt-engineering-guide.md`, with the same core
  techniques, so the skill is fully self-sufficient offline.

Either path yields the same quality of prompt.

## What it applies

Straight from the guide:

- **Elements of a prompt:** instruction, context, input data, output indicator.
- **Role prompting:** set the assistant's identity, intent, and tone.
- **Instruction-first, specific, positive:** lead with the task; say what to do, not what to avoid.
- **Delimiters & structured output:** `###` / `"""` / XML-style tags; exact JSON/list schemas.
- **Few-shot:** 1 to 3 representative examples for pattern- or tone-sensitive tasks.
- **Chain-of-thought:** for reasoning-heavy tasks on standard models; kept direct for reasoning models.

The bundled reference goes deeper (LLM settings, self-consistency, prompt chaining, ReAct, RAG,
reasoning-vs-chat prompting, and prompt-injection / factuality defenses).

## Structure

```
prompt-engineering/
├── .claude-plugin/
│   └── plugin.json                 # manifest
└── skills/prompt-engineering/
    ├── SKILL.md                    # role, procedure, guardrails, output rules (always loaded)
    └── references/
        └── prompt-engineering-guide.md   # distilled guide, loaded when the MCP is offline
```
