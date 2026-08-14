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

Classify inline what `SKILL.md` alone decides, cluster the rest by shared dependency, and delegate
only the genuinely borderline skills to sub-agents (cap ≈8 concurrent) — the classifier schema,
inputs, and qualifying criteria are in `references/process.md` Phase 2. Dispatch the borderline
batch and keep working while it runs — normalize the inline verdicts and re-derive MCP availability
in the meantime rather than blocking on each sub-agent's return.

### 3. Normalize — your judgment

Normalize the verdicts yourself: re-derive MCP availability against the Desktop list, apply
**identical dependency ⇒ identical verdict**, and never drop a skill silently (Phase 3).

### 4. Apply the mode

Fork on lenient vs strict exactly as described above: sandbox skills are IN under lenient and OUT
under strict. Nothing else moves between the two.

### 5. Tier the qualifiers

Tier the qualifiers **A–D** and group the excluded by reason (Phase 5).

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

It curates each skill, writes **one zip per skill** with `SKILL.md` at the root, and verifies every
zip — the keep/drop lists, naming rules, and the 200-file upload limit are in Phase 6.

### 7. Report

Give the user the tiered report, the path to the zips, and how to upload: on claude.ai, upload each
per-skill zip on its own. The SKILL.md-at-root invariant is what makes that work. Keep the report
compact: one line per skill within each tier (name — reason/needed MCP), a one-line count per tier,
and no restatement of the criteria, modes, or process. Every count and verdict must trace to this
session's output — inventory.py's totals, the classifier verdicts, package.py's verify listing; if
a skill's status wasn't actually determined, say so rather than filling it in.

## Notes

- Keep the two scripts' keep/drop lists aligned if you edit them; `inventory.py` reports resource
  dirs and `package.py` ships them.
