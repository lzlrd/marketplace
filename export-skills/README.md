# export-skills

An `/export-skills` skill for [Claude Code](https://github.com/anthropics/claude-code) that works out
which of your locally-installed skills can run in Claude Desktop / claude.ai, then packages the ones
that qualify into upload-ready zips.

Skills live in the plugin cache and in your personal `~/.claude/skills` and `~/.agents/skills`
(`CLAUDE_CONFIG_DIR` stands in for `~/.claude` when set), each with traps: symlinks `find` will not follow, multiple cached versions, root-level `SKILL.md` files,
marketplace duplicates. The skill inventories them, classifies each skill against what Desktop can
actually do, and curates one zip per skill with `SKILL.md` at the skill folder's root and the repo
noise dropped. A skill that claude.ai would reject on upload gets no zip and is reported with the
reason.

```
/export-skills            → lenient (default)
/export-skills --strict   → strict
```

Lenient counts Desktop's code-execution sandbox as available, which is how the built-in
`pdf`/`docx`/`xlsx` skills already work, so sandbox skills are included. Strict leaves out every
skill that runs code in the sandbox and keeps only pure-prompt, artifact, and Desktop-MCP skills.
Nothing else differs between the two. There is no `--lenient` flag; lenient is the default. In either
mode, claude.ai offers custom skills only with code execution enabled.

## What You Get

- A tiered report: ready as-is, runs code in the sandbox, needs a named MCP server or connector,
  works but output-limited, and the excluded set grouped by reason.
- Upload-ready zips under an output folder: one per skill (plugin skills named
  `<repo>-<plugin>-<skill>.zip`, personal skills `<skill>.zip`), each holding one `<skill>/` folder
  with `SKILL.md` at its root. Upload each zip on its own.
- For each skill that breaks a claude.ai upload rule, the reason and no zip. The packager does not
  rewrite a skill or drop files to make it fit.

## Upload Rules

The packager checks these before it writes a zip:

- `name`: lowercase letters, digits and hyphens, at most 64 characters, not starting or ending
  with a hyphen or with two in a row, without `claude` or `anthropic`, and the same as the folder
  in the zip.
- `description`: at most 1,024 characters, no angle brackets.
- `compatibility`: at most 500 characters.
- Frontmatter keys: only `name`, `description`, `license`, `allowed-tools`, `metadata` and
  `compatibility`.
- Frontmatter YAML can read: no unquoted value with `: ` in it or starting with a YAML indicator
  such as `*` or `@`.
- At most 200 files. Anthropic's pages give no file count; this figure is the plugin's own.

Claude Code skills often carry keys claude.ai does not accept, such as `argument-hint`, `model` or
`disable-model-invocation`, so expect some to be reported. To export one, correct a copy and
package the copy. The installed skill stays as it is.

## How It Works

```
/export-skills [--strict]
        │  inventory (script) → classify (inline + clustered, sub-agents only for edge cases) → package (script)
        ▼
   inventory ── installed plugin versions + personal skills, traps handled, Desktop MCP list read
   classify  ── three criteria: runs in Desktop · relevant to Desktop · MCP available
   mode      ── lenient counts the sandbox in; strict leaves out skills that run code in it
   package   ── check the upload rules, curate (SKILL.md + resource dirs, repo noise dropped), one zip per skill, verify
```

Two bundled scripts do the deterministic, trap-ridden parts (inventory and packaging); the model
supplies the per-skill judgement in between.

## What the Packager Leaves Out

Each zip holds `SKILL.md`, the resource directories on the keep list, any other directory that
`SKILL.md` or a shipped Markdown file points into, and the root files `SKILL.md` names. A path that
starts outside the skill, such as `~/.claude/settings.json`, points into nothing. A dot directory
(`.claude`, `.aws`, `.ssh` and the like) or a `secrets` or `credentials` folder never ships, at any
depth, mentioned or not. Nor do credential files (`.env`, private keys, OAuth tokens, `.npmrc` and
the like), or a symlink that leads to one of those files or folders, whatever the link is called.
A symlink ships only when it leads somewhere inside the skill's own folder; one that leads out,
even to a shared folder elsewhere in its plugin, is left out, so a link cannot pull in a file such
as a token under `~/.config`.
Everything left out is listed per skill, so a missing directory shows in the output.

The output folder keeps an index of the zips the packager writes, recorded before each is written.
The next run removes those and no others, so a skill that stopped qualifying leaves no stale zip.
Any other zip is left alone and listed. If it has the name of a zip the run would write, that skill
is not packaged, unless the zip holds only that skill's folder with `SKILL.md` at its root. That is
an export from a version of the packager that kept no index, or from a run whose index was lost,
so it is replaced and the listing says so.

## Limits

The scripts do not check the following. The skill has the model cover some by reading and flag the
rest in its report.

- `enabledPlugins` in managed settings, a `--settings` file or an `--add-dir` directory. The user,
  project and local settings files are read.
- The project a project or local plugin install belongs to is taken from a field of
  `installed_plugins.json` that Anthropic does not document.
- Frontmatter YAML errors beyond the common ones.
- claude.ai connectors, and whether a Desktop extension is turned on. `claude_desktop_config.json`
  and the list of installed extensions are read.
- Claude Code features in a skill's body, such as `$ARGUMENTS`.
- A directory the skill mentions without a path, and what the shipped files contain. Credential
  files are recognised by name only.
- The size of a zip. claude.ai publishes no figure for its upload limit (the Skills API's is 30 MB
  uncompressed). The listing gives each size.

These are the rules Anthropic's own skill validator applies, which the Claude Code docs say
claude.ai uploads share; claude.com's "Create custom skills" page gives the same description
limit. The claude.ai Help Center disagrees on two points: it gives a
200-character description limit and lists a `dependencies` key. The packager refuses a description
over 1,024 characters, marks one over 200 with a `?` note and still zips it, and refuses
`dependencies`. One constant in `skill_rules.py` (`MAX_DESCRIPTION`) moves the refusal to 200.

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
├── skills/export-skills/
│   ├── SKILL.md              # the workflow: inventory → classify → mode → tier → package
│   ├── references/
│   │   └── process.md        # Phases 0 to 6 in detail: criteria, upload rules, curation lists, what the scripts do not check
│   └── scripts/
│       ├── inventory.py       # Phase 0: enumerate skills, resolve the traps, emit a work-list
│       ├── package.py         # Phase 6: check, curate and zip the qualifiers, verify each zip
│       └── skill_rules.py     # frontmatter reader and the upload rules, shared by both scripts
└── tst/                      # unittest suite; fixtures.py builds the fake homes and plugin caches
```

## Tests

```sh
python3 -B -m unittest discover -s export-skills/tst
```

Run it from the repository root. The tests use the standard library only and run both scripts
against a throwaway home directory with `CLAUDE_CONFIG_DIR` cleared, never the real `~/.claude`.

For maintainers: `RESOURCE_DIRS` in `inventory.py`, `KEEP_DIRS` in `package.py` and the KEEP list in
`references/process.md` must stay the same set, as must `DROP_DIRS` and the DROP list. A test checks
both.
