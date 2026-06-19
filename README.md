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
| [`4man`](./4man) | A four-role dev crew: a Planner, parallel Coders and Testers, and a fan-out Reviewer. |
| [`offshore`](./offshore) | Run a local abliterated model to answer prompts Claude refuses, over MCP. |
| [`fableplan`](./fableplan/plugins/fableplan) | Plan with Fable 5, execute with Opus. Tracked as a submodule of the [`lzlrd/fableplan`](https://github.com/lzlrd/fableplan) fork. |

`fableplan` is a git submodule. Clone with `git clone --recurse-submodules`, or run `git submodule update --init` after cloning.
