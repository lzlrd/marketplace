# Exporting Claude Code Skills to Claude Desktop — the full process

Deduce which locally-installed Claude Code skills can run in **Claude Desktop / claude.ai**, then
package them as upload-ready zips. Two output modes: **Lenient** (default) and **Strict**.

Phases 0 and 6 are deterministic and trap-ridden, so they are bundled as scripts (`scripts/inventory.py`
and `scripts/package.py`). Phases 1 to 5 are model judgment. `SKILL.md` is the short orchestration
entry; this file is the detail. Each script phase ends with what its script does not check.

---

## Phase 0 — Inventory every skill (`scripts/inventory.py`)

`inventory.py` emits the work-list as JSON. Read its output rather than enumerating by hand: `find`
does not follow the symlinks that personal skills often are, and `~/.claude/plugins/marketplaces/`
is the catalog source, full of plugins that were never installed.

What it reads (when `CLAUDE_CONFIG_DIR` is set, it stands in for `~/.claude` below, as it does for
Claude Code):

1. **Plugin skills** — the version of each plugin that
   `~/.claude/plugins/installed_plugins.json` records as installed, normally
   `~/.claude/plugins/cache/<repo>/<plugin>/<version>/` (`CLAUDE_CODE_PLUGIN_CACHE_DIR` moves the
   `plugins` folder on its own). A cache holds **multiple versions per plugin** (e.g. `4man/0.3.2` … `0.5.1`,
   or hash dirs like `26db21ae4fa1` and `unknown`); Claude Code marks the replaced ones with an
   `.orphaned_at` file. When `installed_plugins.json` is absent or unreadable, the script takes
   each cached plugin's most recently modified version directory that has no marker, and says so
   with `installed_plugins_known: false`. A file that records no installs means nothing is
   installed. An install at project or local scope counts only when the script runs in its
   `projectPath` or a folder inside it. An install whose directory is gone is named, not replaced
   by another cached version. Within the version it lists the skills the plugin loads:
   `skills/<name>/SKILL.md`, the paths under a `skills` key in the plugin's `plugin.json` or
   marketplace entry, and a `SKILL.md` at the plugin root (e.g. `humanizer`) when the plugin has
   neither a `skills/` directory nor a `skills` key (a folder below the root is no skill then). A
   marketplace entry that covers a whole shared repository and lists its `skills` (Anthropic's
   `example-skills`) yields only the listed ones.
2. **Personal skills** — each entry of `~/.claude/skills/` and of `~/.agents/skills/`, with symlinks
   resolved, so a skill linked from one root into the other is counted once.
3. **Enabled plugins** — `enabledPlugins` in `~/.claude/settings.json`, then in `.claude/settings.json`
   and `.claude/settings.local.json` of the directory the script runs in, a later file overriding an
   earlier one. Plugins are matched as `<plugin>@<repo>`. A plugin no file names is enabled unless
   its marketplace entry or its `plugin.json` sets `defaultEnabled` to false (the entry wins). The
   skills of a plugin that is not enabled come off the work-list and are named in
   `skipped_disabled`.
