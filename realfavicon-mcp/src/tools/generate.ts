import { mkdir, writeFile, access, lstat, unlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, extname, isAbsolute, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getNodeImageAdapter, loadAndConvertToSvg } from '@realfavicongenerator/image-adapter-node';
import { safeFetch } from '../net.js';
import { sniff } from '../sniff.js';
import {
  generateFaviconFiles, generateFaviconHtml, initFaviconIconSettings,
  type FaviconSettings, type MasterIcon,
} from '@realfavicongenerator/generate-favicon';

// Characters that would end the double-quoted attribute or the tag that `path` and `version`
// are written into.
const noMarkup = z.string().regex(/^[^"<>]*$/, 'must not contain ", < or >');

const inputSchema = {
  source: z.string().min(1).describe('Master image (PNG/SVG/...): an absolute local file path or an http(s) URL. A relative path resolves against the project root in CLAUDE_PROJECT_DIR, which in a worktree session is the main checkout, so pass an absolute path. A URL source is typed by its bytes first, then by its Content-Type, then by its extension; one that answers with an HTML page or an empty body is refused, whatever its Content-Type and extension say. An SVG is copied into favicon.svg as it is, scripts included.'),
  output_dir: z.string().min(1).describe('Absolute path of the directory to write the favicon files into (created if missing). A relative path resolves the same way as source.'),
  path: noMarkup.default('/').describe('URL prefix that output_dir is served at, written in front of each file name in the hrefs and the manifest (e.g. "/favicons/"). A missing trailing slash is added. An empty string gives hrefs relative to the page. Must not contain ", < or >. Default "/".'),
  app_name: z.string().optional().describe('Web-app manifest name. Without it the manifest keeps the placeholder names "MyWebSite" and "MySite".'),
  short_name: z.string().optional().describe('Web-app manifest short name (defaults to app_name).'),
  theme_color: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/).optional().describe('Web-app manifest theme color, hex (#rgb or #rrggbb).'),
  background_color: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/).optional().describe('Web-app manifest background color, hex (#rgb or #rrggbb). It does not fill transparent areas of the icons.'),
  app_title: z.string().optional().describe('Apple touch-icon app title, as plain text; adds an apple-mobile-web-app-title meta tag to the markup, HTML-escaped.'),
  version: noMarkup.optional().describe('Cache-busting value, appended to every asset URL as "?v=<version>". Must not contain ", < or >.'),
  dark_icon_source: z.string().optional().describe('Optional second image (absolute path or http(s) URL) for the dark-mode icon. A relative path resolves the same way as source.'),
};

const outputSchema = {
  output_dir: z.string().describe('Absolute path of the directory the files were written into.'),
  files: z.array(z.object({ name: z.string(), bytes: z.number() })),
  overwritten: z.array(z.string()).describe('Names of the files that already existed in output_dir and were replaced.'),
  html: z.string().describe('All markups joined by newline, ready to inject into <head>.'),
  markups: z.array(z.string()),
  css_selectors: z.array(z.string()),
  webmanifest: z.string().nullable().describe('Contents of site.webmanifest, or null if not emitted.'),
};

// Turns a local path argument into an absolute path. A relative one resolves against the
// project root that Claude Code passes in CLAUDE_PROJECT_DIR. The working directory is no
// substitute: the plugin's launch command changes into the plugin's install directory, so a
// path resolved against it would be read from, or written into, the plugin instead of the
// project. Without the variable, or with a relative one, which would itself resolve against
// the working directory, a relative path is refused.
function resolveLocalPath(field: string, value: string): string {
  if (isAbsolute(value)) return value;
  const root = process.env.CLAUDE_PROJECT_DIR;
  if (!root || !isAbsolute(root)) {
    const why = root ? `CLAUDE_PROJECT_DIR is not absolute (${root})` : 'CLAUDE_PROJECT_DIR is not set';
    throw new Error(`${field} is a relative path (${value}) and ${why}, so it would resolve against the working directory of the server, ${process.cwd()}; pass an absolute path`);
  }
  return resolve(root, value);
}

