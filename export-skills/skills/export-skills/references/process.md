# Exporting Claude Code Skills to Claude Desktop — the full process

Deduce which locally-installed Claude Code skills can run in **Claude Desktop / claude.ai**, then
package them as upload-ready zips. Two output modes: **Lenient** (default) and **Strict**.

Phases 0 and 6 are deterministic and trap-ridden, so they are bundled as scripts (`scripts/inventory.py`
and `scripts/package.py`). Phases 1 to 5 are model judgment. `SKILL.md` is the short orchestration
entry; this file is the detail.

---

## Phase 0 — Inventory every skill (`scripts/inventory.py`)

`inventory.py` emits the complete work-list as JSON. It defends against every trap below; read its
output rather than re-deriving the enumeration by hand.

Skills live in two roots, each with traps:

1. **Plugin skills** — under `~/.claude/plugins/cache`.
   - Use `cache/` (installed versions), **not** `marketplaces/` (that is the catalog source and
     includes plugins you never installed: duplicates and noise).
   - **Multiple versions per plugin** exist in cache (e.g. `4man/0.3.2` … `0.5.1`, or hash dirs like
     `26db21ae4fa1` and `unknown`). Pick the **latest** (numeric-dotted versions win; hashes fall
     back to mtime).
   - **Root-level SKILL.md**: some plugins (e.g. `humanizer`) put SKILL.md at the plugin root, not
     under `skills/`. Both shapes are collected.
2. **Personal skills** — `~/.claude/skills/`.
   - These are often **symlinks** into `~/.agents/skills/`. `find` does **not** follow symlinks and
     silently misses them, so the script resolves each entry with `realpath`.
3. **Authoritative install list** — `~/.claude/settings.json` → `enabledPlugins`. Ground truth for
   "my skills" (cache may hold disabled or stale plugins). The script marks each plugin skill enabled
   or not.
4. **Built-in Claude Code skills** (`verify`, `run`, `code-review`, `deep-research`, `init`,
   `simplify`, …) have **no file on disk**. They are CC-native, out of scope, and not zippable. Do not
   chase them.
5. **The target's MCP config** — `~/Library/Application Support/Claude/claude_desktop_config.json` →
   `mcpServers`. This list is the *entire* basis for criterion 3 below. It is **per-user**; the script
   reads it, so never assume it.

Output: a work-list of `{kind, repo, plugin, plugin_version, name, skill_md, skill_dir,
resource_dirs, enabled}` per skill (latest version only, no marketplace dupes) plus
`desktop_mcp_servers`.

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
3. **MCP available** — any MCP server the skill needs must be in the Desktop `mcpServers` list (or the
   skill degrades gracefully without it).

---

## Phase 2 — Classify each skill (one reviewer per skill)

Fan out one sub-agent per skill (parallel). Each reads its SKILL.md (and peeks at `scripts/` or
resources if how it operates is unclear), is handed the Desktop MCP list, and returns:

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

---

## Phase 3 — Normalize (the orchestrator judgment layer)

Reviewer verdicts drift; make them consistent with the code and your own eyes:

- **Re-derive MCP availability yourself.** Do not trust the reviewer's bool. Normalize each
  `mcp_needed` name and set-difference against the authoritative Desktop list. (Aliases:
  `offload`→`offshore`; tool-prefix→server.)