4. **The target's MCP config** — `mcpServers` in Claude Desktop's `claude_desktop_config.json`, at
   `~/Library/Application Support/Claude/` (macOS), `%APPDATA%\Claude\` (Windows), or
   `~/.config/Claude/` (Linux and others), plus the Desktop extensions recorded beside it in
   `extensions-installations.json`. Both lists are **per-user**, so never assume them; criterion 3
   says how to read them.

**Built-in Claude Code skills** (`verify`, `run`, `code-review`, `deep-research`, `init`,
`simplify`, …) have **no file on disk**. They are CC-native, out of scope, and not zippable. Do not
chase them.

Output, top level:

- `skills` — the work-list, one record per skill.
- `skipped_disabled` — `{repo, plugin, name}` for each skill left out because its plugin is disabled.
- `skipped_other_projects` — `{repo, plugin, scope, project}` for each install of a plugin that is
  installed only at project or local scope for other projects. Its skills are not listed.
- `missing_install_paths` — `{repo, plugin, path}` for each install record whose directory is gone.
  Claude Code cannot load that plugin either; say so in the report.
- `enabled_plugins_known` — false when no settings file sets `enabledPlugins`. Nothing was filtered
  then, and every plugin record's `enabled` is null.
- `installed_plugins_known` — false when `installed_plugins.json` is absent or unreadable and the
  versions came from the fallback above.
- `plugin_cache_found` — false when there is no plugin cache at all. Say so in the report instead of
  reporting an install with no plugin skills.
- `desktop_mcp_servers`, `desktop_extensions` (`{id, name}` each), `desktop_config_found`, and
  `desktop_config_error`, which holds the parse error when the config file exists but cannot be read.

Each record: `{kind, repo, plugin, plugin_version, name, dir_name, skill_md, skill_dir,
resource_dirs, other_dirs, root_files, upload_issues, enabled}`.

- `name` is the frontmatter `name`, the one Claude Code shows, and `dir_name` the directory (or
  symlink, or plugin) the skill sits in. Where the frontmatter has no `name`, both are the same.
- `resource_dirs` are the root directories the packager ships whole, `other_dirs` the rest, and
  `root_files` the loose files beside `SKILL.md`. Phase 6 says which of those ship.
- `upload_issues` lists the claude.ai upload rules the frontmatter breaks, one sentence each, and is
  empty when it breaks none. Phase 6 has the rules.

A one-line summary goes to stderr.

**Not checked by `inventory.py`**

- **Other places a plugin can be enabled.** Managed settings, a `--settings` file, and an
  `--add-dir` directory are not read, and the project and local files are read only from the
  directory the script runs in. A plugin in `skipped_disabled` that this session's skill list shows
  as loaded is enabled somewhere the script cannot see: put its skills back on the work-list.
- **Plugin dependencies.** A plugin that an enabled plugin depends on starts enabled whatever its
  `defaultEnabled` says. The script does not follow `dependencies`, so such a plugin can land in
  `skipped_disabled` while it loads: the same check against this session's skill list applies.
- **Install scopes.** Which project a project- or local-scope install belongs to comes from its
  `projectPath`, a field the vendor docs do not describe. A record without one counts as installed
  here. A plugin installed at two scopes in two versions yields a record per version: keep the one
  this session loads.
- **Whether a Desktop extension is turned on,** and anything about claude.ai connectors, which are
  not on disk. `extensions-installations.json` is an internal file of the Desktop app, so an empty
  `desktop_extensions` does not prove there are none.
- **The skill's body.** Claude Code-only features in it (`$ARGUMENTS`, `` !`command` `` injection,
  `${CLAUDE_PLUGIN_ROOT}`) do not work on claude.ai, and nothing flags them. That is part of
  criterion 1.

---

## Phase 1 — The three criteria

A skill **qualifies** iff ALL hold:

1. **Runs in Desktop** — no dependence on the user's *local* shell or Claude Code-only tooling.
   - The crux distinction: Desktop has a **code-execution sandbox** (ephemeral Linux container; runs
     bundled scripts, `pip install`, over files the user *uploads* or the skill *generates*). That is
     exactly how the built-in `pdf`/`docx`/`xlsx`/`pptx` skills work. Running a script **in the
     sandbox is allowed**. Needing the user's **real machine** (their filesystem, git repo, dev
     server, build) is **not**.
2. **Relevant to Desktop** — not a Claude Code developer/config workflow tool: plugin authoring,
   CLAUDE.md editing, settings/permissions/keybinding tuning, CLI/IDE-only commands, LSP, dev-loop
   review/verify/commit tooling.
3. **MCP available** — every MCP server the skill needs is reachable from Desktop, or the skill
   degrades gracefully without it. `desktop_mcp_servers` holds the servers in the Desktop config
   file and `desktop_extensions` the extensions installed in the Desktop app, which is all the
   script can see:
   - A server in either list is available in the Desktop app. Match an extension by its `name`.
   - A tool prefix `mcp__claude_ai_<Name>__` is a claude.ai account connector. It is never in the
     lists and it is not missing: count it as available, Tier C, "connect `<Name>` on claude.ai".
   - Any other server that is in neither list counts as missing. Connectors are invisible to the
     script, though, and the extension list is best-effort, so name the server in the report and
     say the skill works if the user has it as one of those.
   - `desktop_config_found: false` means the config file is absent, or present but unreadable (a
     trailing comma is enough; `desktop_config_error` then holds the parse error). The server list
     is unknown rather than empty. Do not exclude for a missing MCP then. Put the MCP-dependent
     skills in Tier C with the server named, and say in the report that the Desktop config was not
     found or could not be read, with the error.

---

## Phase 2 — Classify each skill (cluster first, delegate only what's left)

**Do not fan out one sub-agent per skill.** A real install is dozens, often 80+, and most are
decidable from `SKILL.md` alone: pure-prompt and artifact skills clearly run in Desktop, skills whose
only tools are Claude-Code dev tooling clearly don't. Classify those inline. Then **cluster the
remainder by shared dependency** — same MCP, same local-shell capability — and classify each cluster
once, which the **identical dependency ⇒ identical verdict** rule in Phase 3 makes sound.

Only the genuinely borderline skills that survive that pass get a sub-agent, and **cap concurrency at
about 8**. Each sub-agent reads its SKILL.md (and peeks at `scripts/` or resources if how it operates
is unclear), is handed the Desktop MCP and extension lists, `desktop_config_found`, and criterion 3,
and returns:

```
verdict:               OK | CAVEAT | NO
category:              prompt | artifact | sandbox | mcp-desktop |
                       mcp-missing | claude-code | cc-workflow | mixed
