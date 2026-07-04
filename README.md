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
| [`mempalace-hooks`](./mempalace-hooks) | Wires the mempalace MCP memory server into Claude Code: two directive hooks and a managed `CLAUDE.md` block for durable, cross-session memory. |
| [`system-design`](./system-design) | Cloud-agnostic system design across AWS, Azure, and Google Cloud, grounded in the Well-Architected frameworks. |
| [`4man`](./4man) | A four-role dev crew: a Planner, parallel Coders and Testers, and a fan-out Reviewer. |
| [`realfavicon-mcp`](./realfavicon-mcp) | Generate, check, and track favicons via RealFaviconGenerator, over MCP. |
| [`offshore`](./offshore) | Run a local abliterated model to answer prompts Claude refuses, over MCP. |
| [`prompt-engineering`](./prompt-engineering) | Turn a description into an optimized, ready-to-paste LLM prompt, grounded in the promptingguide.ai guide. Works offline via a bundled reference. |
| [`also`](./also) | Dispatch a side task to a separate fork sub-agent at your session's power level — effort (incl. max), ultracode, and full context — the action-counterpart to the built-in `/btw`. Invoke with `/also`. |
| [`fableplan`](https://github.com/lzlrd/fableplan/tree/main/plugins/fableplan) | Plan with Fable 5, execute with Opus: an opusplan-style dual-model setup. Toggle with `/fableplan`. |
