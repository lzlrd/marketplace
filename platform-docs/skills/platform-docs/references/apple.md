# Apple Platforms (macOS · iOS · iPadOS · watchOS · tvOS · visionOS)

## MCP tools (`mcp__apple-docs__*`)

Primary workflow:

- **`search_apple_docs(query, type)`** — keyword search across all frameworks. Checked on
  2026-11-19 (server 1.0.26, upstream issue #51), it returned zero results for every query,
  "UIViewController" and "SwiftUI List" included, so an empty result is not evidence that an API
  is missing: reach the page by URL or through `search_framework_symbols` instead (see Typical
  flow). If a later server release restores it, query with specific API/class/framework names
  ("UIViewController", "SwiftUI List", "URLSession authentication"), not generic phrases like
  "how to". `type: "sample"` returns code snippets, not full projects — use `get_sample_code` for
  those.
- **`get_apple_doc_content(url, includePlatformAnalysis, includeReferences, includeRelatedApis,
  includeSimilarApis)`** — full content of a documentation page, given its URL
  (`https://developer.apple.com/documentation/<framework>/<symbol>`, lowercase). A URL that
  matches no page fails with an explicit 404. An overloaded member can have a page per overload,
  the others under a hash suffix (`.../swiftui/text/init(_:)-9d1g4`); the unsuffixed URL returns
  one overload without an error, with that overload's availability, so check the declaration on
  the returned page. WebSearch `site:developer.apple.com <symbol>` listed the other overloads'
  pages when checked (`navigationTitle(_:)`). Turn on
  `includePlatformAnalysis` whenever OS-version availability matters; `includeSimilarApis` when
  the user might want an alternative.
- **`get_platform_compatibility(apiUrl, compareMode, includeRelated)`** — minimum deployment
  target, deprecations, platform-specific gaps. Check this before recommending an API into an app
  with a stated minimum OS version — an API existing doesn't mean it's on the user's target.
- **`get_sample_code(searchQuery, framework, beta, limit)`** — complete sample *projects*, not
  snippets. Use when the user wants a worked example, not just a signature.
- **`search_framework_symbols(framework, namePattern, symbolType, language)`** — browse everything
  in a framework, e.g. every `*View` struct in `swiftui`, or every delegate protocol in `uikit`.
  Get the exact framework identifier from `list_technologies` first if unsure. Also the way to
  find one type's page: an exact `namePattern` with a `symbolType` (`swiftui`, `List`,
  `struct`) returns the type with its URL. Members are not listed reliably (checked:
  `viewDidLoad*` in `uikit` and `navigationTitle*` in `swiftui` returned nothing).
- **`list_technologies(category, includeBeta, language)`** — discover framework identifiers and
  browse Apple's technology catalog by category ("App frameworks", "Graphics and games", "App
  services", "Media", "System", ...).

Secondary (reach for these less often):

- **WWDC tools** — `list_wwdc_years`, `list_wwdc_videos`, `browse_wwdc_topics`,
  `search_wwdc_content`, `get_wwdc_video`, `get_wwdc_code_examples`, `find_related_wwdc_videos` —
  use when the question is specifically about a WWDC session, "what changed in WWDC 20XX", or the
  user wants a video walkthrough rather than reference docs. The WWDC data ships with the server
  rather than being fetched live (on 2026-11-19 `list_wwdc_years` ended at 2025): check that list
  when the year matters, and use the web (`https://developer.apple.com/videos/`) for a year it
  lacks.
- **`get_technology_overviews(category, platform, searchQuery)`** — Apple's catalog of
  conceptual overview articles (interface, data management, distribution, and so on), for "where
  do I start" and "which technology fits" questions. Call it without filters (its `category` and
  `searchQuery` filters returned nothing when checked) and read the article it links with
  `get_apple_doc_content`.
- **`find_similar_apis` / `get_related_apis`** — alternatives and inheritance/protocol-conformance
  relationships, for "what else could I use instead" or "what does this conform to" questions.
- **`resolve_references_batch`** — resolve several referenced types/APIs from one doc page at
  once, instead of one `get_apple_doc_content` call per reference.
- **`get_documentation_updates`** — recent doc changes, useful for "what's new" or "did this
  change recently" questions.

## Typical flow

Find the page — build its URL when the framework and symbol are known, otherwise
`search_framework_symbols`, or WebSearch `site:developer.apple.com <term>` when the framework is
unknown too → `get_apple_doc_content` (with `includePlatformAnalysis` on if a minimum OS
version is in play) → `get_platform_compatibility` before shipping the recommendation → optionally
`get_sample_code` for a full worked example.

## Store submission

Submission mechanics documented under `/documentation/xcode/` (archiving, uploading, TestFlight)
are on the server. App Review policy and App Store Connect procedures are not, because
`get_apple_doc_content` reads only `/documentation/` URLs. Use the web for those: the App Review
Guidelines at `https://developer.apple.com/app-store/review/guidelines/` and App Store Connect
Help at `https://developer.apple.com/help/app-store-connect/`.

## Fallback

Apple's documentation pages are JavaScript-rendered, so WebFetch of
`https://developer.apple.com/documentation/...` returns only the page title. Fetch the Markdown
variant instead by appending `.md` to the page URL
(`https://developer.apple.com/documentation/swiftui/list.md`). WebSearch
`site:developer.apple.com <API or framework name>` finds the page, and often returns the `.md`
URL itself. The Markdown header lists availability per platform as `iOS: 13.0.0 -`; a closed
range (`iOS: 2.0.0 - 12.0.0`) means the API was deprecated at the second version. When the
replacement matters, `https://developer.apple.com/tutorials/data/documentation/<path>.json`
carries `deprecatedAt` and a `deprecationSummary`.