requires_local_shell:  bool          # the user's REAL shell, not the sandbox
cc_only_tools:         [string]      # Agent/Task, Workflow, hooks, settings.json, EnterPlanMode, LSP…
mcp_needed:            [server names] # map tool prefixes: mcp__notebooklm__ -> "notebooklm"
mcp_all_in_desktop:    bool
what_it_does:          string (<=15 words)
reason:                string (<=25 words)
```

In `mcp_needed`, a claude.ai connector keeps its `claude_ai_` prefix (`mcp__claude_ai_Indeed__` →
`claude_ai_Indeed`), because criterion 3 goes by it.

---

## Phase 3 — Normalize (the orchestrator judgment layer)

Reviewer verdicts drift; make them consistent with the code and your own eyes:

- **Re-derive MCP availability yourself.** Do not trust the reviewer's bool. Normalize each
  `mcp_needed` name, set-difference against `desktop_mcp_servers` and `desktop_extensions`, and apply
  criterion 3 to the names left over. (Aliases: `offload`→`offshore`; tool-prefix→server.)
- **Rule: identical dependency ⇒ identical verdict.** If two skills fail or pass for the same reason,
  they get the same verdict. (This catches e.g. `imagegen-web` vs `imagegen-mobile` sharing the "no
  image generation on Desktop" limit → both CAVEAT.)
- **Read the borderline SKILL.md files yourself** before overriding. (Confirm cases like a
  `web-artifacts-builder` whose bash runs *in-sandbox*: it is a claude.ai artifacts skill, so it
  qualifies rather than being disqualified.)
- **Handle failed or rate-limited reviewers** by classifying from a sibling skill or a direct read.
  Never drop a skill silently.
- **Skills claude.ai already ships.** `pdf`, `docx`, `xlsx`, and `pptx` are built into claude.ai. A
  work-list skill with one of those names duplicates the built-in, so report it as already there and
  package it only when it is the user's own variant.
- **Upload rules are not a criterion.** A record with `upload_issues` can still qualify: whether a
  skill runs in Desktop and whether claude.ai accepts its zip are separate questions. Classify it as
  any other skill. Phase 6 deals with the upload.

---

## Phase 4 — Strict vs Lenient (this is the whole fork)

The **only** difference between modes is how criterion 1's "no local shell" is read:

| | Lenient (default) | Strict |
|---|---|---|
| Sandbox code-exec (`canvas-design`, `slack-gif-creator`, `algorithmic-art`, `web-artifacts-builder`) | **Included** — it is how Desktop's own skills work | **Excluded** — "no shell" read literally |
| Pure prompt / artifact / Desktop-MCP / limited-output skills | Included | Included (identical) |
| Needs the *user's real* machine / repo / dev server | Excluded | Excluded (identical) |

Lenient is the accurate model of Desktop's actual capability. Strict leaves out every skill that
itself runs code. It narrows what is exported, not what claude.ai requires: custom skills there are
available only with code execution enabled, whichever mode produced the zip.

---

## Phase 5 — Tier the qualifiers (for the human-readable report)

- **A — Ready as-is:** pure prompt / guidance / artifact. Upload and go.
- **B — Runs code in the sandbox** (bundled scripts, package installs). (Lenient-only.)
- **C — Needs an MCP server or connector** — name it and say where it comes from: a server in *their*
  Desktop config or installed as a Desktop extension works in the Desktop app only, a claude.ai
  connector works on every surface once connected. Note partial loss (e.g. a job board whose MCP is
  not present).
- **D — Works but output-limited** — e.g. image-*direction* skills when Desktop has no image
  generation; solve-but-cannot-render.
- **Not packaged:** a qualifier `package.py` refused, under its tier, with every reason from the
  packager's listing (Phase 6). It is not ready, so do not count it as such.
- **Excluded:** group by reason — CC dev/config tooling · needs local shell/project · needs a missing
  MCP · already built into claude.ai · plugin disabled (the skills in `skipped_disabled`, by name)
  · installed only for another project (`skipped_other_projects`, by plugin).

---

## Phase 6 — Package into upload-ready zips (`scripts/package.py`)

`package.py` reads the qualifiers manifest and does the layout, checks, curation, and verification
below. It writes a zip only for a skill that passes every check, and it never edits a skill.

**Manifest** — `{"mode": ..., "skills": [...]}` with one entry per qualifier: its work-list record,
unchanged. The packager reads `kind`, `repo`, `plugin`, `name`, and `skill_dir` and ignores the rest.
Put every qualifier in, including those with `upload_issues`: the packager is what decides, it adds
the checks only it can make, and its listing is what the report cites.

**Layout scheme**
- **One zip per skill** — every qualifying skill, plugin or personal, gets its own zip. claude.ai
  uploads a single skill at a time, so a per-plugin bundle is the wrong shape.
- Zip filename: personal skills use `<name>.zip`; plugin skills use `<repo>-<plugin>-<name>.zip`, so
  same-named skills from two plugins or two marketplaces do not collide on disk. A part the entry
  lacks is skipped.
- **Invariant:** each zip holds one `<name>/` folder with `SKILL.md` at that folder's root. claude.ai
  wants the skill folder as the zip's root, not loose files, and wants the folder named as the
  frontmatter `name`. The folder is the entry's `name`, which is why the work-list carries the
  frontmatter name there.
- **Output folder:** the packager keeps an index of the zips it writes (`.export-skills-index.json`
  in `--out`, recorded before each zip is written) and removes exactly those at the start of the
  next run into the same folder, so a skill that no longer qualifies leaves no stale zip. A zip it
  did not write is left alone and listed as not written by this run. Do not tell the user to upload
  one of those. When such a zip has the name this run would give a skill, that skill is refused
  rather than the zip overwritten, unless the zip holds only that skill's `<name>/` folder with
  `SKILL.md` at its root. That is an export from a packager version that kept no index, or from a
  run whose index was lost, so it is replaced and the listing says so. A folder whose index cannot
  be written is an unusable `--out`.

**Upload rules** — claude.ai rejects a skill that breaks any of these. The packager checks each
one, and for a skill that breaks one it prints the reason, writes no zip, and exits non-zero while
still packaging the rest:
- `name`: present; lowercase letters, digits, and hyphens only; not starting or ending with a
  hyphen and without `--`; at most 64 characters; without `anthropic` or `claude`; equal to the
  folder in the zip, so an entry whose `name` is not the frontmatter `name` is refused.
- `description`: present; at most 1,024 characters; no `<` or `>`.
- `compatibility`: at most 500 characters.
- Frontmatter keys: only `name`, `description`, `license`, `allowed-tools`, `metadata`, and
  `compatibility`.
- Frontmatter YAML can read: an unquoted value may not have `: ` in it on any of its lines, or
  start with `*`, `@`, `` ` ``, `%`, `,`, `]`, `}`, a `!tag`, or a lone `-`, `?`, or `&`. Quoting
  the value fixes it.
