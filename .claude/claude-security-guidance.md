# Security guidance

Repo-wide security policy for the `lzlrd` marketplace and the plugins it ships. It is codebase-specific: the committed file `/security-review` and the 4man crew read before reviewing a change here.

## Scope

The marketplace vendors five plugins as source (`mempalace-hooks`, `system-design`, `4man`, `realfavicon-mcp`, `offshore`) and tracks `fableplan` as a submodule. Three of them carry a real security surface: two MCP servers that run code on Bun (`realfavicon-mcp`, `offshore`) and one plugin that registers shell hooks (`mempalace-hooks`). The rest are skills and agent definitions with no runtime of their own. The sections below cover the parts that matter.

## realfavicon-mcp

Every tool input arrives from an MCP client (often LLM-driven) and is untrusted: `source`, `dark_icon_source`, `output_dir` (`realfavicon_generate`); `url` (`realfavicon_check`); `since`, `format` (`realfavicon_changelog`). Validate at the boundary with each tool's zod `inputSchema` (hex colours are regex-checked, `url` is `z.string().url()`). Do not loosen these. Every handler wraps its body in try/catch and returns `{ isError: true }` rather than throwing out of the process.

`realfavicon_generate`, `realfavicon_check`, and `realfavicon_changelog` all issue outbound `fetch` on caller-supplied URLs, so server-side request forgery is inherent to the tool's purpose. Contain it:

- Do not follow non-`http(s)` schemes. `fetch` rejects them by default; do not add scheme-relaxing or redirect-following to `file://` and similar.
- Do not echo internal response headers or bodies beyond what each tool contract returns.
- This server runs locally with the invoking user's privileges, not as a hosted multi-tenant service. If it is ever exposed as a network service, add an allow-list and block private and link-local IP ranges before shipping.

On the filesystem: `realfavicon_generate` writes to the caller-supplied `output_dir`, but the filenames come from the RFG library (a fixed set: `favicon*.png`, `favicon.ico`, `favicon.svg`, `site.webmanifest`, `web-app-manifest-*.png`), not from caller input, so there is no filename-driven path traversal. Temp downloads use `tmpdir()` plus `crypto.randomUUID()` and are unlinked in a `finally` on both success and error. Keep the cleanup; never write temp files to predictable paths.

The server needs no API keys (the RFG npm libraries and the change-log endpoint are unauthenticated). Do not add credential handling, and never log request URLs or bodies that could carry user data.

## offshore

Offshore forwards prompts to a local uncensored model on purpose. That filter bypass is the tool's stated function and the user's own choice. Keep it a local tool run with the user's privileges, never a hosted multi-tenant service. Provider credentials come from the environment (`env_key` per provider, or `OFFSHORE_API_KEY`): never log request URLs, bodies, headers, or keys.

## mempalace-hooks

Both hooks run `set -uo pipefail`, always exit 0, and emit plain text only, so a hook failure cannot break a session (fail-open). `session_id` feeds marker and `rm` paths, so it is stripped to `[A-Za-z0-9_-]` before use to block `../` traversal. The hooks read and write only their own state directory and inject text; they never execute model output.

## General

- The stdio transport owns stdout on both MCP servers. Never write non-protocol output to stdout (`console.log`); it corrupts the JSON-RPC stream. Diagnostics go to stderr only.
- Validate every MCP tool input at the boundary with its zod schema.
- No `eval`, no shell execution of caller-controlled input, no dynamic `import()` of caller-controlled paths.
- `sharp` (realfavicon-mcp, via `image-adapter-node` and `check-favicon`) is a native dependency: keep it patched and review it on every bump. `node-html-parser` is pinned to `^6.1.13` to match `check-favicon`.