// Escapes text for use inside a double-quoted HTML attribute.
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Downloads a URL to a temp file and returns the path. Caller must unlink it.
async function downloadToTemp(url: string): Promise<string> {
  const { res, url: finalUrl } = await safeFetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`failed to download source (${res.status})`);
  // An HTML page or an empty body is no image, whatever the Content-Type and the URL path say.
  // Left to the steps below, a page at a `.svg` URL would pass for an SVG master, and the
  // generator would build the set from whatever <svg> the page holds and copy the page's
  // scripts into favicon.svg.
  const bytes = Buffer.from(await res.arrayBuffer());
  const kind = sniff(bytes);
  const where = finalUrl === url ? url : `${url} (redirected to ${finalUrl})`;
  if (kind === 'html') throw new Error(`${where} answered ${res.status} with an HTML page, not an image. A single-page-app fallback answers this way for a file that does not exist`);
  if (kind === 'empty') throw new Error(`${where} answered ${res.status} with an empty body, not an image`);
  // Name the temp file after the image type. Downstream, loadAndConvertToSvg goes by the name
  // alone: only a `.svg` suffix keeps an SVG master as vector, and whatever follows the last
  // dot is written into favicon.svg as the image type. The bytes say what the file is when
  // they match a known image type, since a server can label an SVG image/png; then the
  // Content-Type; the URL path is the last resort, since it may carry no extension or a
  // misleading one.
  // The name always gets an extension, so the temp path itself never ends up in favicon.svg.
  const type = res.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '';
  const subtype = /^image\/([a-z0-9.+-]+)$/.exec(type)?.[1];
  const ext = kind
    ? `.${kind}`
    : subtype
      ? `.${subtype === 'svg+xml' ? 'svg' : subtype}`
      : extname(new URL(finalUrl).pathname).toLowerCase() || '.bin';
  const tmp = join(tmpdir(), `rfg-src-${randomUUID()}${ext}`);
  await writeFile(tmp, bytes);
  return tmp;
}

