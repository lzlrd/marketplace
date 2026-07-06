# semver

A `semver` skill for [Claude Code](https://github.com/anthropics/claude-code) that decides the next
version number the way [Semantic Versioning 2.0.0](https://semver.org) actually specifies it:
classify the change against the public API, then bump MAJOR, MINOR, or PATCH accordingly — plus
pre-release and build-metadata suffixes and the relaxed pre-1.0.0 rules. There is no command to type.

```
You: "I added an optional `retries` param to the client, what version should this ship as?"
        │  skill `semver` auto-engages
        ▼
   1. Read the current version + whether it's pre-1.0.0
   2. Classify the change against the public API (breaking / additive / fix-only)
   3. Apply the highest-priority bump, resetting lower components to zero
   4. Add a pre-release/build-metadata suffix if this is a preview build
```

## Auto-engagement

The entry point is an auto-invoked skill named `semver`. Claude loads it whenever a version field is
about to change — a release, a git tag, a `package.json` / `plugin.json` / `Cargo.toml` /
`pyproject.toml` / `VERSION` bump, a CHANGELOG entry — or when asked directly "is this a major or
minor bump." It needs no command, and is slash-available as `/semver:semver` if you want to force it.

It only picks the version *number*; writing the changelog prose or deciding whether to release at all
are separate decisions.

## Install

```sh
/plugin marketplace add lzlrd/marketplace
/plugin install semver@lzlrd
```

Restart the session. Check: the `semver` skill shows in the skills list and `/semver:semver` is
registered.

## Why a bundled reference

Semantic Versioning 2.0.0 is a short, frozen specification — it hasn't changed since 2013 and has no
live API or MCP server of its own to fall out of sync with. `references/semver-spec.md` is a distilled
copy of the full spec (precedence/comparison algorithm, pre-release and build-metadata grammar, the
1.0.0 and dependency-bump FAQ answers), so the skill works identically online or offline.

## Structure

```
semver/
├── .claude-plugin/
│   └── plugin.json
└── skills/semver/
    ├── SKILL.md              # the decision procedure + worked examples (always loaded)
    └── references/
        └── semver-spec.md    # the distilled full spec, loaded on demand
```
