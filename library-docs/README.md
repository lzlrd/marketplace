# library-docs

Current, version-accurate documentation for any third-party library, framework, SDK, API, or CLI
tool, for [Claude Code](https://github.com/anthropics/claude-code). Name a library and ask how to
use, configure, or upgrade it, and the skill grounds the answer in that library's real
documentation via Context7 instead of guessing from training data that may already be a few
releases stale.

```
You: "how do I set up middleware in Next.js 15 App Router"      (no command)
        │  skill `library-docs` auto-engages
        ▼
   Context7 connected   ── resolve the library → query its current docs on the exact topic
   Context7 unavailable ── fall back to the library's own docs site, then a web search
```

## Auto-engagement

The entry point is an auto-invoked skill named `library-docs`. Claude loads it whenever a question
is anchored to a specific library, framework, SDK, API, or CLI tool — API syntax, configuration,
version-migration steps, or a library-specific error message — even for libraries it already knows
well, since a library's docs move faster than training data. It stays out of refactoring, writing
code with no specific library involved, business-logic debugging, general code review, and
programming concepts that aren't tied to one library's API.

## Install

```sh
/plugin marketplace add lzlrd/marketplace
/plugin install library-docs@lzlrd
```

Restart the session. Check: the `library-docs` skill shows in the skills list.

## How it works

Context7 first, silent fallback otherwise:

1. **Context7 connected** — resolve the library name to a Context7 library ID, then query its docs
   on the exact topic (one concept per query, up to three queries per question).
2. **Context7 unavailable** — fetch the library's own docs site or README, then a web search if
   there's no obvious canonical source. Only falls back to unaided training knowledge, flagged as
   possibly stale, if both come up empty.

See the sibling `platform-docs` plugin for OS/platform SDK documentation (Apple, Windows, Android);
this skill covers third-party libraries and frameworks generally.

## Structure

```
library-docs/
├── .claude-plugin/
│   └── plugin.json
└── skills/library-docs/
    └── SKILL.md          # trigger conditions + the Context7-first, web-fallback procedure
```
