# Semantic Versioning 2.0.0 — distilled spec

Source: [semver.org](https://semver.org) (Semantic Versioning 2.0.0, Tom Preston-Werner). This is a
distilled reference for offline use with verbatim quotes where it matters — it is not the
authoritative text; consult semver.org itself for a case this file doesn't cover. Checked against
semver.org on 2026-11-19.

The Semantic Versioning specification is licensed
[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/); this file is an adaptation of it.

## Summary

Given a version number `MAJOR.MINOR.PATCH`, increment the:

1. MAJOR version when you make incompatible API changes.
2. MINOR version when you add functionality in a backward compatible manner.
3. PATCH version when you make backward compatible bug fixes.

Pre-release and build-metadata labels are available as extensions to the `MAJOR.MINOR.PATCH` format.

## The spec, item by item

1. **Public API.** Software using SemVer MUST declare a public API — in code or in documentation.
   This is the surface the rest of the spec measures compatibility against.
2. **Version format.** A normal version MUST take the form `X.Y.Z`, non-negative integers, no leading
   zeroes. Each element MUST increase numerically (`1.9.0` → `1.10.0`, not string-sorted).
3. **Immutability.** Once a version is released, its contents MUST NOT be modified. Any change MUST
   ship as a new version.
4. **Zero major (`0.y.z`).** Initial development. Anything MAY change at any time. The public API
   isn't considered stable yet.
5. **1.0.0.** Defines the public API. Every increment after this is judged against that API and how
   it changes.
6. **PATCH (`x.y.Z`, x > 0).** MUST increment if only backward-compatible bug fixes are introduced.
   A bug fix is an internal change that fixes incorrect behavior.
7. **MINOR (`x.Y.z`, x > 0).** MUST increment when backward-compatible functionality is added to the
   public API. MUST increment if any public API functionality is marked as deprecated. MAY
   increment for substantial internal changes/improvements. MAY include patch-level changes. MUST
   reset PATCH to 0.
8. **MAJOR (`X.y.z`, X > 0).** MUST increment when any backward-incompatible change is introduced.
   MAY include minor/patch-level changes too. MUST reset MINOR and PATCH to 0.
9. **Pre-release.** MAY be appended with a hyphen + dot-separated identifiers immediately after
   PATCH: `1.0.0-alpha`, `1.0.0-alpha.1`, `1.0.0-0.3.7`, `1.0.0-x.7.z.92`, `1.0.0-x-y-z.--`.
   Identifiers MUST use only ASCII alphanumerics and hyphens `[0-9A-Za-z-]`, MUST NOT be empty, and
   numeric identifiers MUST NOT have leading zeroes. A pre-release version has **lower precedence**
   than its associated normal version. It "indicates that the version is unstable and might not
   satisfy the intended compatibility requirements as denoted by its associated normal version."
10. **Build metadata.** MAY be appended with a `+` + dot-separated identifiers, after the patch or
    pre-release version: `1.0.0-alpha+001`, `1.0.0+20130313144700`, `1.0.0-beta+exp.sha.5114f85`,
    `1.0.0+21AF26D3----117B344092BD`. Same character set as pre-release identifiers, and identifiers
    MUST NOT be empty, but numeric build identifiers may have leading zeroes (the grammar allows
    any digits, as in `1.0.0-alpha+001`). Build metadata **MUST be ignored when determining
    precedence** — two versions differing only in build metadata have equal precedence.
11. **Precedence (how to compare/sort two versions).** Compare MAJOR, then MINOR, then PATCH
    numerically, left to right; the first difference wins. If those are all equal, a version *with* a
    pre-release has lower precedence than one without (`1.0.0-alpha < 1.0.0`). When both have
    pre-release fields, compare each dot-separated identifier left to right:
    - Identifiers made only of digits are compared numerically.
    - Identifiers with any letters or hyphens are compared lexically in ASCII sort order.
    - A purely-numeric identifier always has lower precedence than an alphanumeric one, when compared
      position-by-position.
    - If all shared leading identifiers are equal, the version with **more** pre-release fields has
      higher precedence.

    Worked ordering (increasing precedence):
    `1.0.0-alpha < 1.0.0-alpha.1 < 1.0.0-alpha.beta < 1.0.0-beta < 1.0.0-beta.2 < 1.0.0-beta.11 <
    1.0.0-rc.1 < 1.0.0`

## FAQ highlights

- **How do I handle revisions in the 0.y.z phase?** "The simplest thing to do is start your initial
  development release at 0.1.0 and then increment the minor version for each subsequent release."
- **When do I release 1.0.0?** "If your software is being used in production, it should probably
  already be 1.0.0. If you have a stable API on which users have come to depend, you should be
  1.0.0. If you're worrying a lot about backward compatibility, you should probably already be
  1.0.0."
- **I accidentally released a backward-incompatible change as a minor version — now what?** Fix
  the problem and release a new version that corrects it and restores backward compatibility;
  never modify the released version, and document the offending version if appropriate.
  (semver.org says "a new minor version"; the specification repository's current text says "a new
  patch version".)
- **I changed my dependencies without changing the public API — patch or minor?** That's compatible
  by definition since the public API didn't move. Whether it's PATCH or MINOR depends on *why* you
  updated the dependency: to fix a bug in that dependency → PATCH; to pull in new functionality you
  now expose → MINOR.
- **What if I inadvertently alter the public API in a way the version number change doesn't allow
  (a breaking change shipped in a patch release, say)?** "Use your best judgment. If you have a
  huge audience that will be drastically impacted by changing the behavior back to what the public
  API intended, then it may be best to perform a major version release, even though the fix could
  strictly be considered a patch release." This answers the case of an earlier release that changed
  the API by mistake and is now being put right.
- **How should I handle deprecating functionality?** Deprecating existing functionality is a normal
  part of software development and often required to make forward progress. Update the
  documentation and issue a new MINOR release with the deprecation in place; "there should be at
  least one minor release that contains the deprecation" before the functionality is removed in a
  new MAJOR release.
- **Is there a size limit on the version string?** No limit is specified — use good judgment.
- **Is "v1.2.3" a semantic version?** No. Prefixing a version with "v" is a common way to name a
  tag: in `git tag v1.2.3`, "v1.2.3" is a tag name and the semantic version is "1.2.3".

## Regex (for tooling)

The spec's own reference regex for validating a fully-formed semver string:

```
^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$
```
