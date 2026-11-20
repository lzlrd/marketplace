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
   Context7 connected   ── resolve the library → settle the version → query its docs on the topic
   Context7 unavailable ── fall back to the library's own docs site, then a web search
```

## Auto-Engagement

The entry point is an auto-invoked skill named `library-docs`. Claude loads it whenever a question
is anchored to a specific library, framework, SDK, API, or CLI tool: API syntax, configuration,
version-migration steps, or a library-specific error message. That includes libraries it already
knows well, since a library's docs move faster than training data. It stays out of refactoring,
writing code with no specific library involved, business-logic debugging, general code review, and
programming concepts that aren't tied to one library's API.

Questions about the Claude API and Anthropic SDKs go to Claude Code's bundled `claude-api` skill.
Every other LLM provider's SDK is handled here like any library.

## Install

```sh
/plugin marketplace add lzlrd/marketplace
/plugin install library-docs@lzlrd
```

Restart the session. Check: the `library-docs` skill shows in the skills list.

## Requirements

The plugin does not bundle Context7. Without it the skill still answers, through the web fallback
below. To connect it, use the Context7 connector on claude.ai or add the server yourself:

```sh
claude mcp add --transport http context7 https://mcp.context7.com/mcp
```

An API key is optional and raises the rate limits; the
[Context7 README](https://github.com/upstash/context7) shows the header. The server can have any
name, because the skill looks for the `resolve-library-id` and `query-docs` tools. Queries are sent
to the Context7 API.

## How It Works

Context7 first, the web otherwise:

1. **Context7 connected.** Resolve the library name to a Context7 library ID, settle the version in
   play (from the question, or else the project's manifest or lockfile), then query its docs on
   the exact topic (one concept per query, up to three queries per question).
2. **Context7 unavailable, erroring, or missing the library.** Fetch the library's own docs site or
   README, then search the web if there's no obvious canonical source. It falls back to unaided
   training knowledge, flagged as possibly stale, only if both come up empty.

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
