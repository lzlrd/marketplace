# platform-docs

A skill for [Claude Code](https://github.com/anthropics/claude-code) that grounds platform-API
answers in live, official documentation when developing native applications for **Apple platforms
(macOS, iOS, iPadOS, watchOS, tvOS, visionOS), Windows, or Android**, instead of relying on
training data that goes stale every OS release.

```
You: "what's the SwiftUI-native way to do pull-to-refresh on iOS 18?"   (no command)
        │  skill `platform-docs` auto-engages
        ▼
   1. Identify the platform  ── Apple, from the SwiftUI/iOS mention
   2. Read references/apple.md, only that one
   3. Check the live Apple docs MCP for the current API before answering
```

## Auto-Engagement

The entry point is an auto-invoked skill named `platform-docs`. Claude loads it whenever a
request touches platform-SDK code or OS-specific APIs (UIKit/SwiftUI/AppKit, WinUI/Win32/.NET,
Android/Jetpack) or store-submission and OS-compatibility questions, even when the platform is
only implied by an import statement or project file. It needs no command, and is slash-available
as `/platform-docs:platform-docs` if you want to force it.

Third-party libraries and frameworks used *inside* one of these apps are handled by the sibling
[`library-docs`](../library-docs) skill instead, so the two complement rather than overlap.

## Install

```sh
/plugin marketplace add lzlrd/marketplace
/plugin install platform-docs@lzlrd
```

Restart the session. Check: the `platform-docs` skill shows in the skills list, invokable as
`/platform-docs:platform-docs`.

## Requirements

The plugin bundles no MCP server. Each platform still works without its server, through the web
route in its reference file. Add the ones you build for:

| Platform | Add it |
|---|---|
| Apple | `claude mcp add apple-docs -- npx -y @kimsungwhee/apple-docs-mcp@latest` |
| Windows | `claude mcp add --transport http microsoft-learn https://learn.microsoft.com/api/mcp` |
| Android | An `.mcp.json` entry (below); it needs a Google API key |

```json
{
  "mcpServers": {
    "google-dev-knowledge": {
      "type": "http",
      "url": "https://developerknowledge.googleapis.com/mcp",
      "headers": { "X-Goog-Api-Key": "${GOOGLE_API_KEY}" }
    }
  }
}
```

The key is read from the environment, so it stays out of the file. A server can have any name,
because the skill recognises each one by its tools; Microsoft's own
`microsoft-docs@claude-plugins-official` plugin serves the same tools under another name. As of
November 2026 the Apple server's keyword search returns nothing
([upstream issue](https://github.com/kimsungwhee/apple-docs-mcp/issues/51)), so the skill reaches
pages by URL instead.

## Three Platforms, One Skill

Each platform gets one reference file, read on demand. Only the platforms a question involves are
loaded:

| Platform | MCP |
|---|---|
| macOS, iOS, iPadOS, watchOS, tvOS, visionOS | [Apple docs](https://github.com/kimsungwhee/apple-docs-mcp) |
| Windows | [Microsoft Learn](https://github.com/MicrosoftDocs/mcp) |
| Android | [Google developer knowledge](https://developers.google.com/knowledge/mcp) |

Every reference names a web route (WebFetch/WebSearch against the vendor's own sites) for when
that platform's MCP isn't connected, errors, or doesn't cover the topic, so the skill degrades
gracefully rather than blocking.

## Structure

```
platform-docs/
├── .claude-plugin/
│   └── plugin.json
└── skills/platform-docs/
    ├── SKILL.md             # platform identification + the three-platform table (always loaded)
    └── references/          # loaded on demand, one per platform
        ├── apple.md          # mcp__apple-docs__* tool guide + fallback
        ├── windows.md        # mcp__microsoft-learn__* tool guide + fallback
        └── android.md        # mcp__google-dev-knowledge__* tool guide + fallback
```
