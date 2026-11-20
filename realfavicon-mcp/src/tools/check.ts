import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { parse } from 'node-html-parser';
import { safeFetch } from '../net.js';
import { sniff, type BodyKind } from '../sniff.js';
import {
  checkDesktopFavicon, checkTouchIcon, checkWebAppManifest, CheckerStatus, MessageId,
  type FaviconReport, type CheckerMessage,
} from '@realfavicongenerator/check-favicon';

// CheckedIcon and Fetcher live in the package's types but are not on its public barrel, so
// derive them.
type CheckedIcon = NonNullable<FaviconReport['touchIcon']['icon']>;
type Fetcher = NonNullable<Parameters<typeof checkTouchIcon>[2]>;

// How long the check waits: for the page, for each icon or manifest, and for all of it.
export type CheckLimits = { pageMs: number; assetMs: number; totalMs: number };
const DEFAULT_LIMITS: CheckLimits = { pageMs: 30_000, assetMs: 10_000, totalMs: 60_000 };

function mapMessages(ms: CheckerMessage[]) {
  return ms.map(m => ({ status: m.status as string, text: m.text }));
}

function mapIcon(icon: CheckedIcon | null, includeData: boolean) {
  if (!icon) return null;
  return {
    url: icon.url, width: icon.width, height: icon.height,
    ...(includeData ? { content: icon.content } : {}),
  };
}

const seconds = (ms: number) => `${ms / 1000} s`;

// What the library does with a file's bytes: decode-ico for the desktop ICO, JSON.parse for the
// manifest, sharp for every other icon. A file it cannot read makes it throw, which would end
// that part of the check, so the fetcher holds such a body back with a message of its own.
type Reader = 'ico' | 'json' | 'sharp';
const SHARP_READS: BodyKind[] = ['png', 'jpeg', 'gif', 'webp', 'avif', 'tiff', 'svg'];

// Why a 2xx body cannot be read as the file, or null if it can.
function unreadable(kind: BodyKind | null, reader: Reader): string | null {
  if (kind === 'empty') return 'an empty body instead of the file';
  if (kind === 'html') return 'an HTML page instead of the file. A single-page-app fallback answers this way for a file that does not exist';
  if (reader === 'ico' && kind !== 'ico' && kind !== 'png') return 'content that is not an ICO or PNG file';
  if (reader === 'sharp' && !(kind && SHARP_READS.includes(kind))) return 'content that is not a PNG, JPEG, GIF, WebP, AVIF, TIFF or SVG image';
  return null;
}

