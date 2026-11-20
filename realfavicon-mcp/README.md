# realfavicon-mcp

An MCP server for RealFaviconGenerator. It generates favicon sets from a master image, audits a page's favicon setup, and reads the change-log. It is written in TypeScript, runs on Bun, and speaks MCP over stdio. It ships as a Claude Code plugin in the [lzlrd marketplace](https://github.com/lzlrd/marketplace), with a `favicons` skill that drives the tools.

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

This directory is the plugin. There is no build step: Claude Code runs the server straight from source with [Bun](https://bun.sh), which fetches dependencies on first launch.

```
/plugin marketplace add lzlrd/marketplace
/plugin install realfavicon-mcp@lzlrd
```

The three tools then appear over MCP. The bundled `favicons` skill engages on favicon and app-icon requests, or run it as `/realfavicon-mcp:favicons`.

## Tools

| Tool | Purpose | Inputs |
|------|---------|--------|
| `realfavicon_generate` | Generate a full favicon set (PNG, ICO, SVG, webmanifest) plus HTML markup from a master image. Files of the same name in `output_dir` are replaced, and the result lists them in `overwritten`. If a write fails partway, the error names the files already written and replaced. If a file of a generated name in `output_dir` is a symlink, nothing is written. | `source` (absolute path or URL), `output_dir` (absolute path), optional: `path`, `app_name`, `short_name`, `theme_color`, `background_color`, `app_title`, `version`, `dark_icon_source` |
| `realfavicon_check` | Audit a served page's favicon setup; returns per-platform messages and icon metadata. A file that cannot be fetched or read is an error message naming it, not a failed call. | `url` (page URL), optional: `include_icon_data` (default `false`; icon bytes, `desktop.icon` included, are returned only when it is on) |
| `realfavicon_changelog` | Fetch the RealFaviconGenerator API change-log, optionally filtered to changes after a given version. The feed ends at version 0.16 (January 2018). | optional: `since` (one of the feed's 16 versions, `0.1` to `0.9` then `0.10` to `0.16`; any other value is an error), `format` (`markdown` or `html`, default `markdown`) |

Pass local paths as absolute paths. A relative path resolves against `CLAUDE_PROJECT_DIR`, the project root Claude Code gives the server, which in a worktree session is the main checkout. Without that variable, or with a relative one, a relative path is refused, because the server's working directory under Claude Code is the plugin's install directory, not your project.

`realfavicon_check` and URL sources fetch from the machine the server runs on, so localhost and LAN addresses work. Link-local addresses (`169.254.0.0/16`, `fe80::/10`) and the metadata addresses `100.100.100.200`, `fd00:ec2::254`, `fd20:ce::254` and `fd00:c1::a9fe:a9fe` are refused on every request, redirects included. The IPv4 ones are also refused inside an IPv4-mapped, NAT64 (`64:ff9b::/96`) or 6to4 IPv6 address. A host name is checked against the addresses it resolves to before each request, so a name that resolves elsewhere for the request itself (DNS rebinding) is not caught. Each file the check fetches has 10 seconds to answer, name lookup included, and the whole check 60.

## Develop

```sh
bun run dev    # watch mode
bun test       # run the test suite
bun run start  # start the server
```
