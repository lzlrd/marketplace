import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { parse } from 'node-html-parser';
import { assertSafeFetchUrl } from '../net.js';
import {
  checkFavicon, reportHasErrors, reportHasWarnings,
  type FaviconReport, type CheckerMessage,
} from '@realfavicongenerator/check-favicon';

// CheckedIcon lives in the package's types but is not on its public barrel, so derive it.
type CheckedIcon = NonNullable<FaviconReport['touchIcon']['icon']>;

function mapMessages(ms: CheckerMessage[]) {
  return ms.map(m => ({ status: m.status, text: m.text }));
}

function mapIcon(icon: CheckedIcon | null, includeData: boolean) {
  if (!icon) return null;
  return {
    url: icon.url, width: icon.width, height: icon.height,
    ...(includeData ? { content: icon.content } : {}),
  };
}

const messageShape = z.object({ status: z.string(), text: z.string() });
const iconShape = z.object({
  url: z.string().nullable(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  content: z.string().nullable().optional(),
});

export function registerCheckFavicon(server: McpServer): void {
  server.registerTool(
    'realfavicon_check',
    {
      title: 'Check favicon',
      description: "Audit a live page's favicon setup by fetching and analysing its <head>.",
      inputSchema: {
        url: z.string().url().describe('Page URL to audit (its HTML <head> is fetched and checked).'),
        include_icon_data: z.boolean().default(false).describe('Include base64 data-URL icon contents (CheckedIcon.content). Large; default false.'),
      },
      outputSchema: {
        page_title: z.string().nullable(),
        has_errors: z.boolean(),
        has_warnings: z.boolean(),
        desktop: z.object({
          messages: z.array(messageShape),
          icon: z.string().nullable(),
          icons: z.object({
            png: iconShape.nullable(),
            ico: iconShape.nullable(),
            svg: iconShape.nullable(),
          }),
        }),
        touch_icon: z.object({
          messages: z.array(messageShape),
          app_title: z.string().nullable(),
          icon: iconShape.nullable(),
        }),
        web_app_manifest: z.object({
          messages: z.array(messageShape),
          name: z.string().nullable(),
          short_name: z.string().nullable(),
          background_color: z.string().nullable(),
          theme_color: z.string().nullable(),
          icon: iconShape.nullable(),
        }),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ url, include_icon_data }) => {
      try {
        await assertSafeFetchUrl(url);
        const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
        if (!res.ok) throw new Error(`failed to fetch ${url} (${res.status})`);
        const html = await res.text();
        const head = parse(html).querySelector('head');
        const report: FaviconReport = await checkFavicon(url, head);
        const has_errors = reportHasErrors(report);
        const has_warnings = reportHasWarnings(report);

        const structuredContent = {
          page_title: report.pageTitle ?? null,
          has_errors,
          has_warnings,
          desktop: {
            messages: mapMessages(report.desktop.messages),
            icon: report.desktop.icon,
            icons: {
              png: mapIcon(report.desktop.icons.png, include_icon_data),
              ico: mapIcon(report.desktop.icons.ico, include_icon_data),
              svg: mapIcon(report.desktop.icons.svg, include_icon_data),
            },
          },
          touch_icon: {
            messages: mapMessages(report.touchIcon.messages),
            app_title: report.touchIcon.appTitle ?? null,
            icon: mapIcon(report.touchIcon.icon, include_icon_data),
          },
          web_app_manifest: {
            messages: mapMessages(report.webAppManifest.messages),
            name: report.webAppManifest.name ?? null,
            short_name: report.webAppManifest.shortName ?? null,
            background_color: report.webAppManifest.backgroundColor ?? null,
            theme_color: report.webAppManifest.themeColor ?? null,
            icon: mapIcon(report.webAppManifest.icon, include_icon_data),
          },
        };

        return {
          content: [{ type: 'text', text: `Favicon check for ${url}: errors=${has_errors}, warnings=${has_warnings}.` }],
          structuredContent,
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `realfavicon_check failed: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    },
  );
}
