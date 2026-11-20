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

## Cross-reference

For OS/platform SDK questions (Apple/macOS/iOS, Windows, Android) reach for the sibling
`platform-docs` skill when it is installed — it covers the platform-vendor doc MCPs specifically;
without it, handle them here. For the **Claude API and Anthropic SDKs** — model IDs, pricing, the
Messages/tool-use API surface — defer to the `claude-api` skill when it is available, since it is
authoritative there; without it, handle them here. Every other LLM provider's SDK (OpenAI, Gemini,
Mistral, Ollama, and the rest) is an ordinary third-party library and belongs here. This skill is
for third-party libraries and frameworks generally, on any platform. When this and `platform-docs`
could both fire (a third-party SDK inside a native app): first-party platform APIs go to
`platform-docs`, third-party libraries come here, and only a question genuinely spanning both
consults both. Likewise, inside a `system-design` run, cloud-service facts that skill has already
verified against the cloud's own docs MCP don't need a second Context7 pass.

## Procedure (MCP-first, web fallback)

1. **Context7 connected** (a `resolve-library-id` tool and a `query-docs` tool are available. Match
   on the tool names, not the server name: the server can be registered under any name, and a
   connector often appears under an opaque ID):
   - Call `resolve-library-id`, then `query-docs` with the resolved ID. The tools' own descriptions
     say how to call them (parameters, query scope, call limit); the points below add to them.
   - Settle the version before querying. Take it from the question, or else from the project's
     manifest or lockfile. When the resolve result lists a matching entry under Versions, query
     `/org/project/<version>`: map a bare major such as "15" to the highest stable tag of that
     major, and skip canary and branch entries. The bare ID is not pinned to a release (for
     Next.js it serves the canary branch), so when no listed version matches, say which version
     the returned docs describe.
   - For a pasted error or stack trace, name the library the trace points to and query by its
     error code or message, not the whole trace.
   - Ground the answer in the returned docs.
2. **Context7 unavailable or it errors** (not connected, disconnected mid-session, or the library
   isn't indexed): take the web route, in order —
   - Fetch the library's official docs site or README/CHANGELOG (prefer the canonical source).
   - Otherwise **search the web** for the specific API/version question if there's no obvious
     canonical doc URL.
   - Only if both come up empty, answer from training knowledge and say so explicitly — flag it as
     possibly stale rather than presenting it with false confidence.
   A missing or failing Context7 doesn't block the answer, so don't present it as a blocker; just
   get the answer another way.
