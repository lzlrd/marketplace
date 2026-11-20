# Step 1 — The Two Off-Disk Context Blocks

Assemble both blocks in the lead, which has the MCP access teammates lack.

## 1a. Author & Style Profile (the Requestor's Voice)

Held in session memory and (if available) mempalace — **never written to any file in the repo,
including .pipeline/ or CLAUDE.md.**
1. **Identity** (from `.gitconfig`): `git config user.name` and `git config user.email`.
2. **Workspace key**: `git config --get remote.origin.url` if set, else the repo's absolute
   path. Combine with the author email to label the profile: the label is the "derived
   from" note if the user accepts the Step 6 save offer.
3. **Retrieve** the requestor's stored `coding-style` and `writing-voice` conventions
   (mempalace `wing_user`): from the **mempalace MCP if connected**; else, if the `mempalace`
   CLI is installed, `mempalace search "<what you need>" --wing wing_user` /
   `mempalace wake-up`. (If the `mempalace-hooks` plugin is installed,
   `/mempalace-hooks:match-style` is the same pull in one step.) If found, use it.
4. **First run** (nothing stored, or mempalace absent): derive a profile as described under
   "First-Run Derivation" below.

Output: a **`## Author & style profile`** block.

## 1b. Development Preferences (Durable, From Mempalace)

Retrieve the requestor's durable development / stylistic preferences — their **`working-prefs`**
(mempalace `wing_user`): the standing instructions they've given across sessions, not tied to
this repo. Examples: *target the latest stable SDK/runtime versions that don't cause issues*
(e.g. iOS 25 over 23.x, Android 16 over 12), shebang styling, preferred toolchain/installer,
formatting defaults. Pull them from the **mempalace MCP if connected**; else, if the `mempalace`
CLI is installed, `mempalace search "<what you need>" --wing wing_user` / `mempalace wake-up`.
Fold what's relevant into a **`## Development preferences`** block. These are user-wide, not
workspace-keyed. If neither the MCP nor the CLI is available, leave the block empty and note it.

## First-Run Derivation

Use this only when item 3 of 1a found no stored profile. Build one from the requestor's
**human-authored commits only**.

1. **List candidates**, capped so the output stays readable:
   `git log --no-merges -n 200 --author=<configured email> --pretty=format:'%H%x1f%an%x1f%ae%x1f%cn%x1f%ce%x1f%B%x1e'`
   If the configured email has no commits here, drop `--author` and rely on the filter
   below.
2. **Exclude any AI-authored or AI-co-authored commit.** Drop a commit if its message has a
   `Co-Authored-By:`/`Co-authored-by:` trailer, or if any author or committer field or
   signature matches (case-insensitive): `claude`, `anthropic`, `noreply@anthropic.com`,
   `gemini`, `google` bot, `gpt`, `openai`, `codex`, `copilot`, `cursor`, `devin`, `aider`,
   `cody`, `sourcegraph`, `tabnine`, `[bot]`, `bot@`, or strings like "Generated with Claude
   Code". The committer fields matter: an AI tool can commit under a human author.
3. **Derive a concise profile** from the remaining commits' messages and diffs:
   commit-message conventions (tense, prefix/Conventional-Commits, length, body style), code
   style (naming, indentation, import ordering, comment density, error-handling idioms), test
   style/naming, and any voice in docs/comments.
4. **Keep it for this run only.** Hold the profile in session memory. Do not write it to
   mempalace or to any file on your own: the requestor's stored conventions grow by asking,
   not by inference. In the Step 6 report, offer once to save it and say where it would go
   (mempalace `wing_user`, rooms `coding-style` and `writing-voice`, marked as derived from
   this repo's commits). Save only on a yes, through the mempalace MCP; the CLI has no
   direct write.
