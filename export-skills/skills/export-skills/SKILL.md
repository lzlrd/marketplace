---
name: export-skills
description: Deduce which locally-installed Claude Code skills can run in Claude Desktop / claude.ai, then package the ones that qualify into upload-ready zips. Use this whenever the user wants to export, port, migrate, or move their Claude Code skills to Claude Desktop or claude.ai, asks which of their installed skills work in Desktop, wants upload-ready skill zips, or types /export-skills. Runs in lenient mode by default, which counts Desktop's code-execution sandbox as available the way the built-in pdf/docx/xlsx skills already do; pass --strict to exclude every sandbox / code-execution skill and keep only pure-prompt, artifact, and Desktop-MCP skills. There is no --lenient flag; lenient is the default.
---

# export-skills

Export the user's locally-installed Claude Code skills to Claude Desktop / claude.ai. Inventory every
skill, work out which ones actually run in Desktop, and package the qualifiers into upload-ready zips.
Nearly all the difficulty is in the edge cases, so two bundled scripts do the deterministic heavy
lifting (and encode the traps), while you supply the per-skill judgment.

## Modes: lenient (default) vs strict

Run **lenient** unless the invocation arguments contain `--strict`. There is no `--lenient` flag;
lenient is what you get with no argument.

The only thing the mode changes is how one criterion is read: does Desktop's **code-execution
sandbox** count as "available"?

- **Lenient (default):** yes. Desktop runs bundled scripts, `pip install`, and code over files the
  user uploads or the skill generates, in an ephemeral Linux container. That is exactly how the
  built-in `pdf`/`docx`/`xlsx`/`pptx` skills work, so a skill that runs a script *in the sandbox*
  qualifies. This is the accurate model of what Desktop can do.
- **Strict:** no. Read "no code execution" literally: exclude every sandbox / code-exec skill and
  keep only pure-prompt, artifact, and Desktop-MCP skills.

Everything else is identical between the two. A skill that needs the user's **real machine** (their
shell, repo, dev server, build) is excluded in *both* modes. That is the distinction that matters,
and it is not the same as the sandbox.

## Workflow

Read `references/process.md` first: it has the full six-phase detail, the three qualifying criteria,
the classifier schema, the curation keep/drop lists, and the gotchas. Then work these steps.

### 1. Inventory — `scripts/inventory.py`

```
python3 <skill-dir>/scripts/inventory.py > /tmp/skills-inventory.json
```

It enumerates plugin skills (from the plugin **cache**, latest version only, root-level `SKILL.md`
included, no marketplace duplicates), personal skills (resolving the `~/.claude/skills` symlinks that
`find` silently skips), marks which plugins are enabled, and emits the **Desktop MCP server list**
read from the user's `claude_desktop_config.json`. That MCP list is the whole basis for criterion 3,
and it is per-user, so never assume it.

### 2. Classify — cluster first, then fan out only the ambiguous ones

Don't blindly spawn one sub-agent per skill — a real install is dozens (often 80+), and most are
obvious. Classify inline the ones you can decide from `SKILL.md` alone: pure-prompt/artifact skills
clearly run in Desktop; skills whose only tools are Claude-Code-dev tooling (plugin-dev, hooks,
settings) clearly don't. Then **cluster the rest by shared dependency** — group skills that need the
same MCP or the same local-shell capability — and classify each cluster once (the
**identical dependency ⇒ identical verdict** rule in Normalize makes this sound). Only fan out
sub-agents for the genuinely borderline skills that survive that pass, and **cap concurrency**
(≈8 at a time) so a large install doesn't spawn a hundred agents. Each sub-agent gets its `SKILL.md`
path and the Desktop MCP list, and returns the structured verdict from `references/process.md`
(verdict, category, requires_local_shell, cc_only_tools, mcp_needed, what_it_does, reason). A skill
qualifies only if all three criteria hold: it runs in Desktop, it is relevant to Desktop, and any
MCP it needs is in the Desktop list (or it degrades gracefully without it).

### 3. Normalize — your judgment

Reviewer verdicts drift; make them consistent. Re-derive MCP availability yourself: normalize each
name and set-difference it against the Desktop list (aliases such as `offload`→`offshore`,
tool-prefix→server). Apply the rule **identical dependency ⇒ identical verdict**. Read the borderline
`SKILL.md` files yourself before overriding a verdict. Never drop a skill silently because a reviewer
failed or was rate-limited; classify it from a sibling with the same dependency, or read it directly.

### 4. Apply the mode

Fork on lenient vs strict exactly as described above: sandbox skills are IN under lenient and OUT
under strict. Nothing else moves between the two.

### 5. Tier the qualifiers

Group them for the report: **A** ready as-is (pure prompt / guidance / artifact), **B** needs the
sandbox (lenient only), **C** needs a named Desktop MCP (confirm it is in *their* config), **D** works
but output-limited (e.g. an image-direction skill when Desktop has no image generation). Group the
**excluded** by reason: CC dev/config tooling, needs the local shell/project, needs a missing MCP.

### 6. Package — `scripts/package.py`

Write a qualifiers manifest, then run the packager:

```
python3 <skill-dir>/scripts/package.py --manifest qualifiers.json --mode <lenient|strict> --out ./skills-export
```

Manifest shape:

```json
{"mode": "lenient",
 "skills": [{"kind": "plugin", "plugin": "taste-skill", "name": "brandkit", "skill_dir": "/abs/path"},
            {"kind": "personal", "plugin": null, "name": "deep-research", "skill_dir": "/abs/path"}]}
```

It curates each skill (SKILL.md plus resource dirs; repo noise like `.git`, `tests`, `node_modules`,
`.claude-plugin` dropped) and writes **one zip per skill** (`<skill>/SKILL.md` at the root; plugin
skills get a `<plugin>-<skill>.zip` filename so same-named skills from different plugins do not
collide). It verifies every zip: SKILL.md at the root, the biggest members listed so un-curated bloat
stands out, credential-ish names flagged, and the **200-file upload limit** enforced (a skill over
the limit is flagged to trim, since a single skill cannot be split across uploads).

### 7. Report

Give the user the tiered report, the path to the zips, and how to upload: on claude.ai, upload each
per-skill zip on its own. The SKILL.md-at-root invariant is what makes that work.

## Notes

- The two scripts own Phases 0 and 6 (the trap-ridden, deterministic parts) so they run the same way
  every time. You own Phases 1 to 5, which are judgment.
- Built-in Claude Code skills (`verify`, `run`, `code-review`, `init`, `simplify`, …) have no file on
  disk and are not exportable; the inventory will not list them, and that is correct.
- Keep the two scripts' keep/drop lists aligned if you edit them; `inventory.py` reports resource
  dirs and `package.py` ships them.
