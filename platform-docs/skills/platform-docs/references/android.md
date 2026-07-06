# Android

## MCP tools (`mcp__google-dev-knowledge__*`)

This server's corpus is broader than Android alone (it also covers Firebase, Flutter, Dart,
Chrome, Google Cloud, web.dev, and more — the `system-design` skill in this same marketplace uses
it for Google Cloud). Scope queries here to Android, Jetpack, and Kotlin/Java-for-Android.

- **`answer_query(query)`** — a synthesized, grounded answer plus the source documents used to
  generate it. Prefer this for a direct question. **Has limited quota** — fall back to
  `search_documents` on a 429.
- **`search_documents(query)`** — raw matching chunks plus document names, quota-friendlier than
  `answer_query`. Good for browsing or when quota is a concern.
- **`get_documents(names)`** — full content of up to 20 documents at once, using the `parent`
  field from a prior `search_documents` call. Reach for this when the returned chunks aren't
  enough — e.g. a long guide where you need the full page.

## Typical flow

`answer_query` for a direct question (mind the quota) → `search_documents` for browsing or once
quota is tight → `get_documents` for the full page when chunks fall short.

## Fallback (MCP not connected)

WebFetch the page directly under `https://developer.android.com/...`, or WebSearch
`site:developer.android.com <topic>`.
