---
name: export-skills
description: Deduce which locally-installed Claude Code skills can run in Claude Desktop / claude.ai, then package the ones that qualify into upload-ready zips. Use this whenever the user wants to export, port, migrate, or move their Claude Code skills to Claude Desktop or claude.ai, asks which of their installed skills work in Desktop, wants upload-ready skill zips, or types /export-skills. Runs in lenient mode by default, which counts Desktop's code-execution sandbox as available the way the built-in pdf/docx/xlsx skills already do; pass --strict to exclude every sandbox / code-execution skill and keep only pure-prompt, artifact, and Desktop-MCP skills.
---

# export-skills

Export the user's locally-installed Claude Code skills to Claude Desktop / claude.ai. Inventory every
skill, work out which ones actually run in Desktop, and package the qualifiers into upload-ready zips.
Nearly all the difficulty is in the edge cases, so two bundled scripts do the deterministic heavy
lifting (and encode the traps), while you supply the per-skill judgment. What the scripts cannot
check is listed with each script in `references/process.md`, and covering it is part of the
judgment.

## Modes: lenient (default) vs strict

Run **lenient** unless the invocation arguments contain `--strict`. There is no `--lenient` flag;
lenient is what you get with no argument.

The only thing the mode changes is how one criterion is read: does Desktop's **code-execution
sandbox** count as "available"?

- **Lenient (default):** yes. Desktop runs bundled scripts, `pip install`, and code over files the
  user uploads or the skill generates, in an ephemeral Linux container. That is exactly how the
  built-in `pdf`/`docx`/`xlsx`/`pptx` skills work, so a skill that runs a script *in the sandbox*
  qualifies. This is the accurate model of what Desktop can do.
- **Strict:** no. Exclude every sandbox / code-exec skill and keep only pure-prompt, artifact, and
  Desktop-MCP skills.

Everything else is identical between the two. A skill that needs the user's **real machine** (their
shell, repo, dev server, build) is excluded in *both* modes. That is the distinction that matters,
and it is not the same as the sandbox.

## Workflow

Read `references/process.md` first: it has the detail for Phases 0 to 6, the three qualifying
criteria, the classifier schema, claude.ai's upload rules, and the curation keep/drop lists. Then
work these steps.

### 1. Inventory — `scripts/inventory.py`

Make a private work folder with `mktemp -d` and write the inventory into it, never to a fixed name
in a shared folder such as `/tmp`, where another account can plant a file or symlink:

```
mktemp -d
python3 <skill-dir>/scripts/inventory.py > <work-dir>/skills-inventory.json
```

`<work-dir>` is the path `mktemp -d` printed. Shell variables do not carry over from one command
to the next, so write the path out in full each time.

It emits one record per plugin skill (the **installed** version of each plugin, and only the skills
that plugin loads) and per personal skill (symlinks resolved). It takes the skills of plugins that
are not enabled off the list and names them in `skipped_disabled`, leaves out plugins installed
only for other projects (`skipped_other_projects`), names installs whose directory is gone
(`missing_install_paths`), marks each record with the
claude.ai upload rules it breaks (`upload_issues`), and reads the **Desktop MCP server list** from
the user's `claude_desktop_config.json` along with the installed Desktop extensions. A one-line
summary goes to stderr. Phase 0 says what the output holds.

### 2. Classify — cluster first, then fan out only the ambiguous ones

Classify inline what `SKILL.md` alone decides, cluster the rest by shared dependency, and delegate
only the genuinely borderline skills to sub-agents (cap ≈8 concurrent) — the qualifying criteria are
in `references/process.md` Phase 1, the classifier schema and inputs in Phase 2. Dispatch the
borderline batch and keep working while it runs — normalize the inline verdicts and re-derive MCP
availability in the meantime rather than blocking on each sub-agent's return.

### 3. Normalize — your judgment

Normalize the verdicts yourself: re-derive MCP availability under criterion 3, apply
**identical dependency ⇒ identical verdict**, and never drop a skill silently (Phase 3).

### 4. Apply the mode

Under `--strict`, move the sandbox skills to the excluded set. Under lenient they stay in (Phase 4).

### 5. Tier the qualifiers

Tier the qualifiers **A–D** and group the excluded by reason (Phase 5).

### 6. Package — `scripts/package.py`

Write a qualifiers manifest, one unchanged work-list record per qualifier, then run the packager:

```
python3 <skill-dir>/scripts/package.py --manifest qualifiers.json --mode <lenient|strict> --out ./skills-export
```

Manifest shape:

```json
{"mode": "lenient",
 "skills": [{"kind": "plugin", "repo": "some-marketplace", "plugin": "taste-skill", "name": "brandkit", "skill_dir": "/abs/path"},
            {"kind": "personal", "repo": null, "plugin": null, "name": "deep-research", "skill_dir": "/abs/path"}]}
```

It curates each skill, writes **one zip per skill** holding a single `<name>/` folder with
`SKILL.md` at that folder's root, and prints a verify listing. A skill that breaks one of claude.ai's
upload rules gets no zip: the listing gives the reason and the exit code is 1, with the other skills
still packaged. Report such a skill with its reason. Do not rewrite it to get it through unless the
user asks. Phase 6 has the upload rules, the keep/drop lists, the naming rules, and how the output
folder is kept free of stale zips.

### 7. Report

Give the user the tiered report, the path to the zips, and how to upload: on claude.ai, with code
execution enabled, upload each per-skill zip on its own. Keep the report compact: one line per skill
within each tier (name — reason/needed MCP), a one-line count per tier, and no restatement of the
criteria, modes, or process. Every count and verdict must trace to this session's output —
inventory.py's totals, the classifier verdicts, package.py's verify listing; if a skill's status
wasn't actually determined, say so rather than filling it in. Carry over what the scripts flagged:
each skill the packager refused with its reasons, each `?` note on a packaged skill (a description
the claude.ai Help Center would call too long), each `credential-ish member` line with whether the
file looks like a real secret or a false positive, a left-out directory or file that the skill uses,
a Desktop config that was missing or unreadable, the skills in `skipped_disabled`, the plugins in
`skipped_other_projects`, and the installs in `missing_install_paths`. Where one of
the unchecked items in `references/process.md` applied to this run, put it on that skill's line, or
in a short closing note with one line per item, because the scripts' output does not say so.