export function registerGenerateFavicon(server: McpServer): void {
  server.registerTool(
    'realfavicon_generate',
    {
      title: 'Generate favicon',
      description: 'Generate a favicon and app-icon set, plus the <head> markup for it, from one master image. Files of the same name already in output_dir, including site.webmanifest and favicon.ico, are replaced; the result lists them in `overwritten`. If a write fails partway, the error names the files already written and replaced. If a file of a generated name in output_dir is a symlink, the call is refused and nothing is written. Pass local paths as absolute paths: a relative one resolves against the project root in CLAUDE_PROJECT_DIR, not the working directory, and is refused when that variable is not set or not absolute.',
      inputSchema,
      outputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ source, output_dir: outputDirArg, path, app_name, short_name, theme_color, background_color, app_title, version, dark_icon_source }) => {
      // Temp paths that must be cleaned up in finally (download-to-temp only).
      const temps: string[] = [];

      try {
        const output_dir = resolveLocalPath('output_dir', outputDirArg);

        // 1. Resolve master image to a local path.
        let masterPath: string;
        if (/^https?:\/\//.test(source)) {
          masterPath = await downloadToTemp(source);
          temps.push(masterPath);
        } else {
          masterPath = resolveLocalPath('source', source);
          try {
            await access(masterPath);
          } catch {
            throw new Error(`source not readable: ${masterPath}`);
          }
        }

        // 2. Load master image. loadAndConvertToSvg handles both raster and SVG.
        const icon = await loadAndConvertToSvg(masterPath);
        const masterIcon: MasterIcon = { icon };

        // 3. Optional dark icon.
        if (dark_icon_source !== undefined) {
          let darkPath: string;
          if (/^https?:\/\//.test(dark_icon_source)) {
            darkPath = await downloadToTemp(dark_icon_source);
            temps.push(darkPath);
          } else {
            darkPath = resolveLocalPath('dark_icon_source', dark_icon_source);
            try {
              await access(darkPath);
            } catch {
              throw new Error(`source not readable: ${darkPath}`);
            }
          }
          const darkIcon = await loadAndConvertToSvg(darkPath);
          masterIcon.darkIcon = darkIcon;
        }

        // 4. Build settings via init helper; only override caller-supplied fields.
        const iconSettings = initFaviconIconSettings();
        if (app_name !== undefined) iconSettings.webAppManifest.name = app_name;
        // Only override the library's default shortName when the caller supplied a name to
        // derive it from; otherwise leave the init default rather than blanking it to ''.
        const shortName = short_name ?? app_name;
        if (shortName !== undefined) iconSettings.webAppManifest.shortName = shortName;
        if (theme_color !== undefined) iconSettings.webAppManifest.themeColor = theme_color;
        if (background_color !== undefined) iconSettings.webAppManifest.backgroundColor = background_color;
        // The generator writes the title into the markup as given, so escape it here.
        if (app_title !== undefined) iconSettings.touch.appTitle = escapeHtml(app_title);
        // Dark-mode icon type: set to 'specific' only when darkIcon was provided.
        if (masterIcon.darkIcon !== undefined) {
          iconSettings.desktop.darkIconType = 'specific';
        }
        // The generator joins the prefix to each file name as given, so "/favicons" would
        // yield "/faviconsfavicon.ico". An empty prefix stays empty: it means relative hrefs.
        const prefix = path === '' || path.endsWith('/') ? path : `${path}/`;
        const settings: FaviconSettings = { icon: iconSettings, path: prefix, ...(version ? { version } : {}) };

        // 5. Generate files.
        const adapter = await getNodeImageAdapter();
        const files = await generateFaviconFiles(masterIcon, settings, adapter);

        // 6. Ensure output directory exists, and refuse before writing anything if a
        // generated name there is a symlink: writing would follow it out of output_dir, and
        // a cloned repository can carry such a link in its public folder.
        await mkdir(output_dir, { recursive: true });
        const linked: string[] = [];
        for (const name of Object.keys(files)) {
          const isLink = await lstat(join(output_dir, name)).then(s => s.isSymbolicLink(), () => false);
          if (isLink) linked.push(name);
        }
        if (linked.length > 0) {
          throw new Error(`${linked.join(', ')} in ${output_dir} ${linked.length === 1 ? 'is a symlink' : 'are symlinks'}; writing would follow ${linked.length === 1 ? 'it' : 'them'} out of output_dir. Nothing was written. Remove the ${linked.length === 1 ? 'link' : 'links'} or choose another output_dir`);
        }

        // 7. Write each file; capture webmanifest string for output, and note which files
        // were already there, since writing replaces them.
        const written: Array<{ name: string; bytes: number }> = [];
        const overwritten: string[] = [];
        let webmanifest: string | undefined;
        for (const [name, content] of Object.entries(files)) {
          let data: Buffer;
          if (typeof content === 'string') {
            data = Buffer.from(content, 'utf8');
          } else if (Buffer.isBuffer(content)) {
            data = content;
          } else {
            // ponytail: Blob path is browser-only and unreachable under Bun; kept for type-safety.
            data = Buffer.from(await (content as Blob).arrayBuffer());
          }
          const target = join(output_dir, name);
          const existed = await access(target).then(() => true, () => false);
          try {
            // O_NOFOLLOW also refuses a link that appears after the check above.
            await writeFile(target, data, { flag: constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW });
          } catch (err) {
            // The files before this one are already on disk, so say which, and which of them
            // replaced a file that was there.
            const reason = err instanceof Error ? err.message : String(err);
            const done = written.length > 0
              ? `Already written: ${written.map(f => f.name).join(', ')}${overwritten.length > 0 ? `; of those, replaced existing: ${overwritten.join(', ')}` : ''}.`
              : 'Nothing was written.';
            throw new Error(`writing ${name} failed (${reason}). ${done}`);
          }
          if (existed) overwritten.push(name);
          written.push({ name, bytes: data.length });
          if (name === 'site.webmanifest' && typeof content === 'string') webmanifest = content;
        }

        // 8. Generate HTML markup. Synchronous, no await.
        const { markups, cssSelectors } = generateFaviconHtml(settings);

        const structuredContent = {
          output_dir,
          files: written,
          overwritten,
          html: markups.join('\n'),
          markups,
          css_selectors: cssSelectors,
          webmanifest: webmanifest ?? null,
        };

        const replaced = overwritten.length > 0 ? ` Replaced existing: ${overwritten.join(', ')}.` : '';
        return {
          content: [{ type: 'text' as const, text: `Wrote ${written.length} favicon files to ${output_dir}.${replaced}` }],
          structuredContent,
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `realfavicon_generate failed: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      } finally {
        // 9. Unlink temp downloads on both success and error paths.
        for (const tmp of temps) {
          try { await unlink(tmp); } catch { /* never mask the real error */ }
        }
      }
    },
  );
}