const messageShape = z.object({ status: z.string(), text: z.string() });
const iconShape = z.object({
  url: z.string().nullable(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  content: z.string().nullable().optional(),
});

export function registerCheckFavicon(server: McpServer, limits: CheckLimits = DEFAULT_LIMITS): void {
  server.registerTool(
    'realfavicon_check',
    {
      title: 'Check favicon',
      description: "Audit a page's favicon setup: fetch the page, then the icons and manifest it references, plus /favicon.ico when no ICO is linked, and report errors and warnings per platform. The result gives has_errors and has_warnings, then messages per platform under desktop, touch_icon, and web_app_manifest. The requests come from the machine the server runs on, so a localhost or LAN dev-server URL works. Link-local addresses (169.254.0.0/16, fe80::/10) and the cloud-metadata addresses 100.100.100.200, fd00:ec2::254, fd20:ce::254 and fd00:c1::a9fe:a9fe are refused, also when an IPv4 one is written inside an IPv4-mapped, NAT64 (64:ff9b::/96) or 6to4 IPv6 address, for the page, for every file it references, and for every redirect. A host name is checked against the addresses it resolves to before each request; one that resolves differently for the request itself (DNS rebinding) is not caught. A file that cannot be fetched, or that answers with an empty body, an HTML page, or bytes that are not an image the check can read, is an error message naming the file in its own section, and the rest of that section still runs. An HTML page in place of an icon or manifest is usually a single-page-app fallback standing in for a missing file. A file that passes those checks but still cannot be decoded, such as a truncated PNG, ends its section with a message naming it.",
      inputSchema: {
        url: z.string().url().describe('Page URL to audit. Its HTML is fetched, redirects are followed, and the icons it references are checked.'),
        include_icon_data: z.boolean().default(false).describe('Add the file contents of each icon as a base64 data URL: in the `content` field of each icon, and in `desktop.icon`, which is null otherwise. Large, so leave it off unless the bytes are needed. Default false.'),
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
        const deadline = AbortSignal.timeout(limits.totalMs);
        const { res, url: pageUrl } = await safeFetch(url, { signal: AbortSignal.any([deadline, AbortSignal.timeout(limits.pageMs)]) });
        if (!res.ok) throw new Error(`failed to fetch ${url} (${res.status})`);
        const pageType = res.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
        if (pageType && pageType !== 'text/html' && pageType !== 'application/xhtml+xml') {
          throw new Error(`${pageUrl} returned ${pageType}, not an HTML page`);
        }
        const html = await res.text();
        // A page may leave its <head> tags out; its links then sit directly in the document.
        const root = parse(html);
        const head = root.querySelector('head') ?? root;

        // The library joins a relative href to the base as given, so the base is the page's
        // directory, as a browser resolves it, not the page itself.
        const base = new URL('.', pageUrl).href;

        // Problems with the file being fetched, for the section that asked for it.
        const problems: string[] = [];
        let lastUrl: string | null = null;
        // The part being checked, and the readers whose file this part held back.
        let part: 'desktop' | 'touch_icon' | 'web_app_manifest' = 'desktop';
        const heldBack = new Set<Reader>();
        // The library resolves a relative manifest icon src as `<manifest URL>/<src>`; this is
        // the manifest it fetched, so such a URL can be resolved against it instead.
        let manifestUrl: string | null = null;
        const fromManifest = (u: string) => manifestUrl && u.startsWith(`${manifestUrl}/`)
          ? new URL(u.slice(manifestUrl.length + 1), manifestUrl).href
          : u;

        // The library's own fetcher is a bare fetch(): no guard, no time limit, redirects
        // followed. This one guards every hop, gives each file a time limit that covers its
        // body as well as its headers, and never throws, so one bad file cannot end the check.
        // The expected type alone does not say which reader runs: a manifest icon passes
        // whatever type the manifest gives it.
        const fetcher: Fetcher = async (requested, expected) => {
          const reader: Reader = part === 'desktop' && expected === 'image/x-icon' ? 'ico'
            : part === 'web_app_manifest' && expected === 'application/json' ? 'json' : 'sharp';
          if (reader === 'json') manifestUrl = requested;
          const assetUrl = reader === 'json' ? requested : fromManifest(requested);
          lastUrl = assetUrl;
          try {
            const signal = AbortSignal.any([deadline, AbortSignal.timeout(limits.assetMs)]);
            const { res: asset } = await safeFetch(assetUrl, { headers: { 'user-agent': 'RealFaviconGenerator Favicon Checker' }, signal });
            const contentType = asset.headers.get('content-type');
            // Read the body here, under the signal: the library reads it after this returns.
            const body = new Uint8Array(await asset.arrayBuffer());
            const problem = asset.ok ? unreadable(sniff(body), reader) : null;
            if (problem) {
              problems.push(`\`${assetUrl}\` answered ${asset.status} with ${problem}`);
              heldBack.add(reader);
              return { status: asset.status, contentType, readableStream: null };
            }
            return { status: asset.status, contentType, readableStream: new Response(body).body };
          } catch (err) {
            const reason = deadline.aborted
              ? `the time limit of ${seconds(limits.totalMs)} for the whole check ran out`
              : err instanceof Error && err.name === 'TimeoutError'
                ? `no answer within ${seconds(limits.assetMs)}`
                : err instanceof Error ? err.message : String(err);
            problems.push(`\`${assetUrl}\` could not be fetched: ${reason}`);
            heldBack.add(reader);
            return { status: 0, contentType: null, readableStream: null };
          }
        };

        // The library's "cannot get" line for the ICO or the manifest also fires when the
        // fetcher held that file back, calling a 200 or a refused request an error by number;
        // the fetcher's own message already says what happened.
        const echoes = (m: CheckerMessage) =>
          (m.id === MessageId.icoFaviconCannotGet && heldBack.has('ico'))
          || (m.id === MessageId.manifestCannotGet && heldBack.has('json'));

        // Runs one part of the check. The library still throws on a file that passes the
        // fetcher's checks but cannot be decoded, such as a truncated PNG, which would lose the
        // whole report, so that becomes an error message in the part it hit.
        const section = async <T extends { messages: CheckerMessage[] }>(name: typeof part, run: () => Promise<T>, empty: T) => {
          part = name;
          heldBack.clear();
          lastUrl = null;
          let report = empty;
          try {
            report = await run();
          } catch (err) {
            const reason = err instanceof Error ? err.message : String(err);
            problems.push(lastUrl
              ? `\`${lastUrl}\` could not be read as the file it should be (${reason}), which ended this part of the check`
              : `This part of the check failed: ${reason}`);
          }
          const added = problems.splice(0).map(text => ({ status: CheckerStatus.Error as string, text }));
          return { ...report, messages: [...mapMessages(report.messages.filter(m => !echoes(m))), ...added] };
        };

        const desktop = await section(
          'desktop',
          () => checkDesktopFavicon(base, head, fetcher),
          { messages: [], icon: null, icons: { png: null, ico: null, svg: null } },
        );
        const touchIcon = await section(
          'touch_icon',
          () => checkTouchIcon(base, head, fetcher),
          { messages: [], icon: null },
        );
        const webAppManifest = await section(
          'web_app_manifest',
          () => checkWebAppManifest(base, head, fetcher),
          { messages: [], icon: null },
        );
        const manifestIcon = webAppManifest.icon?.url ? { ...webAppManifest.icon, url: fromManifest(webAppManifest.icon.url) } : webAppManifest.icon;

        const messages = [...desktop.messages, ...touchIcon.messages, ...webAppManifest.messages];
        const has_errors = messages.some(m => m.status === CheckerStatus.Error);
        const has_warnings = messages.some(m => m.status === CheckerStatus.Warning);

        const structuredContent = {
          page_title: head.querySelector('title')?.text.trim() || null,
          has_errors,
          has_warnings,
          desktop: {
            messages: desktop.messages,
            icon: include_icon_data ? desktop.icon : null,
            icons: {
              png: mapIcon(desktop.icons.png, include_icon_data),
              ico: mapIcon(desktop.icons.ico, include_icon_data),
              svg: mapIcon(desktop.icons.svg, include_icon_data),
            },
          },
          touch_icon: {
            messages: touchIcon.messages,
            app_title: touchIcon.appTitle ?? null,
            icon: mapIcon(touchIcon.icon, include_icon_data),
          },
          web_app_manifest: {
            messages: webAppManifest.messages,
            name: webAppManifest.name ?? null,
            short_name: webAppManifest.shortName ?? null,
            background_color: webAppManifest.backgroundColor ?? null,
            theme_color: webAppManifest.themeColor ?? null,
            icon: mapIcon(manifestIcon, include_icon_data),
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
