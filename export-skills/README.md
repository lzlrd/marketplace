# export-skills

An `/export-skills` skill for [Claude Code](https://github.com/anthropics/claude-code) that works out
which of your locally-installed skills can run in Claude Desktop / claude.ai, then packages the ones
that qualify into upload-ready zips.

Skills live in two places (the plugin cache and your personal `~/.claude/skills`), each with traps:
symlinks `find` will not follow, multiple cached versions, root-level `SKILL.md` files, marketplace
duplicates. The skill inventories both correctly, classifies each skill against what Desktop can
actually do, and curates clean zips with `SKILL.md` at every folder root and the repo noise dropped.

```
/export-skills            → lenient (default)
/export-skills --strict   → strict
```

Lenient counts Desktop's code-execution sandbox as available, which is how the built-in
`pdf`/`docx`/`xlsx` skills already work, so sandbox skills are included. Strict reads "no code
execution" literally and keeps only pure-prompt, artifact, and Desktop-MCP skills. Nothing else
differs between the two. There is no `--lenient` flag; lenient is the default.

## What you get

- A tiered report: ready as-is, needs the sandbox, needs a named Desktop MCP, works but
  output-limited, and the excluded set grouped by reason.
- Upload-ready zips under an output folder: one per plugin (each qualifying skill as its own
  `<skill>/SKILL.md` subfolder) and one per personal skill. On claude.ai, upload each skill folder
  individually.

## How it works

```
/export-skills [--strict]
        │  inventory (script) → classify (one sub-agent per skill) → package (script)
        ▼
   inventory ── plugin cache + personal skills, traps handled, Desktop MCP list read
   classify  ── three criteria: runs in Desktop · relevant to Desktop · MCP available
   mode      ── lenient counts the sandbox in; strict reads "no code execution" literally
   package   ── curate (SKILL.md + resource dirs, repo noise dropped), zip, verify
```

Two bundled scripts do the deterministic, trap-ridden parts (inventory and packaging); the model
supplies the per-skill judgment in between.

## Install

```sh
/plugin marketplace add lzlrd/marketplace
/plugin install export-skills@lzlrd
```

Restart the session. Check: the `export-skills` skill shows in the skills list, invokable as
`/export-skills`.

## Structure

```
export-skills/
├── .claude-plugin/
│   └── plugin.json
└── skills/export-skills/
    ├── SKILL.md              # the workflow: inventory → classify → mode → tier → package
    ├── references/
    │   └── process.md        # the full six-phase detail, criteria, curation lists, gotchas
    └── scripts/
        ├── inventory.py       # Phase 0: enumerate skills, resolve the traps, emit a work-list
        └── package.py         # Phase 6: curate and zip the qualifiers, verify each zip
```