- At most 200 files (the plugin's own figure; Anthropic's pages give no file count). For a skill
  over the limit the listing gives the file count and size of each top-level directory.

Two entries that pass every other check and would get the same zip filename are both refused as
well, since one would overwrite the other. Package one of them in a second run with its own
`--out` folder.

A refused skill is reported, not repaired. Give its reasons in the report and do not rewrite a
skill to get it through unless the user asks: a shorter description changes when the skill
triggers, and removing keys such as `hooks`, `model`, `argument-hint`, or
`disable-model-invocation` changes what it does. When the user does want it corrected, copy the
skill to a scratch directory, correct or trim the copy, point the entry's `skill_dir` (and `name`,
after a rename) at the copy, and say in the report what was changed. The installed skill under
`~/.claude/plugins/cache` is the user's live plugin, so leave it as it is. A single skill cannot be
split across uploads.

These are the checks in Anthropic's own validator (`quick_validate.py` in anthropics/skills), which
the Claude Code docs say claude.ai uploads share, and claude.com's "Create custom skills" page
gives the same description limit; the reserved words come from the platform docs. The claude.ai
Help Center disagrees on two points: it gives a 200-character description limit and
lists a `dependencies` key. So a packaged skill whose description is over 200 characters gets a
`? description is N characters` line and still has its zip; repeat that line in the report, and
if the user's upload is refused for it, shorten a copy as described above.

