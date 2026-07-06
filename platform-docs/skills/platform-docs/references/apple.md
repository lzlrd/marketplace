# Apple Platforms (macOS · iOS · iPadOS · watchOS · tvOS · visionOS)

## MCP tools (`mcp__apple-docs__*`)

Primary workflow:

- **`search_apple_docs(query, type)`** — the entry point. Use specific API/class/framework names
  ("UIViewController", "SwiftUI List", "URLSession authentication"), not generic phrases like
  "how to". `type: "sample"` returns code snippets, not full projects — use `get_sample_code` for
  those.
- **`get_apple_doc_content(url, includePlatformAnalysis, includeReferences, includeRelatedApis,
  includeSimilarApis)`** — full content of a page found via search. Turn on
  `includePlatformAnalysis` whenever OS-version availability matters; `includeSimilarApis` when
  the user might want an alternative.
- **`get_platform_compatibility(apiUrl, compareMode, includeRelated)`** — minimum deployment
  target, deprecations, platform-specific gaps. Check this before recommending an API into an app
  with a stated minimum OS version — an API existing doesn't mean it's on the user's target.
- **`get_sample_code(searchQuery, framework, beta, limit)`** — complete sample *projects*, not
  snippets. Use when the user wants a worked example, not just a signature.
- **`search_framework_symbols(framework, namePattern, symbolType, language)`** — browse everything
  in a framework, e.g. every `*View` struct in `swiftui`, or every delegate protocol in `uikit`.
  Get the exact framework identifier from `list_technologies` first if unsure.
- **`list_technologies(category, includeBeta, language)`** — discover framework identifiers and
  browse Apple's technology catalogue by category ("App frameworks", "Graphics and games", "App
  services", "Media", "System", ...).

Secondary (reach for these less often):

- **WWDC tools** — `list_wwdc_years`, `list_wwdc_videos`, `browse_wwdc_topics`,
  `search_wwdc_content`, `get_wwdc_video`, `get_wwdc_code_examples`, `find_related_wwdc_videos` —
  use when the question is specifically about a WWDC session, "what changed in WWDC 20XX", or the
  user wants a video walkthrough rather than reference docs.
- **`find_similar_apis` / `get_related_apis`** — alternatives and inheritance/protocol-conformance
  relationships, for "what else could I use instead" or "what does this conform to" questions.
- **`resolve_references_batch`** — resolve several referenced types/APIs from one doc page at
  once, instead of one `get_apple_doc_content` call per reference.
- **`get_documentation_updates`** — recent doc changes, useful for "what's new" or "did this
  change recently" questions.

## Typical flow

`search_apple_docs` → `get_apple_doc_content` (with `includePlatformAnalysis` on if a minimum OS
version is in play) → `get_platform_compatibility` before shipping the recommendation → optionally
`get_sample_code` for a full worked example.

## Fallback (MCP not connected)

WebFetch the page directly under `https://developer.apple.com/documentation/...`, or WebSearch
`site:developer.apple.com <API or framework name>`. If the API is recent (last year or two), say
the answer may be less current than a live lookup would give.
