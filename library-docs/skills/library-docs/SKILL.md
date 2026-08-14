---
name: library-docs
description: >-
  Fetch current, version-accurate documentation for any third-party library, framework, SDK, API,
  or CLI tool via the Context7 MCP server before answering questions about it — API syntax,
  configuration, version-migration steps, setup instructions, or a library-specific error message.
  Use this skill when the user names a specific library or framework (React, Next.js, Prisma,
  Express, Tailwind, Django, Spring Boot, a payment-provider SDK, or any other) and the answer
  depends on its current API surface, configuration, upgrade path, or a library-specific error —
  including libraries you know well, since docs move faster than training data.
  Also trigger when the user pastes a library-specific error message or stack trace. Do NOT use for
  refactoring, writing new code/scripts with no specific library involved, business-logic
  debugging, general code review, or programming concepts (algorithms, design patterns) that
  aren't tied to one library's API.
---

# Library Docs (Context7)

Ground any library/framework-specific answer in that library's current documentation instead of
training data, which goes stale the moment a library ships a new release.

## Scope

**Skip this skill** for: refactoring, writing new code/scripts with no specific library involved,
debugging application/business logic, general code review, or programming concepts that aren't
tied to one library's API. Those aren't documentation lookups, and running this skill on them just
adds a detour.

## Cross-reference

For OS/platform SDK questions (Apple/macOS/iOS, Windows, Android) reach for the sibling
`platform-docs` skill instead — it covers the platform-vendor doc MCPs specifically. For the
**Anthropic/Claude SDK (or any LLM-provider SDK)** — model IDs, pricing, the Messages/tool-use API
surface — defer to the `claude-api` skill, which is authoritative there; don't route those to
Context7 or the web. This skill is for third-party libraries and frameworks generally, on any
platform. When this and `platform-docs` could both fire (a third-party SDK inside a native app):
first-party platform APIs go to `platform-docs`, third-party libraries come here, and only a
question genuinely spanning both consults both. Likewise, inside a `system-design` run,
cloud-service facts its step 4 already verifies against the cloud's own docs MCP don't need a
second Context7 pass.

## Procedure (MCP-first, web fallback)

1. **Context7 connected** (any Context7 MCP is available — the claude.ai connector exposes
   `mcp__claude_ai_Context7__resolve-library-id` / `query-docs`; a self-hosted or differently-named
   Context7 server exposes the equivalent `resolve-library-id` / `get-library-docs` pair. Match on
   the tool suffix, not the exact server name, so a non-claude.ai Context7 still counts as present):
   - Call `resolve-library-id` with `libraryName` (the official name, e.g. "Next.js" not "nextjs")
     and `query` (what the user is trying to do) to get the Context7-compatible library ID. Skip
     this step if the user already gave an exact ID in `/org/project` or `/org/project/version`
     form.
   - Call the docs tool (`query-docs`, or `get-library-docs` on the non-claude.ai variant) with that
     `libraryId` and a `query` scoped to **one concept** (e.g. "App Router middleware config", not
     "routing and auth and caching"). Split multi-concept questions into separate calls — up to
     three per question — issuing independent queries in parallel rather than sequentially.
   - Ground your answer in the returned docs.
2. **Context7 unavailable or it errors** (not connected, disconnected mid-session, or the library
   isn't indexed): fall back silently, in order —
   - Fetch the library's official docs site or README/CHANGELOG (prefer the canonical source).
   - Otherwise **search the web** for the specific API/version question if there's no obvious
     canonical doc URL.
   - Only if both come up empty, answer from training knowledge and say so explicitly — flag it as
     possibly stale rather than presenting it with false confidence.
   Never surface the MCP's absence as a blocker to the user; just get the answer another way.

## Examples

<examples>
<example>
Input: "how do I set up middleware in Next.js 15 App Router"
→ `resolve-library-id(libraryName: "Next.js", query: "App Router middleware setup")` →
`query-docs(libraryId: <resolved>, query: "App Router middleware setup")` → answer grounded in the
returned docs, noting version-specific behavior if it differs from older Next.js releases.
</example>
<example>
Input: a pasted stack trace containing "PrismaClientKnownRequestError … code: 'P2002'"
→ the trace names Prisma → `resolve-library-id(libraryName: "Prisma", query: "P2002 unique
constraint violation")` → `query-docs` on unique-constraint error handling → explain the error and
the fix from the current docs.
</example>
<example>
Input: "what does the `retry` option do in ky?" with Context7 not connected
→ fall back silently: fetch ky's official README/docs and answer from it, never surfacing the
MCP's absence as a blocker.
</example>
</examples>
