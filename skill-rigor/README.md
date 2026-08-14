# skill-rigor

A quality gate for [Claude Code](https://github.com/anthropics/claude-code) skill authoring.
Whenever a skill is being created or edited, two rules apply: the work runs at **maximum
reasoning effort**, and the result is **cross-checked** against the authoritative guidance
skills before it ships. No command to type.

```
You: "add a skill to my plugin that reviews changelogs"
        │  skill `skill-rigor` auto-engages
        ▼
   1. Session at max effort? Work directly.
      Otherwise spawn the bundled `skill-rigor:skill-rigor` agent —
      `effort: max`, `model: inherit` — the session's model at maximum effort.
   2. Cross-check the result against `skill-creator` (Anthropic) and
      `skill-development` (plugin-dev), whichever are installed.
```

Why: a skill is leveraged prompt-text — it steers every future session that loads it, so an
authoring mistake repeats until someone notices. Spending the reasoning once, at authoring time,
is the cheap side of that trade.

## Auto-engagement

The entry point is an auto-invoked skill named `skill-rigor`. Claude loads it whenever skill work
starts — "create a skill", "write a SKILL.md", "improve this skill's description", or any edit
that touches a `SKILL.md` or a `skills/` directory. It applies to authoring and editing skills,
not to merely running them. It is slash-available as `/skill-rigor:skill-rigor` if you want to
force it.

## Install

```sh
/plugin marketplace add lzlrd/marketplace
/plugin install skill-rigor@lzlrd
```

Restart the session. Check: the `skill-rigor` skill shows in the skills list and `/agents` lists
`skill-rigor:skill-rigor`.

## Degrades gracefully

Neither guidance skill is required: with `skill-creator` (Anthropic's, from the agent-skills
marketplace or `claude-plugins-official`) or `skill-development` (from `plugin-dev`) installed,
the cross-check uses them; with neither, Claude says so and applies best judgment rather than
inventing their contents. The bundled agent is a plain subagent — no agent teams, no extra setup.

## Structure

```
skill-rigor/
├── .claude-plugin/
│   └── plugin.json
├── agents/
│   └── skill-rigor.md        # effort: max, model: inherit
└── skills/skill-rigor/
    └── SKILL.md              # the two rules (loaded whenever skill work starts)
```
