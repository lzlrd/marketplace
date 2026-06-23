# realfavicon-mcp

An MCP server for RealFaviconGenerator. It generates favicon sets from a master image, audits a live page's favicon setup, and reads the change-log. It is written in TypeScript, runs on Bun, and speaks MCP over stdio. The repo is also a Claude Code plugin.

## Requirements

Bun >= 1.3 on your `PATH`.

## MCP Server

Install dependencies and start the server:

```sh
bun install
bun run start
```

Wire it into any MCP client, such as Claude Desktop.

## Claude Code Plugin

The repo is itself the plugin. There is no build step: Claude Code runs the server straight from source with [Bun](https://bun.sh), which fetches dependencies on first launch.

```
/plugin marketplace add lzlrd/marketplace
/plugin install realfavicon-mcp@lzlrd
```

The three tools then appear over MCP.

## Tools

| Tool | Purpose | Inputs |
|------|---------|--------|
| `realfavicon_generate` | Generate a full favicon set (PNG, ICO, SVG, webmanifest) plus HTML markup from a master image. | `source` (path or URL), `output_dir`, optional: `path`, `app_name`, `short_name`, `theme_color`, `background_color`, `app_title`, `version`, `dark_icon_source` |
| `realfavicon_check` | Audit a live page's `<head>` for favicon correctness; returns per-platform messages and icon metadata. | `url` (page URL), optional: `include_icon_data` (default `false`) |
| `realfavicon_changelog` | Fetch the RealFaviconGenerator change-log, optionally filtered to changes after a given version. | optional: `since` (version string), `format` (`markdown` or `html`, default `markdown`) |

## Develop

```sh
bun run dev    # watch mode
bun test       # run the test suite
bun run start  # start the server
```
