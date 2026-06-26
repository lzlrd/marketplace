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
| [`4man`](./4man) | A four-role dev crew: a Planner, parallel Coders and Testers, and a fan-out Reviewer. |
| [`realfavicon-mcp`](./realfavicon-mcp) | Generate, check, and track favicons via RealFaviconGenerator, over MCP. |
| [`offshore`](./offshore) | Run a local abliterated model to answer prompts Claude refuses, over MCP. |
| [`fableplan`](./fableplan/plugins/fableplan) | Plan with Fable 5, execute with Opus. Tracked as a submodule of the [`lzlrd/fableplan`](https://github.com/lzlrd/fableplan) fork. |

`fableplan` is a git submodule. Clone with `git clone --recurse-submodules`, or run `git submodule update --init` after cloning.
