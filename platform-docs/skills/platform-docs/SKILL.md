---
name: platform-docs
description: >
  Ground platform-API answers in live, official documentation instead of training data when
  developing native applications for Apple platforms (macOS, iOS, iPadOS, watchOS, tvOS,
  visionOS), Windows, or Android. Use whenever the user writes, reviews, debugs, or asks about
  platform-SDK code, OS-specific APIs, UIKit/SwiftUI/AppKit/WatchKit, WinUI/Win32/.NET/WinRT,
  Android/Jetpack/Kotlin APIs, App Store/Play Store/Microsoft Store submission questions,
  minimum-OS-version or deployment-target compatibility, or "which native API should I use for
  X" on any of these platforms — even when the platform isn't named explicitly but the code
  clearly targets one (`import UIKit`, `import SwiftUI`, `using Microsoft.UI`, `androidx.*`,
  `.xcodeproj`, `.xcworkspace`, `AndroidManifest.xml`). Use it especially when the answer depends
  on the current API surface — anything shipped, changed, or deprecated in recent OS releases
  (WWDC, Build, Google I/O), or where minimum-OS availability matters.
---

# Platform Docs (Apple · Windows · Android)

Native-platform SDKs move fast and deprecate aggressively. Check the matching vendor's
documentation MCP whenever the answer could have changed since training — recently shipped or
changed APIs, deprecations, or OS-version availability — the live docs are one tool call away.

## How to use

1. **Identify the target platform** from the request: explicit mention, import/using statements,
   file/project type (`.xcodeproj`, `.swift`, `.gradle`, `AndroidManifest.xml`, `.xaml`,
   `.csproj`), or ask once if it's genuinely ambiguous and the answer depends on it.
2. **Read the reference file for each platform the question involves, and no others.** Each
   covers its platform's MCP tools, when to reach for which, and the web route to take when the
   MCP can't answer.
3. **Verify before answering.** Confirm current API names, availability, and sample usage with
   the tools. When the user cares about a minimum OS version, also confirm the API is available
   on that deployment target, not just that it exists.
4. **Third-party libraries are a different skill.** A third-party CocoaPod, Swift Package, Gradle
   dependency, or NuGet package used *inside* one of these apps is not an OS API — that's the
   sibling `library-docs` skill (Context7-backed) when it is installed; without it, look the
   library up on the web. The platform vendor's own packaged SDKs (Jetpack/`androidx.*`, the
   Windows App SDK/WinUI) are first-party and stay here. First-party platform APIs resolve here;
   third-party libraries resolve there — consult both only when a question genuinely spans both.

## Platforms

| Platform | Reference | MCP |
|---|---|---|
| macOS, iOS, iPadOS, watchOS, tvOS, visionOS | `references/apple.md` | `mcp__apple-docs__*` |
| Windows | `references/windows.md` | `mcp__microsoft-learn__*` |
| Android | `references/android.md` | `mcp__google-dev-knowledge__*` |

The names in the MCP column are the usual ones. A server registered under another name still
counts: recognize it by its tools (`get_apple_doc_content`; `microsoft_docs_search`;
`search_documents` with `get_documents`).

Reach for the platform's MCP first, including the other tools its reference file names when one
fails. When the server still can't answer — its tools aren't available in this session, calls
error or run out of quota, searches come back empty, or the topic sits outside what the server
covers — take the web route its reference file names (WebFetch/WebSearch against the vendor's
own sites), and don't report something as undocumented until that route has been tried. A missing
or failing MCP doesn't block the answer, so don't present it as a blocker. If neither route
reaches the vendor's docs, answer from training knowledge and say in a few words that it may be
stale.