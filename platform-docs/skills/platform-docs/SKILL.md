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
  `.xcodeproj`, `.xcworkspace`, `AndroidManifest.xml`). Trigger even for platform questions that
  feel "well known" — OS APIs change every release (WWDC, Build, Google I/O) and training data
  goes stale fast, so check the live docs MCP before answering from memory.
---

# Platform Docs (Apple · Windows · Android)

Native-platform SDKs move fast and deprecate aggressively. Before answering a platform-API
question from memory, check the matching vendor's documentation MCP — it's one tool call away
and is current as of today, not as of training.

## How to use

1. **Identify the target platform** from the request: explicit mention, import/using statements,
   file/project type (`.xcodeproj`, `.swift`, `.gradle`, `AndroidManifest.xml`, `.xaml`,
   `.csproj`), or ask once if it's genuinely ambiguous and the answer depends on it.
2. **Read the matching reference file below — only that one.** Each covers its platform's MCP
   tools, when to reach for which, and the fallback if that MCP isn't connected.
3. **Verify before answering.** Use the tools to confirm current API names, availability, and
   sample usage rather than asserting from training data, especially for anything shipped or
   changed in the last year or two.
4. **Third-party libraries are a different skill.** A specific CocoaPod, Swift Package, Gradle
   dependency, or NuGet package used *inside* one of these apps is not an OS API — that's the
   sibling `library-docs` skill (Context7-backed). Let both trigger together when relevant; don't
   duplicate library-specific lookups here.

## Platforms

| Platform | Reference | MCP |
|---|---|---|
| macOS, iOS, iPadOS, watchOS, tvOS, visionOS | `references/apple.md` | `mcp__apple-docs__*` |
| Windows | `references/windows.md` | `mcp__microsoft-learn__*` |
| Android | `references/android.md` | `mcp__google-dev-knowledge__*` |

All three MCPs are checked for connectivity before use, silently — never tell the user an MCP is
missing as though it blocks the answer. If a platform's MCP isn't connected, each reference file
names the fallback (WebFetch/WebSearch against the vendor's own docs site).

## Common mistakes to avoid

- **Answering from memory when the MCP is connected and one call away.** Platform APIs are
  exactly the kind of fact that goes stale between training cutoffs.
- **Loading more than one reference file for a single-platform question.** Read the one that
  matches; don't front-load all three.
- **Treating a third-party library question as a platform-API question.** OS/SDK-level APIs live
  here; everything else is `library-docs`.
- **Skipping platform-compatibility checks** when the user cares about a minimum OS version —
  an API that exists doesn't mean it's available on their deployment target.
