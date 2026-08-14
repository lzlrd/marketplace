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
changed APIs, deprecations, or OS-version availability — it's one tool call away and current
as of today.

## How to use

1. **Identify the target platform** from the request: explicit mention, import/using statements,
   file/project type (`.xcodeproj`, `.swift`, `.gradle`, `AndroidManifest.xml`, `.xaml`,
   `.csproj`), or ask once if it's genuinely ambiguous and the answer depends on it.
2. **Read the matching reference file below — only that one.** Each covers its platform's MCP
   tools, when to reach for which, and the fallback if that MCP isn't connected.
3. **Verify before answering.** Confirm current API names, availability, and sample usage with
   the tools, especially for anything shipped or changed in the last year or two. When the user
   cares about a minimum OS version, also confirm the API is available on that deployment
   target, not just that it exists.
4. **Third-party libraries are a different skill.** A specific CocoaPod, Swift Package, Gradle
   dependency, or NuGet package used *inside* one of these apps is not an OS API — that's the
   sibling `library-docs` skill (Context7-backed). First-party platform APIs resolve here;
   third-party libraries resolve there — consult both only when a question genuinely spans both.

## Platforms

| Platform | Reference | MCP |
|---|---|---|
| macOS, iOS, iPadOS, watchOS, tvOS, visionOS | `references/apple.md` | `mcp__apple-docs__*` |
| Windows | `references/windows.md` | `mcp__microsoft-learn__*` |
| Android | `references/android.md` | `mcp__google-dev-knowledge__*` |

Reach for the platform's MCP first; if its tools aren't available in this session, fall back
silently — never tell the user an MCP is missing as though it blocks the answer. Each reference
file names the fallback (WebFetch/WebSearch against the vendor's own docs site).