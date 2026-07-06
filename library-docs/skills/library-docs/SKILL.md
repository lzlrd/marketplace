---
name: library-docs
description: >-
  Fetch current, version-accurate documentation for any third-party library, framework, SDK, API,
  or CLI tool via the Context7 MCP server before answering questions about it — API syntax,
  configuration, version-migration steps, setup instructions, or a library-specific error message.
  Trigger this whenever the user names a specific library or framework (React, Next.js, Prisma,
  Express, Tailwind, Django, Spring Boot, a payment-provider SDK, or any other, well-known or
  obscure) and asks how to use, configure, upgrade, or debug it — even for libraries you already
  know well, since training data may not reflect a library's latest release or a breaking change.
  Also trigger when the user pastes a library-specific error message or stack trace. Do NOT use for
  refactoring, writing new code/scripts with no specific library involved, business-logic
  debugging, general code review, or programming concepts (algorithms, design patterns) that
  aren't tied to one library's API.
---

# Library Docs (Context7)

Ground any library/framework-specific answer in that library's current documentation instead of
training data, which goes stale the moment a library ships a new release.

## When to use this

Trigger on any question anchored to a **specific** library, framework, SDK, API, or CLI tool: API
syntax and parameters, configuration/setup, version-migration ("upgrading from v3 to v4"), a
library-specific error message, or "how do I do X with `<library>`". Applies even to libraries you
already know well — confidence isn't the same as currency, and Context7 gives you the actual
current docs instead of a guess dressed up as one.

**Skip this skill** for: refactoring, writing new code/scripts with no specific library involved,
debugging application/business logic, general code review, or programming concepts that aren't
tied to one library's API. Those aren't documentation lookups, and running this skill on them just
adds a detour.

## Cross-reference

For OS/platform SDK questions (Apple/macOS/iOS, Windows, Android) reach for the sibling
`platform-docs` skill instead — it covers the platform-vendor doc MCPs specifically. This skill is
for third-party libraries and frameworks generally, on any platform.

## Procedure (MCP-first, web fallback)

1. **Context7 connected** (`mcp__claude_ai_Context7__resolve-library-id` is available):
   - Call `resolve-library-id` with `libraryName` (the official name, e.g. "Next.js" not "nextjs")
     and `query` (what the user is trying to do) to get the Context7-compatible library ID. Skip
     this step if the user already gave an exact ID in `/org/project` or `/org/project/version`
     form.
   - Call `query-docs` with that `libraryId` and a `query` scoped to **one concept** (e.g. "App
     Router middleware config", not "routing and auth and caching"). Split multi-concept questions
     into separate calls — up to three per question.
   - Ground your answer in the returned docs. Don't skip straight to training knowledge just
     because you're confident — that's the exact failure mode this skill exists to prevent.
2. **Context7 unavailable or it errors** (not connected, disconnected mid-session, or the library
   isn't indexed): fall back silently, in order —
   - WebFetch the library's official docs site or README/CHANGELOG (prefer the canonical source).
   - WebSearch for the specific API/version question if there's no obvious canonical doc URL.
   - Only if both come up empty, answer from training knowledge and say so explicitly — flag it as
     possibly stale rather than presenting it with false confidence.
   Never surface the MCP's absence as a blocker to the user; just get the answer another way.

## Example

Input: "how do I set up middleware in Next.js 15 App Router"

→ `resolve-library-id(libraryName: "Next.js", query: "App Router middleware setup")` →
`query-docs(libraryId: <resolved>, query: "App Router middleware setup")` → answer grounded in the
returned docs, noting version-specific behavior if it differs from older Next.js releases.
