---
name: semver
description: >
  Decide the correct next version number under Semantic Versioning 2.0.0 — classify a change as
  MAJOR, MINOR, or PATCH and produce the exact next version string, including pre-release and
  build-metadata suffixes and the special pre-1.0.0 (0.y.z) rules. Use whenever a version number is
  being chosen or bumped: cutting a release, tagging a git release, bumping package.json /
  plugin.json / Cargo.toml / pyproject.toml / a VERSION file, writing a CHANGELOG entry, or the user
  asking "is this a major or minor bump" / "what version should this be." NOT for
  writing the changelog prose itself or deciding whether to release at all — only for picking the
  number once a change is being versioned.
---

# Semantic Versioning

Decide the next version number the way Semantic Versioning 2.0.0 (semver.org) specifies it, not by
feel. The rules below come from a bundled distilled copy of the spec
(`references/semver-spec.md`), so this works the same online or offline.

Decide the number; writing the changelog prose or deciding *whether* to ship at all are separate
concerns.

## The decision procedure

### 1. Find the current version and whether it has shipped

Read the current version from the project's actual version source (manifest field, latest git tag,
`__version__`, etc.) — don't guess or reuse a stale number from memory. A tag such as `v1.2.3` is a
tag name; the version is `1.2.3`, and that is what goes in a manifest (spec FAQ). If nothing has
ever been released, start at `0.1.0` (unreleased software) or `1.0.0` only once there's a public API
users can already depend on (see step 2).

### 2. Is it still pre-1.0.0 (`0.y.z`)?

If MAJOR is `0`, the normal rules below are relaxed: **anything may change at any time** (spec item
4). Convention (not a hard rule) most projects follow: bump PATCH (`0.y.Z`) for fixes, MINOR (`0.Y.z`)
for anything else including breaking changes — MAJOR stays `0` until the public API is declared
stable. The spec FAQ's simplest scheme is a MINOR bump for every `0.y.z` release; apply the
PATCH-for-fixes convention unless the project already follows that scheme. Don't hand-wring over
0.x bumps; move to `1.0.0` once real users depend on a stable API (spec FAQ: "If you have a stable
API on which users have come to depend, you should be 1.0.0.").

### 3. At or past 1.0.0: classify the change against the public API

Ask **does this change what a caller outside the project can observe or rely on** — a function
signature, a CLI flag, a config key, an HTTP response shape, a file format, default behavior.
Internal refactors, private helpers, and implementation details don't move the public API, so in a
release that also carries other changes they never force a higher bump. A release made of nothing
else still needs a new number (last row).

| Change | Bump | Why |
|---|---|---|
| Removed or renamed a public function/endpoint/flag | **MAJOR** | Breaks existing callers |
| Changed a function's required parameters, or a response field's type/meaning | **MAJOR** | Existing calls now behave differently or fail |
| Added a **new required** field/parameter with no default | **MAJOR** | Existing valid calls become invalid |
| Added a new **optional** field, parameter (with a default), flag, or endpoint | **MINOR** | Old callers are unaffected; new capability is additive |
| Deprecated something *without removing it yet* | **MINOR** | Still works; the removal itself is the future MAJOR |
| Fixed a bug so behavior now matches the documented/intended contract | **PATCH** | Callers relying on the *correct* behavior are unaffected |
| Fixed a bug whose old (wrong) behavior callers had come to depend on | **PATCH** by the letter of the spec; **MAJOR** as a judgment call when a large audience relies on the old behavior and would be badly affected (by analogy with the spec FAQ on an API changed by mistake: "Use your best judgment") | Wrong behavior that was never documented isn't the public API, but the spec's FAQ allows a MAJOR in a closely related case to protect users. Say which was chosen and why. If the old behavior *was* documented, this is a changed meaning: MAJOR |
| Updated a dependency | **PATCH** if the update just fixes a bug behind your API, **MINOR** if it pulled in new functionality you now expose (spec FAQ); **MAJOR** if it makes a backward-incompatible change to your own public API (spec item 8) | Classify by the effect on *your* public API, not the dependency's |
| Perf improvement, refactor, internal rename, comment/doc/test-only change | **Requires no bump of its own** alongside other changes. Shipped alone: **PATCH** by convention. Either way, **MINOR** is the maintainer's option when the internal improvement is substantial (spec item 7) | The public API doesn't move, but a released version can't be modified, so anything that ships needs a new number (spec item 3). That holds under `0.y.z` as well, where step 2 decides which element moves |

When two rows apply to the same release (e.g. a feature *and* a fix), take the **highest** bump that
applies — MAJOR beats MINOR beats PATCH. Reset the lower components to zero when you bump a higher
one (`1.4.7` + breaking change → `2.0.0`, not `2.4.7`; `1.4.7` + feature → `1.5.0`, not `1.5.7`).
Each of MAJOR, MINOR, and PATCH is a non-negative integer with no leading zero: `1.02.0` and
`1.4.0a` aren't valid.

Where the version field is how installs detect an update, an unchanged number means installed
copies are not updated. A Claude Code `plugin.json` that sets `version` is one such case.

### 4. Pre-release and build metadata (optional suffixes)

- Shipping a preview before the real release: pick the core version with the steps above, then
  append `-<identifiers>` — a preview of a breaking change to `1.4.7` is `2.0.0-alpha.1`. A
  pre-release **sorts below** its normal version (`2.0.0-rc.1 < 2.0.0`), so don't use one as if it
  outranks the final release.
- Next preview: increment the trailing numeric identifier (`2.0.0-rc.1` → `2.0.0-rc.2`). Final
  release: drop the suffix (`2.0.0-rc.2` → `2.0.0`, not `2.0.1`).
- Keep a counter as its own dot-separated identifier: `rc.10` sorts above `rc.9`, but `rc10` sorts
  below `rc9`, because an identifier with letters in it compares as ASCII text.
- Tagging a build without affecting version precedence at all (CI build number, commit SHA): append
  `+<identifiers>` — `1.0.0+20260706`, `1.0.0-beta+exp.sha.5114f85`. Two builds that differ only in
  build metadata compare **equal**, so build metadata never makes one build "newer" than another.

## Output

State the bump level (MAJOR/MINOR/PATCH, or no bump when the change isn't being released on its
own), the exact next version string, and the one rule from the table that decided it. A few
sentences is the right size — this is a version decision, not a report.

## Worked examples

- Renamed a config key that existing config files still reference → **MAJOR** (`2.4.0` → `3.0.0`),
  even though it "looks like" a small rename — old configs now break.
- A release that only speeds up a hot path, with no interface change → **PATCH** (`2.4.0` →
  `2.4.1`): it ships, so it needs a number.
- A pre-1.0 tool (`0.4.2`) gets a new subcommand → **MINOR** by convention (`0.5.0`); a pre-1.0 tool
  gets a bug fix → **PATCH** (`0.4.3`). Spec item 4 lets anything change under `0.y.z`, so which
  element moves is a convention, but the version must still increase (spec item 2). Staying
  consistent helps users track meaningful jumps.

## Reference

`references/semver-spec.md` — the distilled Semantic Versioning 2.0.0 spec: items 1 to 11 with
the full precedence/comparison algorithm and the pre-release and build-metadata rules, selected FAQ
answers (0.y.z, 1.0.0 timing, dependency updates, an API changed by mistake, deprecation, the `v`
prefix), and the validation regex. Read it when the table above doesn't settle the case at hand, or
to order or validate version strings.
