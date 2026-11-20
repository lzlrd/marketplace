---
name: favicons
description: >-
  This skill should be used whenever favicons, app icons, or a site's icon
  branding are involved. Trigger it when the user asks to "generate favicons",
  "add a favicon", "create a favicon set", "turn my logo into favicons/app
  icons", "make icons from this logo/SVG/PNG", "set up site.webmanifest / PWA
  icons / apple-touch-icon", or "check/audit my favicon". Also use it when a
  website being built or shipped is missing a proper favicon set, or when
  producing app-icon assets from a logo. It drives the realfavicon-mcp MCP tools (realfavicon_generate,
  realfavicon_check, realfavicon_changelog) to build a complete favicon and
  app-icon set plus ready-to-paste <head> markup from one master image, audit a
  page's favicon setup, and read RealFaviconGenerator's change-log.
version: 1.1.0
---

# Favicons

Turn one master image (a logo or brand mark) into a complete, correctly-wired
favicon and app-icon set for a website, then verify it. This is the favicon and
app-icon slice of branding — it does not produce full brand systems, but it is
the right tool whenever a site needs icons done properly instead of a single
hand-rolled `favicon.ico`.

The work is done by three MCP tools from the **realfavicon-mcp** server, which
wrap [RealFaviconGenerator](https://realfavicongenerator.net):

| Tool | Purpose |
|------|---------|
| `realfavicon_generate` | Generate the favicon/app-icon files + `<head>` markup from a master image. |
| `realfavicon_check` | Audit a served page's `<head>` for favicon correctness. |
| `realfavicon_changelog` | Read RealFaviconGenerator's API change-log, which ends in 2018. |

In a Claude Code session these appear under the realfavicon-mcp MCP server (the
tool name may be prefixed, e.g. `mcp__…__realfavicon_generate`). If the
`realfavicon_*` tools are not available even though this skill fired, the plugin
is installed but its **bundled MCP server didn't start** — check that Bun (>=1.3)
is on `PATH` and that dependencies fetched, and look at the server's stderr. Only
if the plugin is genuinely missing, install it (`/plugin install
realfavicon-mcp@lzlrd`).

## Core workflow: logo → wired-up favicons

Run these steps in order. Do not hand-author favicon `<link>` tags or resize
icons manually — that is exactly what `realfavicon_generate` exists to prevent.

1. **Pick the master image.** Prefer a square SVG, or a PNG at least 512×512.
   This is the brand logo/mark to derive every icon from. Transparency in the
   master carries through to every icon, and no parameter gives
   `apple-touch-icon.png` or the manifest icons a background of their own. A
   transparent master suits the browser-tab icons. An opaque master is the
   only way to give the touch and manifest icons a solid background, and it
   makes the tab icons opaque too, so tell the user which was chosen. An SVG
   master is copied into `favicon.svg` as it is, scripts and event handlers
   included, so take one only from a source the user trusts.

2. **Decide where the files are served, and set `output_dir` and `path` to
   match.** This is the one thing that breaks favicons most often — see "path
   vs output_dir" below.

3. **Look for an existing `site.webmanifest` in `output_dir`.**
   `realfavicon_generate` replaces it, and the generated manifest holds only
   `name`, `short_name`, `icons`, `theme_color`, `background_color`, and
   `display`, filled from the parameters or the generator's defaults, not
   from the old file. Read the old one first. Pass its `name`, `short_name`,
   `theme_color`, and `background_color` as `app_name`, `short_name`,
   `theme_color`, and `background_color` unless the user wants them changed.
   After generating, restore its `display`, any value a parameter would not
   accept, and every field the generated manifest lacks (`start_url`,
   `scope`, `shortcuts`, …). The result's `overwritten` lists every file the
   run replaced; tell the user when it names one they did not expect.

4. **Call `realfavicon_generate`** with `source`, `output_dir`, `path`, and any
   branding fields (`app_name`, `theme_color`, …). It writes the files and
   returns the markup.

5. **Inject the returned `html` into the page `<head>`,** replacing any
   existing favicon/manifest links so duplicates don't linger.

6. **Verify.** Once the page is reachable from this machine (a local dev
   server counts), run `realfavicon_check` on its URL and resolve any
   errors/warnings. A 404 on the manifest or any icon means `path` and the
   served location disagree, and so does a file reported as answering 200
   with an HTML page: a single-page-app fallback serves the app shell for a
   file that is not there. If nothing serves the site yet, confirm from the
   project's static-file setup that `output_dir` (including
   `site.webmanifest`) is served at `path`, and state that verification is
   still to do.

## `realfavicon_generate`

The tool schema documents every field. Beyond the schema: for branding from a
logo, set `app_name` and the brand `theme_color` / `background_color` so the
manifest and installed-app appearance match the brand, and pass
`dark_icon_source` when the mark needs a distinct dark-mode variant.

### What it emits

A real run writes these files into `output_dir`:

```
favicon.svg
favicon-96x96.png
favicon.ico
apple-touch-icon.png
web-app-manifest-192x192.png
web-app-manifest-512x512.png
site.webmanifest
```

…and returns this `html` (shown with `path: "/"`) for the `<head>`:

```html
<link rel="icon" type="image/png" href="/favicon-96x96.png" sizes="96x96" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<link rel="shortcut icon" href="/favicon.ico" />
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
<link rel="manifest" href="/site.webmanifest" />
```

Note: no `<meta name="theme-color">` tag is generated. `theme_color` lands in
`site.webmanifest`. If a browser-chrome theme color is also wanted, add
`<meta name="theme-color" content="#…">` to the `<head>` manually.

The structured result also includes `output_dir` (the absolute directory
written), `files` (each name + byte size), `overwritten` (the names of files
that were already there and got replaced), `markups` (the link tags as an
array), `css_selectors`, and `webmanifest` (the manifest contents, or null).

### path vs output_dir — the common mistake

`output_dir` says *where on disk* to write; `path` says *what URL prefix* to
bake into the markup. Mismatch them and the browser requests icons that 404.
Match them to the project's static-serving convention:

| Stack | Serve files at | `output_dir` | `path` |
|-------|----------------|--------------|--------|
| Plain static site (root) | site root | the web root dir | `/` |
| Vite / CRA / most SPAs | `public/` → served at `/` | the project's `public/` dir | `/` |
| Next.js (App/Pages) | `public/` → served at `/` | the project's `public/` dir | `/` |
| Served from a subfolder | `/favicons/` | `favicons/` under the web root | `/favicons/` |
| Deployed under a base path | `/app/` | `app/` under the web root | `/app/` |

Pass `output_dir`, `source`, and `dark_icon_source` as absolute paths. A
relative path resolves against the project root Claude Code gives the server
in `CLAUDE_PROJECT_DIR`, not against the working directory: in a worktree
session that root is the main checkout, not the worktree. Without the variable,
or with a relative one, a relative path is refused. Check the `output_dir` the
result reports.

## `realfavicon_check` — audit a page

Use to verify a freshly-wired site, or to assess an existing site's favicon
setup before changing it. It is also the way to judge whether an older site's
favicons still hold up: summarize what it flags and offer to regenerate.

## `realfavicon_changelog` — the change-log up to 2018

Useful when a site still carries favicon markup that RealFaviconGenerator
generated in 2018 or earlier and the user wants to know what changed after
that version, or when the user asks for the change-log itself. The feed ends
in January 2018, so it cannot show whether a setup is current;
`realfavicon_check` does that.