**Curation** — the zip gets `SKILL.md` plus:
- **KEEP** dirs at the skill root, shipped whole: `references`, `reference`, `scripts`, `templates`,
  `assets`, `examples`, `themes`, `core`, `style-prompts`, `canvas-fonts`, `docs`, `evals`.
- **DROP** names, left out at the skill root and at any depth inside a kept dir: `.github`, `tests`,
  `src`, `node_modules`, `.git`, `dist`, `build`, `desktop-extension`, `.in_use`, `.claude-plugin`,
  `eval-viewer`, `agents`, `__pycache__`, `.venv`, `venv`, `.pytest_cache`, `.mypy_cache`,
  `.ruff_cache`.
- Every other directory at the skill root is left out as well.
- A left-out directory ships after all when `SKILL.md` or a shipped Markdown file mentions a path
  inside it (`agents/grader.md`, `scripts/tests/`), written from the skill root (bare, after `./`,
  or after `${CLAUDE_SKILL_DIR}/`) or relative to the file that mentions it (`../data/`). A name
  that goes on from another path, as in `~/.claude/settings.json` or `/tmp/build/out`, is outside
  the skill and ships nothing. Repository and tool noise never ships, mentioned or not: `.github`,
  `node_modules`, `.git`, `.in_use`, `.claude-plugin`, `__pycache__`, `.venv`, `venv`,
  `.pytest_cache`, `.mypy_cache`, `.ruff_cache`.
