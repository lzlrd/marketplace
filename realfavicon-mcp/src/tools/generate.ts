import { mkdir, writeFile, access, unlink } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getNodeImageAdapter, loadAndConvertToSvg } from '@realfavicongenerator/image-adapter-node';
import { assertSafeFetchUrl } from '../net.js';
import {
  generateFaviconFiles, generateFaviconHtml, initFaviconIconSettings,
  type FaviconSettings, type MasterIcon,
} from '@realfavicongenerator/generate-favicon';

const inputSchema = {
  source: z.string().min(1).describe('Local file path OR http(s) URL to the master image (PNG/SVG/...).'),
  output_dir: z.string().min(1).describe('Directory to write the favicon files into (created if missing).'),
  path: z.string().default('/').describe('URL prefix written into hrefs & manifest (e.g. "/favicons/"). Default "/".'),
  app_name: z.string().optional().describe('Web-app manifest name.'),
  short_name: z.string().optional().describe('Web-app manifest short name (defaults to app_name).'),
  theme_color: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/).optional().describe('Theme colour, hex (#rgb or #rrggbb).'),
  background_color: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/).optional().describe('Background colour, hex.'),
  app_title: z.string().optional().describe('Apple touch-icon app title.'),
  version: z.string().optional().describe('Cache-busting query string appended to asset hrefs.'),
  dark_icon_source: z.string().optional().describe('Optional second image (path or http(s) URL) for the dark-mode icon.'),
};

const outputSchema = {
  output_dir: z.string(),
  files: z.array(z.object({ name: z.string(), bytes: z.number() })),
  html: z.string().describe('All markups joined by newline, ready to inject into <head>.'),
  markups: z.array(z.string()),
  css_selectors: z.array(z.string()),
  webmanifest: z.string().nullable().describe('Contents of site.webmanifest, or null if not emitted.'),
};

// Downloads a URL to a temp file and returns the path. Caller must unlink it.
async function downloadToTemp(url: string): Promise<string> {
  await assertSafeFetchUrl(url);
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`failed to download source (${res.status})`);
  // Preserve the source's file extension. Downstream, loadAndConvertToSvg dispatches on a
  // `.svg` suffix; an extensionless temp file makes it rasterise an SVG master instead of
  // keeping it as vector. Fall back to the Content-Type when the URL path has no extension.
  let ext = extname(new URL(url).pathname).toLowerCase();
  if (!ext && res.headers.get('content-type')?.split(';')[0]?.trim() === 'image/svg+xml') {
    ext = '.svg';
  }
  const tmp = join(tmpdir(), `rfg-src-${randomUUID()}${ext}`);
  await writeFile(tmp, Buffer.from(await res.arrayBuffer()));
  return tmp;
}

export function registerGenerateFavicon(server: McpServer): void {
  server.registerTool(
    'realfavicon_generate',
    {
      title: 'Generate favicon',
      description: 'Generate favicon files and HTML markup from a master image.',
      inputSchema,
      outputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ source, output_dir, path, app_name, short_name, theme_color, background_color, app_title, version, dark_icon_source }) => {
      // Temp paths that must be cleaned up in finally (download-to-temp only).
      const temps: string[] = [];

      try {
        // 1. Resolve master image to a local path.
        let masterPath: string;
        if (/^https?:\/\//.test(source)) {
          masterPath = await downloadToTemp(source);
          temps.push(masterPath);
        } else {
          try {
            await access(source);
          } catch {
            throw new Error(`source not readable: ${source}`);
          }
          masterPath = source;
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
            try {
              await access(dark_icon_source);
            } catch {
              throw new Error(`source not readable: ${dark_icon_source}`);
            }
            darkPath = dark_icon_source;
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
        if (app_title !== undefined) iconSettings.touch.appTitle = app_title;
        // Dark-mode icon type: set to 'specific' only when darkIcon was provided.
        if (masterIcon.darkIcon !== undefined) {
          iconSettings.desktop.darkIconType = 'specific';
        }
        const settings: FaviconSettings = { icon: iconSettings, path, ...(version ? { version } : {}) };

        // 5. Generate files.
        const adapter = await getNodeImageAdapter();
        const files = await generateFaviconFiles(masterIcon, settings, adapter);

        // 6. Ensure output directory exists.
        await mkdir(output_dir, { recursive: true });

        // 7. Write each file; capture webmanifest string for output.
        const written: Array<{ name: string; bytes: number }> = [];
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
          await writeFile(join(output_dir, name), data);
          written.push({ name, bytes: data.length });
          if (name === 'site.webmanifest' && typeof content === 'string') webmanifest = content;
        }

        // 8. Generate HTML markup. Synchronous, no await.
        const { markups, cssSelectors } = generateFaviconHtml(settings);

        const structuredContent = {
          output_dir,
          files: written,
          html: markups.join('\n'),
          markups,
          css_selectors: cssSelectors,
          webmanifest: webmanifest ?? null,
        };

        return {
          content: [{ type: 'text' as const, text: `Wrote ${written.length} favicon files to ${output_dir}.` }],
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
