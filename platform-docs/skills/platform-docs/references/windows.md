# Windows

## MCP tools (`mcp__microsoft-learn__*`)

- **`microsoft_docs_search(query)`** — the entry point. Returns up to 10 content chunks (max ~500
  tokens each) from Microsoft Learn and other official sources, each with title, URL, and excerpt.
  Covers Win32, WinUI, .NET, WinRT, PowerShell, and the rest of the Microsoft stack, not just
  Azure.
- **`microsoft_docs_fetch(url)`** — fetches and converts a full Microsoft Learn page to markdown.
  Use after search when a result looks highly relevant but the excerpt is incomplete, or the user
  needs a complete step-by-step procedure, prerequisites, or a troubleshooting section.
- **`microsoft_code_sample_search(query, language)`** — dedicated code-sample search across
  official docs. Set `language` (csharp, cpp, powershell, javascript, typescript, python, java,
  go, rust, ruby, php, sql, kusto, al, azurecli) when generating code — it measurably improves
  results.

## Typical flow

`microsoft_docs_search` for the overview → `microsoft_docs_fetch` on the best hit for full detail
→ `microsoft_code_sample_search` when the task is to generate or review code, not just explain a
concept.

## Availability

Win32 reference pages end with a Requirements table (minimum supported client and server, header,
library); `microsoft_docs_fetch` returns it with the page. WinRT reference pages list the device
family with the build that introduced the API, and its API contract.

## Fallback

WebFetch the page directly under `https://learn.microsoft.com/...`, or WebSearch
`site:learn.microsoft.com <topic>`.