- A directory whose name starts with a dot (`.claude`, `.aws`, `.ssh` and the like hold settings
  and keys) or is `secrets` or `credentials`, in any case, never ships: not at the root, not at
  any depth inside a shipped directory, and not on a mention. It is listed as left out.
- A symlinked directory inside a shipped one is followed, like a symlinked file.
- A symlink is judged by what it leads to as well as by its own name. One that leads to a
  credential file (below), to a file directly inside a dot or secrets directory, or to such a
  directory never ships, whatever the link is called, and is listed as left out. Only the target's
  own name and the name of the directory it sits in count, not every directory on its path, since
  the skill itself may sit under `~/.claude`.
- A loose root file (`uv.lock`, `pyproject.toml`, `*.png`, `CHANGELOG.md`, `.env.example`) ships only
  when SKILL.md names it as a whole word: `.env.example` does not also name `.env`.
- Credential files never ship, at the root or inside a shipped directory: `.env`, `.env.*` and
  `.envrc`, `id_rsa*`, `id_dsa*`, `id_ed25519*`, `id_ecdsa*`, `*.pem`, `*.p12`, `*.pfx`, `*.key`,
  `*.p8`, `*.ppk`, `*.jks`, `*.keystore`, `*.kdbx`, `secring.*`, `.npmrc`, `.netrc`, `.pypirc`,
  `.pgpass`, `.git-credentials`, `.htpasswd`, `kubeconfig`, `credentials*.json`,
  `service-account*.json`, `client_secret*.json`, `token.json`, `token.pickle`. Names ending
  `.example`, `.sample`, `.template`, or `.pub` are not credentials.
- Junk never ships: `.DS_Store`, `*.pyc`, `*.pyo`.

**Verify listing** (`package.py` prints this)
- Per zip: the file count, the zip's size, and its three biggest members, so un-curated repo bloat
  stands out and can be re-trimmed.
- Per refused skill: `NOT PACKAGED`, then one `!` line per reason.
- `?` lines on a packaged skill: a point Anthropic's pages disagree on (today only a description
  over 200 characters). They do not fail the exit code.
- `- left out` lines for what curation kept back: directories with their file counts, root files
  SKILL.md does not name, credential files, and symlinks to a credential file or a dot or secrets
  directory. Read them against what the skill does. When a
  left-out directory or file is one the skill uses, say so on its report line rather than calling
  it ready.
- Member file names that look credential-related (`secret`, `token`, `credential`, `apikey` in the
  name) are flagged without failing the exit code. Distinguish real secrets from false positives
  (docs *about* secrets), and review anything flagged before upload.
- The zips removed from the previous run, the earlier exports this run replaced, and any zip in
  the folder this run did not write.
- Exit code 0 when every entry was packaged, 1 when at least one was refused, 2 for an unusable
  manifest, `--mode`, or `--out`.

**Not checked by `package.py`**

- **Mentions it cannot see.** A directory ships on a path written with a slash, from the skill root
  or from the file that mentions it. A skill that says "the agents folder", builds a path in code,
  or writes it from `${CLAUDE_PLUGIN_ROOT}` leaves that directory out, which is why the
  `- left out` lines need reading.
- **YAML beyond the usual mistakes.** The reader catches the unquoted values in the upload rules
  above, not every YAML error. Text after a closing quote, a tab (which some YAML parsers refuse),
  an anchor or alias, and a value YAML reads as a number, a boolean, or null (`name: 123`,
  `description: null`) all pass.
- **What files contain.** The credential rules go by file name. For a skill that is a whole
  repository, list the zip's members and look for anything that should not leave the machine.
- **The zip size.** claude.ai publishes no number for its upload limit (the Skills API's is 30 MB
  uncompressed). The listing gives each zip's size; mention a zip that is unusually large.
- **The body of `SKILL.md`,** as in Phase 0: Claude Code-only features are not flagged.
- **The mode.** `--mode` labels the listing and must agree with the manifest's `mode`. Taking the
  sandbox skills out under Strict happens in the manifest.