- **Rule: identical dependency ⇒ identical verdict.** If two skills fail or pass for the same reason,
  they get the same verdict. (This catches e.g. `imagegen-web` vs `imagegen-mobile` sharing the "no
  image generation on Desktop" limit → both CAVEAT.)
- **Read the borderline SKILL.md files yourself** before overriding. (Confirm cases like a
  `web-artifacts-builder` whose bash runs *in-sandbox*: it is a claude.ai artifacts skill, so it
  qualifies rather than being disqualified.)
- **Handle failed or rate-limited reviewers** by classifying from a sibling skill or a direct read.
  Never drop a skill silently.

---

## Phase 4 — Strict vs Lenient (this is the whole fork)

The **only** difference between modes is how criterion 1's "no local shell" is read:

| | Lenient (default) | Strict |
|---|---|---|
| Sandbox code-exec (`pdf`, `docx`, `xlsx`, `pptx`, `canvas-design`, `slack-gif-creator`, `algorithmic-art`, `web-artifacts-builder`) | **Included** — it is how Desktop's own skills work | **Excluded** — "no shell" read literally |
| Pure prompt / artifact / Desktop-MCP / limited-output skills | Included | Included (identical) |
| Needs the *user's real* machine / repo / dev server | Excluded | Excluded (identical) |

Lenient is the accurate model of Desktop's actual capability; Strict honors a literal "zero code
execution" reading. Nothing else changes between the two. There is no `--lenient` flag; lenient is the
default and Strict is opt-in with `--strict`.

---

## Phase 5 — Tier the qualifiers (for the human-readable report)

- **A — Ready as-is:** pure prompt / guidance / artifact. Upload and go.
- **B — Needs code-execution sandbox enabled.** (Lenient-only.)
- **C — Needs a Desktop MCP connected** — name the exact server, and confirm it is in *their* config.
  Note partial loss (e.g. a job board whose MCP is not present).
- **D — Works but output-limited** — e.g. image-*direction* skills when Desktop has no image
  generation; solve-but-cannot-render.
- **Excluded:** group by reason — CC dev/config tooling · needs local shell/project · needs a missing
  MCP.

---

## Phase 6 — Package into upload-ready zips (`scripts/package.py`)

`package.py` reads the qualifiers manifest and does the layout, curation, and verification below.

**Layout scheme**
- Plugin skills → **one zip per plugin**, containing each qualifying skill as its own
  `<skill>/SKILL.md` subfolder.
- Personal skills → **one zip per skill**.
- **Invariant:** every skill folder has `SKILL.md` at its root (claude.ai upload requirement).
  Plugin-bundle zips hold multiple skill folders; the user uploads each folder individually.

**Curation** — copy `SKILL.md` plus:
- **KEEP** resource dirs: `references`, `reference`, `scripts`, `templates`, `assets`, `examples`,
  `themes`, `core`, `style-prompts`, `canvas-fonts`, `docs`, `evals`.
- **DROP** repo-noise dirs: `.github`, `tests`, `src`, `node_modules`, `.git`, `dist`, `build`,
  `desktop-extension`, `.in_use`, `.claude-plugin`, `eval-viewer`, `agents`, `__pycache__`; and junk
  files (`.DS_Store`).
- For a repo-style skill, loose root files (`uv.lock`, `pyproject.toml`, `*.png`, `CHANGELOG.md`,
  `.env.example`) are **not** copied blindly. `package.py` ships a loose root file only when the
  SKILL.md references it by name.

**Verify after packing** (`package.py` prints this)
- Biggest members of each zip, so un-curated repo bloat stands out and can be re-trimmed.
- `SKILL.md` sits at every skill-folder root.
- Member names grepped for credential-ish patterns (`.env`, `secret`, `token`, `.pem`, `id_rsa`,
  `.key`, `credential`). Distinguish real secrets from false positives (docs *about* secrets;
  `.env.example` templates), and review anything flagged before upload.

---

## Gotchas (the non-obvious failures this process defends against)

1. Symlinked personal skills → `find` misses them (does not follow symlinks).
2. `cache/` vs `marketplaces/` → duplicates and uninstalled plugins.
3. Multiple cached versions → pick latest.
4. Root-level SKILL.md (not under `skills/`).
5. Built-in CC skills have no file → not exportable.
6. **Sandbox ≠ local shell** — the single distinction that defines Strict vs Lenient.
7. MCP availability is **per-user** → read their Desktop config, do not assume.
8. Repo-style skills bloat zips → curate by what SKILL.md references.
9. Per-skill reviewer verdicts are inconsistent → normalize (identical dependency ⇒ identical verdict)
   and read borderline files yourself.
