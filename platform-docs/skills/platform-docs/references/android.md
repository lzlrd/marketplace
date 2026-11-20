# Android

## MCP tools (`mcp__google-dev-knowledge__*`)

This server's corpus is broader than Android alone (it also covers Firebase, Flutter, Dart,
Chrome, Google Cloud, web.dev, and more — the `system-design` skill in this same marketplace uses
it for Google Cloud). Scope queries here to Android, Jetpack, and Kotlin/Java-for-Android.

- **`search_documents(query)`** — raw matching chunks plus document names, quota-friendlier than
  `answer_query`. The default for what this skill verifies: API names, signatures, code samples,
  error text, and availability.
- **`get_documents(names)`** — full content of up to 20 documents at once, using the `parent`
  field from a `search_documents` result or the `references` field from an `answer_query` result.
  Reach for this when the returned chunks aren't enough — e.g. a long guide where you need the
  full page.
- **`answer_query(query)`** — a synthesized, grounded answer plus the source documents used to
  generate it. For a high-level conceptual question. **Has limited quota** — fall back to
  `search_documents` on a 429. It draws on the same corpus as `search_documents`, so don't call
  it after a search that found nothing.

## Typical flow

`search_documents` → `get_documents` for the full page when chunks fall short. `answer_query`
only for a conceptual overview (mind the quota).

## Availability

Platform (`android.*`) reference pages mark each class and member "Added in API level N" and,
where it applies, "Deprecated in API level N": compare these with the app's `minSdk` when a
minimum OS version is in play. Jetpack (`androidx.*`) pages give the library version instead
("Added in 1.6.0").

## Store submission

Play requirements that `developer.android.com` restates are in the corpus, for example
`developer.android.com/google/play/requirements/target-sdk`. Play Console Help and the Developer
Program Policy live on `support.google.com/googleplay/android-developer`, which the corpus does
not include: use WebSearch/WebFetch there, or on
`https://developer.android.com/distribute/play-policies`, before calling a policy undocumented.

## Fallback

WebFetch the page directly under `https://developer.android.com/...`, or WebSearch
`site:developer.android.com <topic>`.
