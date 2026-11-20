# marketplace

Diab Neiroukh's Claude Code plugins in one place. Add the marketplace once, then install any plugin from it.

## Install

```
/plugin marketplace add lzlrd/marketplace
/plugin install <plugin>@lzlrd
```

## Plugins

| Plugin | What it does |
| --- | --- |
| [`mempalace-hooks`](./mempalace-hooks) | Wires the mempalace memory server into Claude Code: three hooks, a managed `CLAUDE.md` block, a `match-style` skill, a session diary, and a `/mempalace-hooks:remember` handoff. Durable cross-session memory over the mempalace MCP, or the `mempalace` CLI when the MCP isn't connected. |
| [`system-design`](./system-design) | Cloud-agnostic system design across AWS, Azure, Cloudflare, and Google Cloud, grounded in the Well-Architected frameworks. |
| [`4man`](./4man) | A four-role dev crew (a Planner, parallel Coders and Testers, and a fan-out Reviewer) run as a Claude Code agent team. Needs the experimental agent-teams feature; works best with the Task tools enabled. |
| [`realfavicon-mcp`](./realfavicon-mcp) | Generate and check favicons via RealFaviconGenerator over MCP, with a `favicons` skill that drives the tools. Needs Bun >= 1.3 on your `PATH`. |
| [`offshore`](./offshore) | Run a local abliterated model to answer prompts Claude refuses, over MCP. |
| [`prompting`](./prompting) | Write, optimise, or migrate a prompt for a specific Claude, Gemini, or GPT model, tuned to that model's documented behaviour. Works offline from a mirror of each vendor's prompting guides, and says when the fix is a request setting rather than prompt text. |
| [`reload-claude-md`](./reload-claude-md) | Re-read your edited `CLAUDE.md` files from disk and re-anchor the running session to their current content, so mid-session edits take effect without a restart. Read-only; invoke with `/reload-claude-md`. |
| [`export-skills`](./export-skills) | Work out which locally-installed skills can run in Claude Desktop / claude.ai, then package the qualifiers into upload-ready zips. A skill that breaks a claude.ai upload rule is reported with the reason and gets no zip. Lenient by default; `--strict` drops the sandbox skills. Invoke with `/export-skills`. |
| [`platform-docs`](./platform-docs) | Ground platform-API answers in live official docs - Apple docs, Microsoft Learn, and Google's developer knowledge base - when building for macOS, iOS, any Apple platform, Windows, or Android. |
| [`library-docs`](./library-docs) | Fetch current, version-accurate docs for any library, framework, SDK, or CLI tool via Context7, with a web fallback when it isn't connected or can't answer. |
| [`semver`](./semver) | Decide the next version number under Semantic Versioning 2.0.0 - MAJOR, MINOR, or PATCH - grounded in a bundled copy of the spec. |
| [`skill-rigor`](./skill-rigor) | Quality gate for skill authoring: skill creation and edits run at maximum reasoning effort, via a bundled max-effort agent when the session runs lower, and are cross-checked against skill-creator and skill-development when installed. |
