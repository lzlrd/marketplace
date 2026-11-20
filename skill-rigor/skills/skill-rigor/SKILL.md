---
name: skill-rigor
description: >-
  The working standard whenever a Claude Code skill is being created or edited — the user asks to
  "create a skill", "write a SKILL.md", "add a skill to a plugin", "improve this skill", "fix the
  skill description", or any change touches a SKILL.md file or a skills/ directory, even if the
  word "skill" never appears. Do the work at maximum reasoning effort (spawning the bundled
  max-effort agent, which inherits the session's model, when the session runs lower) and
  cross-check the result against the skill-creator and skill-development skills when installed.
  Applies to authoring and editing skills, not to merely invoking or running them.
---

# Skill rigor

A skill is leveraged prompt-text: it steers every future session that loads it, so an authoring
mistake doesn't fail once — it repeats until someone notices. That asymmetry is why skill work
gets two standing rules that ordinary edits don't.

## 1. Work at maximum reasoning effort

The user sets the session's reasoning effort (`/effort`), and this skill leaves that setting alone.
Effort level Claude Code reports for this session: `${CLAUDE_EFFORT}`. If no level name shows
there, treat the level as unknown.

- **Session at `max`** (shown above, or the user ran `/effort max` this session), or **already
  running as the `skill-rigor:skill-rigor` agent**: do the skill work directly and do not spawn the
  agent: it would only repeat the same max-effort pass.
- **Otherwise (session below `max`, or level unknown)**: spawn the bundled
  **`skill-rigor:skill-rigor`** agent to do the authoring. Its definition pins `effort: max` and
  `model: inherit`, which asks for the session's model at maximum effort (an effort cap or
  `CLAUDE_CODE_EFFORT_LEVEL` can lower it). Spawn it without `effort` or `model` arguments, so the
  definition's pin applies. Hand it the complete job — the request verbatim, the target paths, and
  the conventions of the plugin or directory the skill lives in — then review what it produced
  before delivering. Mentioning `/effort max` to the user as the session-wide alternative is
  welcome; don't block on it.
- **The agent can't be spawned** (this session has no Agent tool, or the spawn returns an error):
  do the authoring directly, run the cross-check below yourself, and say in your report that the
  dedicated max-effort pass did not run, with the effort level the work ran at if it is known.

## 2. Cross-check before delivering

Two skills carry the authoritative authoring guidance, and a skill shipped without checking them
tends to ship with weak triggering or a bloated body:

- **`skill-creator`** — Anthropic's skill for creating, testing, and iterating on skills.
- **`skill-development`** — plugin-dev's guidance for plugin skills.

Either can be listed under a prefix (`anthropic-skills:skill-creator`,
`example-skills:skill-creator`, `plugin-dev:skill-development`), so match on the last part of the
name and invoke the skill by its full listed name; if several copies of one are listed, one is
enough. If either appears in the available-skills listing, invoke it with the Skill tool and
verify the work against its guidance — at minimum: valid frontmatter (`name` plus a description
that carries concrete trigger phrases), an imperative, lean body with depth pushed to
`references/`, and every referenced file actually existing. If neither is installed, say so
plainly and proceed on best judgment — never invent their contents. When the bundled agent did the
authoring, it runs this cross-check itself — review its report and spot-check, rather than
re-running the full pass.
