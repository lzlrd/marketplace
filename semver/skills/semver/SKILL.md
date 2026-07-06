---
name: semver
description: >
  Decide the correct next version number under Semantic Versioning 2.0.0 — classify a change as
  MAJOR, MINOR, or PATCH and produce the exact next version string, including pre-release and
  build-metadata suffixes and the special pre-1.0.0 (0.y.z) rules. Use whenever a version number is
  being chosen or bumped: cutting a release, tagging a git release, bumping package.json /
  plugin.json / Cargo.toml / pyproject.toml / a VERSION file, writing a CHANGELOG entry, or the user
  asking "is this a major or minor bump" / "what version should this be." Trigger even without the
  word "version" whenever a change is about to ship and its version field needs updating. NOT for
  writing the changelog prose itself or deciding whether to release at all — only for picking the
  number once a change is being versioned.
---

# Semantic Versioning

Decide the next version number the way Semantic Versioning 2.0.0 (semver.org) actually specifies it,
not by feel. Grounded in a bundled distilled copy of the spec (`references/semver-spec.md`) — this
works identically online or offline, there is no live source to fall out of sync with.

## When this applies

Anytime a version field is about to change: a release, a git tag, a `package.json` / `plugin.json` /
`Cargo.toml` / `pyproject.toml` / `VERSION` file bump, a CHANGELOG entry, or a direct question like
"is this a major or minor bump." Decide the number; writing the changelog prose or deciding *whether*
to ship at all are separate concerns.

## The decision procedure

### 1. Find the current version and whether it has shipped

Read the current version from the project's actual version source (manifest field, latest git tag,
`__version__`, etc.) — don't guess or reuse a stale number from memory. If nothing has ever been
released, start at `0.1.0` (unreleased software) or `1.0.0` only once there's a public API users can
already depend on (see "Before 1.0.0" below).

### 2. Is it still pre-1.0.0 (`0.y.z`)?

If MAJOR is `0`, the normal rules below are relaxed: **anything may change at any time** (spec item
4). Convention (not a hard rule) most projects follow: bump PATCH (`0.y.Z`) for fixes, MINOR (`0.Y.z`)
for anything else including breaking changes — MAJOR stays `0` until the public API is declared
stable. Don't hand-wring over 0.x bumps; move to `1.0.0` once real users depend on a stable API (spec
FAQ: "If your software is being used in production... and you have a stable API on which users have
come to depend, you should be 1.0.0").

### 3. At or past 1.0.0: classify the change against the public API

Ask **does this change what a caller outside the project can observe or rely on** — a function
signature, a CLI flag, a config key, an HTTP response shape, a file format, default behavior.
Internal refactors, private helpers, and implementation details that don't move the public API don't
bump anything on their own (they ride along with whatever real change triggered the release).

| Change | Bump | Why |
|---|---|---|
| Removed or renamed a public function/endpoint/flag | **MAJOR** | Breaks existing callers |
| Changed a function's required parameters, or a response field's type/meaning | **MAJOR** | Existing calls now behave differently or fail |
| Added a **new required** field/parameter with no default | **MAJOR** | Existing valid calls become invalid |
| Added a new **optional** field, parameter (with a default), flag, or endpoint | **MINOR** | Old callers are unaffected; new capability is additive |
| Deprecated something *without removing it yet* | **MINOR** | Still works; the removal itself is the future MAJOR |
| Fixed a bug so behavior now matches the documented/intended contract | **PATCH** | Callers relying on the *correct* behavior are unaffected |
| Fixed a bug whose old (wrong) behavior callers had come to depend on | **MAJOR** | The fix itself is now the breaking change, however unwelcome |
| Updated a dependency with no public-API effect | **PATCH** if the update was to fix a bug, **MINOR** if it pulled in new functionality you now expose (spec FAQ) | Same rule applied one level down |
| Perf improvement, refactor, internal rename, comment/doc/test-only change | **no bump on its own** | Doesn't touch the public API |

When two rows apply to the same release (e.g. a feature *and* a fix), take the **highest** bump that
applies — MAJOR beats MINOR beats PATCH. Reset the lower components to zero when you bump a higher
one (`1.4.7` + breaking change → `2.0.0`, not `2.4.7`; `1.4.7` + feature → `1.5.0`, not `1.5.7`).

### 4. Pre-release and build metadata (optional suffixes)

- Shipping a preview before the real release: append `-<identifiers>` — `2.0.0-alpha`,
  `2.0.0-alpha.1`, `2.0.0-rc.2`. A pre-release **sorts below** its normal version
  (`2.0.0-rc.1 < 2.0.0`), so don't use one as if it outranks the final release.
- Tagging a build without affecting version precedence at all (CI build number, commit SHA): append
  `+<identifiers>` — `1.0.0+20260706`, `1.0.0-beta+exp.sha.5114f85`. Two builds that differ only in
  build metadata compare **equal**.
- Full comparison algorithm and identifier-sort rules are in `references/semver-spec.md` — read it
  when you need to actually order/sort a list of versions, not just pick the next one.

## Worked examples

- Added an optional `retries` parameter to an existing API call, old calls still work unchanged →
  **MINOR** (e.g. `2.3.1` → `2.4.0`).
- Removed a deprecated `--legacy-format` CLI flag → **MAJOR** (`2.4.0` → `3.0.0`).
- Fixed a null-pointer crash on empty input; no interface change → **PATCH** (`2.4.0` → `2.4.1`).
- Renamed a config key that existing config files still reference → **MAJOR**, even though it "looks
  like" a small rename — old configs now break.
- A pre-1.0 tool (`0.4.2`) gets a new subcommand → **MINOR** by convention (`0.5.0`); a pre-1.0 tool
  gets a bug fix → **PATCH** (`0.4.3`). Either is technically allowed to move however you like per
  spec item 4, but staying consistent helps users track meaningful jumps.

## Common mistakes

- **Bumping MAJOR for internal-only changes.** If nothing outside the project can observe the
  difference, it isn't a MAJOR change — it may not need any bump at all.
- **Calling a required addition MINOR.** "Added a field" isn't automatically backward compatible — it
  only is if existing callers still work *without* supplying it.
- **Forgetting a fix can be breaking.** If callers depend on the old (buggy) behavior, fixing it is a
  MAJOR change whether or not it feels like one.
- **Stalling in 0.y.z forever, or leaving 1.0.0 too long.** Zero-major is for genuine initial
  development; once real users depend on the API, move to `1.0.0` so MAJOR actually starts meaning
  something.
- **Treating build metadata as a tiebreaker.** It's explicitly excluded from precedence (spec item
  10) — never use it to make one build "newer" than another in comparisons.
- **Leading zeroes or non-numeric cores.** `1.02.0` or `1.4.0a` aren't valid semver — each of
  MAJOR/MINOR/PATCH is a non-negative integer with no leading zero.

## Reference

`references/semver-spec.md` — the distilled Semantic Versioning 2.0.0 spec: full precedence/comparison
algorithm, pre-release and build-metadata grammar, and the complete FAQ on 1.0.0 timing and dependency
bumps. Read it when the quick table above doesn't cover the case in front of you (e.g. sorting a
version list, or handling multi-part pre-release identifiers).
