---
name: favicons
description: >-
  This skill should be used whenever favicons, app icons, or a site's icon
  branding are involved. Trigger it when the user asks to "generate favicons",
  "add a favicon", "create a favicon set", "turn my logo into favicons/app
  icons", "make icons from this logo/SVG/PNG", "set up site.webmanifest / PWA
  icons / apple-touch-icon", or "check/audit my favicon". Also use it
  proactively when building, scaffolding, or finishing any website or landing
  page (a site needs a correct favicon set), and when producing branding assets
  from a logo. It drives the realfavicon-mcp MCP tools (realfavicon_generate,
  realfavicon_check, realfavicon_changelog) to build a complete favicon and
  app-icon set plus ready-to-paste <head> markup from one master image, audit a
  live page's favicon setup, and track RealFaviconGenerator changes.
version: 1.0.0
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
| `realfavicon_check` | Audit a live page's `<head>` for favicon correctness. |
| `realfavicon_changelog` | Check whether RealFaviconGenerator's recommendations have changed. |

In a Claude Code session these appear under the realfavicon-mcp MCP server (the
tool name may be prefixed, e.g. `mcp__…__realfavicon_generate`). If the
`realfavicon_*` tools are not available even though this skill fired, the plugin
is installed but its **bundled MCP server didn't start** — check that Bun (>=1.3)
is on `PATH` and that dependencies fetched, and look at the server's stderr. Only
if the plugin is genuinely missing, install it (`/plugin install
realfavicon-mcp@lzlrd`). Either way, don't fall back to hand-writing favicon tags.

## Core workflow: logo → wired-up favicons

Run these steps in order. Do not hand-author favicon `<link>` tags or resize
icons manually — that is exactly what `realfavicon_generate` exists to prevent.

1. **Pick the master image.** Prefer a square SVG, or a PNG at least 512×512.
   A transparent background is fine. This is the brand logo/mark to derive every
   icon from. Accepts a local file path or an `http(s)` URL.

2. **Decide where the files are served, and set `path` to match.** This is the
   one thing that breaks favicons most often — see "path vs output_dir" below.
   `output_dir` is a filesystem directory; `path` is the URL prefix baked into
   the generated `href`s and manifest. They must point at the same place.

3. **Call `realfavicon_generate`** with `source`, `output_dir`, `path`, and any
   branding fields (`app_name`, `theme_color`, …). It writes the files and
   returns the markup.

4. **Inject the returned `html` into the page `<head>`.** The `html` field is
   the link tags joined by newlines, ready to paste. Place it inside `<head>`,
   replacing any existing favicon/manifest links so duplicates don't linger.

5. **Make sure `output_dir` is actually served at `path`** — including
   `site.webmanifest`. A 404 on the manifest or any icon means `path` and the
   served location disagree (see below).

6. **Verify.** After the site is reachable, run `realfavicon_check` on the live
   URL and resolve any errors/warnings. For a local-only build, state that
   verification needs a reachable URL.

## `realfavicon_generate` inputs

| Field | Required | Notes |
|-------|----------|-------|
| `source` | yes | Master image: local path or `http(s)` URL (PNG/SVG/…). |
| `output_dir` | yes | Filesystem directory to write files into (created if missing). |
| `path` | no (default `/`) | URL prefix written into `href`s & manifest, e.g. `/favicons/`. |
| `app_name` | no | Web-app manifest name (the installed-app name). |
| `short_name` | no | Manifest short name (defaults to `app_name`). |
| `theme_color` | no | Hex only (`#rgb` or `#rrggbb`). |
| `background_color` | no | Hex only. |
| `app_title` | no | Apple touch-icon app title. |
| `version` | no | Cache-busting query string appended to `href`s. |
| `dark_icon_source` | no | Second image (path/URL) for a dark-mode icon. |

For branding from a logo, set `app_name` and the brand `theme_color` /
`background_color` so the manifest and installed-app appearance match the brand.
Pass `dark_icon_source` when the mark needs a distinct dark-mode variant.

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
`site.webmanifest`. If a browser-chrome theme colour is also wanted, add
`<meta name="theme-color" content="#…">` to the `<head>` manually.

The structured result also includes `files` (each name + byte size), `markups`
(the link tags as an array), `css_selectors`, and `webmanifest` (the manifest
contents, or null).

### path vs output_dir — the common mistake

`output_dir` says *where on disk* to write; `path` says *what URL prefix* to
bake into the markup. Mismatch them and the browser requests icons that 404.
Match them to the project's static-serving convention:

| Stack | Serve files at | `output_dir` | `path` |
|-------|----------------|--------------|--------|
| Plain static site (root) | site root | the web root dir | `/` |
| Vite / CRA / most SPAs | `public/` → served at `/` | `public/` | `/` |
| Next.js (App/Pages) | `public/` → served at `/` | `public/` | `/` |
| Served from a subfolder | `/favicons/` | `<root>/favicons/` | `/favicons/` |
| Deployed under a base path | `/app/` | `<root>/app/` | `/app/` |

Rule of thumb: whatever URL the files end up at, `path` must be that URL's
directory prefix (with leading and trailing slash).

### Worked example

Building a site with the logo at `./brand/logo.svg`, static files in `public/`
served from the root:

1. Call `realfavicon_generate` with:
   - `source`: `./brand/logo.svg`
   - `output_dir`: `public/`
   - `path`: `/`
   - `app_name`: `Acme`, `theme_color`: `#0a84ff`, `background_color`: `#ffffff`
2. Paste the returned `html` into the site's `<head>` (remove any old favicon
   links first).
3. The seven files now live in `public/` and are served at `/…`.
4. Once deployed, run `realfavicon_check` on the URL to confirm.

## `realfavicon_check` — audit a live page

Use to verify a freshly-wired site, or to assess an existing site's favicon
setup before changing it.

- Inputs: `url` (the page to audit), `include_icon_data` (default `false`; set
  `true` only when the base64 icon bytes are actually needed — the payload is
  large).
- It fetches the page, parses `<head>`, and returns `has_errors`,
  `has_warnings`, the page title, and per-platform sections (`desktop`,
  `touch_icon`, `web_app_manifest`) each carrying human-readable `messages` plus
  detected icon metadata.

Read `has_errors`/`has_warnings` first, then walk the section `messages` to fix
what's flagged. The page must be fetchable from where the tool runs — a
localhost URL only works if it's reachable.

## `realfavicon_changelog` — keep markup current

RealFaviconGenerator's recommended markup evolves. Use this when revisiting an
older site's favicons, or to decide whether regeneration is worthwhile.

- Inputs: `since` (a prior RFG version like `"0.8.3"` — returns only newer
  changes), `format` (`markdown` (default) or `html`).
- Returns `up_to_date` (true when nothing is newer than `since`), `count`, and
  the `changes` list (version, date, description, importance, update guidance).

If `up_to_date` is true, the existing markup still follows current
recommendations; otherwise summarise what changed and offer to regenerate.

## Common mistakes to avoid

- Hand-writing favicon `<link>` tags or resizing PNGs manually — generate them.
- `path` not matching where files are served (icons/manifest 404).
- Leaving stale favicon links in `<head>` alongside the freshly generated ones.
- Passing a non-hex `theme_color`/`background_color` — they must be hex.
- A tiny or non-square master image — sharpness and crops suffer; use ≥512×512.
- Expecting a `theme-color` meta tag from the generator — add it manually.
