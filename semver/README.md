# semver

A `semver` skill for [Claude Code](https://github.com/anthropics/claude-code) that decides the next
version number the way [Semantic Versioning 2.0.0](https://semver.org) specifies it: classify the
change against the public API, then bump MAJOR, MINOR, or PATCH accordingly, with pre-release and
build-metadata suffixes and the relaxed pre-1.0.0 rules. There is no command to type.

```
You: "I added an optional `retries` param to the client, what version should this ship as?"
        │  skill `semver` auto-engages
        ▼
   1. Read the current version + whether it's pre-1.0.0
   2. Classify the change against the public API (breaking / additive / fix-only)
   3. Apply the highest-priority bump, resetting lower components to zero
   4. Add a pre-release/build-metadata suffix if this is a preview build
```

## Auto-Engagement

The entry point is an auto-invoked skill named `semver`. Claude loads it whenever a version field is
about to change (a release, a git tag, a `package.json` / `plugin.json` / `Cargo.toml` /
`pyproject.toml` / `VERSION` bump, a CHANGELOG entry) or when asked directly "is this a major or
minor bump." It needs no command, and is slash-available as `/semver:semver` if you want to force it.

It only picks the version *number*; writing the changelog prose or deciding whether to release at all
are separate decisions.

With many skills installed, Claude Code can list this one by name only, without the description it
triggers on, and it then stops engaging by itself. Run `/doctor` to see what the skill listing costs,
disable plugins you do not use with `/plugin`, raise `skillListingBudgetFraction` in settings, or
invoke `/semver:semver` directly.

## Install

```sh
/plugin marketplace add lzlrd/marketplace
/plugin install semver@lzlrd
```

If the install summary asks for it, run `/reload-plugins`. Check: the `semver` skill shows in the
skills list and `/semver:semver` is registered.

## Why a Bundled Reference

Semantic Versioning 2.0.0 is short and has been the current version since 2013. Its text receives
only occasional editorial fixes, and there is no live API or MCP server to query.
`references/semver-spec.md` is a distilled copy (items 1 to 11 with the precedence algorithm, the
pre-release and build-metadata rules, selected FAQ answers and the validation regex), checked
against semver.org on 19 November 2026, so the skill works identically online or offline.

## Structure

```
semver/
├── .claude-plugin/
│   └── plugin.json
└── skills/semver/
    ├── SKILL.md              # the decision procedure + worked examples (loaded when the skill engages)
    └── references/
        └── semver-spec.md    # the distilled spec, loaded on demand
```
