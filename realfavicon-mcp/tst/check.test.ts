import { test, expect, afterEach, beforeAll, afterAll } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { registerCheckFavicon } from '../src/tools/check.ts';

// A literal address, so the guard in front of every fetch needs no name resolution.
const pageUrl = 'http://127.0.0.1:9999/';
const fixtureHtml = readFileSync(join(import.meta.dir, 'fixtures/page-head.html'), 'utf8');

type Limits = Parameters<typeof registerCheckFavicon>[1];

async function makeClient(limits?: Limits): Promise<Client> {
  const server = new McpServer({ name: 't', version: '0.0.0' });
  registerCheckFavicon(server, limits);
  const [ct, st] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'c', version: '0.0.0' });
  await Promise.all([server.connect(st), client.connect(ct)]);
  // Listing the tools makes the client check each result against the output schema.
  await client.listTools();
  return client;
}

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

// Monkeypatch: serves the fixture HTML for pageUrl; 404 for all asset requests.
function patchFetchWithFixture(html: string = fixtureHtml, assetStatus = 404): void {
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], _init?: RequestInit) => {
    const u = String((input as Request).url ?? input);
    if (u === pageUrl) {
      return new Response(html, { status: 200, headers: { 'content-type': 'text/html' } });
    }
    return new Response('', { status: assetStatus });
  }) as typeof fetch;
}

type Message = { status: string; text: string };
type Icon = { url: string | null; width: number | null; height: number | null; content?: string | null } | null;
type Report = {
  page_title: string | null;
  has_errors: boolean;
  has_warnings: boolean;
  desktop: { messages: Message[]; icon: string | null; icons: { png: Icon; ico: Icon; svg: Icon } };
  touch_icon: { messages: Message[]; app_title: string | null; icon: Icon };
  web_app_manifest: { messages: Message[]; name: string | null; short_name: string | null; background_color: string | null; theme_color: string | null; icon: Icon };
};

function textOf(r: unknown): string {
  return (r as { content: Array<{ type: string; text: string }> }).content[0]!.text;
}

// The error messages of one section that mention `needle`.
function errorsAbout(section: { messages: Message[] }, needle: string): string[] {
  return section.messages.filter(m => m.status === 'Error' && m.text.includes(needle)).map(m => m.text);
}

function allTexts(report: Report): string[] {
  return [report.desktop, report.touch_icon, report.web_app_manifest].flatMap(s => s.messages.map(m => m.text));
}

// Test 1 — structured report returned offline; shape & condensing verified.
test('structured report contains page_title, booleans, and message arrays without numeric id', async () => {
  patchFetchWithFixture();
  const client = await makeClient();

  const r = await client.callTool({ name: 'realfavicon_check', arguments: { url: pageUrl } });

  expect(r.isError).toBeFalsy();

  // structuredContent is populated
  const sc = r.structuredContent as Record<string, unknown>;
  expect(typeof sc).toBe('object');

  // page_title matches the fixture <title>
  expect(sc['page_title']).toBe('Test Page');

  // has_errors / has_warnings are booleans
  expect(typeof sc['has_errors']).toBe('boolean');
  expect(typeof sc['has_warnings']).toBe('boolean');

  // per-platform sections have message arrays
  const desktop = sc['desktop'] as Record<string, unknown>;
  const touch = sc['touch_icon'] as Record<string, unknown>;
  const manifest = sc['web_app_manifest'] as Record<string, unknown>;

  expect(Array.isArray(desktop['messages'])).toBe(true);
  expect(Array.isArray(touch['messages'])).toBe(true);
  expect(Array.isArray(manifest['messages'])).toBe(true);

  // Each message is {status, text} — no numeric id field (condensing strips it).
  for (const section of [desktop, touch, manifest]) {
    for (const msg of section['messages'] as Array<Record<string, unknown>>) {
      expect(typeof msg['status']).toBe('string');
      expect(typeof msg['text']).toBe('string');
      expect('id' in msg).toBe(false);
    }
  }
});

// Test 2a — content key absent by default (include_icon_data omitted).
test('icon objects carry no content key when include_icon_data is false (default)', async () => {
  patchFetchWithFixture();
  const client = await makeClient();

  const r = await client.callTool({ name: 'realfavicon_check', arguments: { url: pageUrl } });
  expect(r.isError).toBeFalsy();

  const sc = r.structuredContent as Record<string, unknown>;

  function assertNoContent(icon: unknown): void {
    if (icon !== null && typeof icon === 'object') {
      expect('content' in (icon as Record<string, unknown>)).toBe(false);
    }
  }

  const desktop = sc['desktop'] as Record<string, unknown>;
  const icons = desktop['icons'] as Record<string, unknown>;
  assertNoContent(icons['png']);
  assertNoContent(icons['ico']);
  assertNoContent(icons['svg']);
  assertNoContent((sc['touch_icon'] as Record<string, unknown>)['icon']);
  assertNoContent((sc['web_app_manifest'] as Record<string, unknown>)['icon']);
});

// Test 2b — content key IS present when include_icon_data:true and the asset is downloadable.
test('icon objects carry content key when include_icon_data is true and asset is served', async () => {
  // Serve a minimal 1×1 PNG as every asset so the library can produce a CheckedIcon with content.
  // Minimal valid PNG bytes (1×1 transparent pixel).
  const png1x1 = Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6260000000020001e221bc330000000049454e44ae426082',
    'hex',
  );
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], _init?: RequestInit) => {
    const u = String((input as Request).url ?? input);
    if (u === pageUrl) {
      return new Response(fixtureHtml, { status: 200, headers: { 'content-type': 'text/html' } });
    }
    // Serve the 1×1 PNG for every favicon asset.
    return new Response(png1x1, { status: 200, headers: { 'content-type': 'image/png' } });
  }) as typeof fetch;

  const client = await makeClient();
  const r = await client.callTool({
    name: 'realfavicon_check',
    arguments: { url: pageUrl, include_icon_data: true },
  });
  expect(r.isError).toBeFalsy();

  const sc = r.structuredContent as Record<string, unknown>;

  // At least one icon object should carry content (the served PNG).
  function hasContentAnywhere(sc: Record<string, unknown>): boolean {
    const desktop = sc['desktop'] as Record<string, unknown>;
    const icons = desktop['icons'] as Record<string, unknown>;
    for (const k of ['png', 'ico', 'svg']) {
      const icon = icons[k] as Record<string, unknown> | null;
      if (icon && 'content' in icon && icon['content'] !== null) return true;
    }
    const touchIcon = (sc['touch_icon'] as Record<string, unknown>)['icon'] as Record<string, unknown> | null;
    if (touchIcon && 'content' in touchIcon && touchIcon['content'] !== null) return true;
    return false;
  }

  expect(hasContentAnywhere(sc)).toBe(true);
});

// Test 3 — a page with no favicon markup at all still gets a full report.
test('page with no <head> reports the missing icons instead of crashing', async () => {
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], _init?: RequestInit) => {
    const u = String((input as Request).url ?? input);
    if (u === pageUrl) {
      return new Response('<html><body>x</body></html>', { status: 200, headers: { 'content-type': 'text/html' } });
    }
    return new Response('', { status: 404 });
  }) as typeof fetch;

  const client = await makeClient();
  const r = await client.callTool({ name: 'realfavicon_check', arguments: { url: pageUrl } });

  expect(r.isError).toBeFalsy();
  const sc = r.structuredContent as Report;
  expect(sc.has_errors).toBe(true);
  expect(sc.page_title).toBeNull();
  expect(errorsAbout(sc.desktop, 'There is no SVG favicon').length).toBe(1);
  expect(errorsAbout(sc.touch_icon, 'No touch icon declared').length).toBe(1);
  expect(errorsAbout(sc.web_app_manifest, 'No web app manifest').length).toBe(1);
});

// Test 4 — fetch failure (HTTP 500) → isError true.
test('non-2xx page response returns isError true', async () => {
  globalThis.fetch = (async (_input: Parameters<typeof fetch>[0], _init?: RequestInit) => {
    return new Response('Internal Server Error', { status: 500 });
  }) as typeof fetch;

  const client = await makeClient();
  const r = await client.callTool({ name: 'realfavicon_check', arguments: { url: pageUrl } });

  expect(r.isError).toBe(true);
});

// --- Against real local servers ---

const PNG_32 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAK0lEQVR42u3OoQEAAAwCIE/f5+4MC4FOcu2UgICAgICAgICAgICAgIDAOvBNk/iIlQmc1wAAAABJRU5ErkJggg==',
  'base64',
);
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32"><rect width="32" height="32" fill="#0080ff"/></svg>';

// The five tags realfavicon_generate emits, under one path prefix.
function head(prefix: string, title = 'Local'): string {
  return `<!DOCTYPE html><html><head><title>${title}</title>
<link rel="icon" type="image/png" href="${prefix}favicon-96x96.png" sizes="96x96" />
<link rel="icon" type="image/svg+xml" href="${prefix}favicon.svg" />
<link rel="shortcut icon" href="${prefix}favicon.ico" />
<link rel="apple-touch-icon" sizes="180x180" href="${prefix}apple-touch-icon.png" />
<link rel="manifest" href="${prefix}site.webmanifest" />
</head><body>app</body></html>`;
}

const SHELL = '<!DOCTYPE html><html><head><title>App</title></head><body>shell</body></html>';

const html = (body: string) => new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8' } });
const relabel = (res: Response) => new Response(res.body, { headers: { 'content-type': 'text/html' } });
const png = () => new Response(PNG_32, { headers: { 'content-type': 'image/png' } });
const svg = () => new Response(SVG, { headers: { 'content-type': 'image/svg+xml' } });
const redirect = (location: string, status = 302) => new Response(null, { status, headers: { location } });
const notFound = () => new Response('not found', { status: 404 });

function manifest(prefix: string): Response {
  return Response.json({
    name: 'Local App', short_name: 'Local', theme_color: '#336699', background_color: '#ffffff',
    icons: [
      { src: `${prefix}web-app-manifest-192x192.png`, sizes: '192x192', type: 'image/png' },
      { src: `${prefix}web-app-manifest-512x512.png`, sizes: '512x512', type: 'image/png' },
    ],
  });
}

let server: ReturnType<typeof Bun.serve>;
let other: ReturnType<typeof Bun.serve>;
let origin: string;
let otherOrigin: string;

beforeAll(() => {
  // A second origin: a wired set that the first one redirects to.
  other = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(req) {
      const { pathname } = new URL(req.url);
      if (pathname === '/') return html(head('/', 'Moved Here'));
      if (pathname === '/favicon.svg') return svg();
      if (pathname === '/site.webmanifest') return manifest('/');
      if (pathname.endsWith('.png')) return png();
      return notFound();
    },
  });
  otherOrigin = `http://127.0.0.1:${other.port}`;

  server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(req) {
      const { pathname } = new URL(req.url);

      // A wired set: every file answers with what it should be, bar the ICO.
      if (pathname === '/wired/') return html(head('/wired/'));
      if (pathname === '/wired/favicon.svg') return svg();
      if (pathname === '/wired/site.webmanifest') return manifest('/wired/');
      if (pathname.startsWith('/wired/') && pathname.endsWith('.png')) return png();

      // A single-page app: any path it does not know answers 200 with the app shell.
      if (pathname === '/spa/') return html(head('/spa/'));
      if (pathname.startsWith('/spa/')) return html('<!DOCTYPE html><html><head><title>App</title></head><body>shell</body></html>');
      if (pathname === '/bare/') return html('<!DOCTYPE html><html><head><title>Bare</title></head><body>no icons</body></html>');
      if (pathname === '/favicon.ico') return html('<!DOCTYPE html><html><head><title>App</title></head><body>shell</body></html>');

      // Files that answer 200 with something that is no image.
      if (pathname === '/junk/') return html(head('/junk/'));
      if (pathname === '/junk/favicon-96x96.png') return new Response('this is not an image', { headers: { 'content-type': 'text/plain' } });
      if (pathname === '/junk/favicon.svg') return svg();
      if (pathname === '/junk/favicon.ico') return new Response('server error', { status: 500 });
      if (pathname === '/junk/apple-touch-icon.png') return new Response('', { headers: { 'content-type': 'image/png' } });

      // The app shell under other labels, beside a real PNG and ICO.
      if (pathname === '/shell/') return html(head('/shell/'));
      if (pathname === '/shell/favicon-96x96.png' || pathname === '/shell/favicon.ico') return png();
      if (pathname === '/shell/favicon.svg') return new Response(SHELL, { headers: { 'content-type': 'text/plain' } });
      if (pathname === '/shell/apple-touch-icon.png') { const r = new Response(new TextEncoder().encode(SHELL)); r.headers.delete('content-type'); return r; }
      if (pathname === '/shell/site.webmanifest') return new Response(null, { status: 204 });

      // Real files, every one labelled text/html.
      if (pathname === '/mislabelled/') return html(head('/mislabelled/'));
      if (pathname === '/mislabelled/favicon.svg') return html(SVG);
      if (pathname === '/mislabelled/site.webmanifest') return relabel(manifest('/mislabelled/'));
      if (pathname.startsWith('/mislabelled/') && pathname.endsWith('.png')) return relabel(png());

      // A page deeper in the site whose hrefs and manifest icon srcs are all relative.
      if (pathname === '/deep/dir/index.html') return html(head(''));
      if (pathname === '/deep/dir/favicon.svg') return svg();
      if (pathname === '/deep/dir/site.webmanifest') return manifest('');
      if (pathname.startsWith('/deep/dir/') && (pathname.endsWith('.png') || pathname.endsWith('.ico'))) return png();

      // A page that points the checker at a link-local address, directly and through a redirect.
      if (pathname === '/steer/') {
        return html(`<!DOCTYPE html><html><head><title>Steer</title>
<link rel="apple-touch-icon" href="/steer/bounce.png" />
<link rel="manifest" href="http://[fe80::1]/internal/config.json" />
</head><body></body></html>`);
      }
      if (pathname === '/steer/bounce.png') return redirect('http://[::ffff:169.254.169.254]/latest/meta-data/');

      // Files that never finish: one never answers, one sends headers and then stalls.
      if (pathname === '/stall/') return html(head('/stall/'));
      if (pathname === '/stall/apple-touch-icon.png') return new Promise<Response>(() => {});
      if (pathname === '/stall/favicon.svg') {
        const body = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('<svg ')); } });
        return new Response(body, { headers: { 'content-type': 'image/svg+xml' } });
      }

      // The page itself moved: to another origin, and to a link-local address.
      if (pathname === '/moved') return redirect(`${otherOrigin}/`, 301);
      if (pathname === '/moved-to-link-local') return redirect('http://[fe80::1]/');
      // Valid HTML whose head tags are implied, never written.
      if (pathname === '/implicit/') {
        return html('<!DOCTYPE html><title>Implicit</title><link rel="icon" type="image/svg+xml" href="/wired/favicon.svg" /><body>hi</body>');
      }
      if (pathname === '/api.json') return Response.json({ ok: true });

      return notFound();
    },
  });
  origin = `http://127.0.0.1:${server.port}`;
});

afterAll(() => {
  server.stop(true);
  other.stop(true);
});

// With include_icon_data off, no icon bytes appear anywhere in the result, desktop.icon included.
test('desktop.icon is null unless include_icon_data is set', async () => {
  const client = await makeClient();

  const off = await client.callTool({ name: 'realfavicon_check', arguments: { url: `${origin}/wired/` } });
  expect(off.isError).toBeFalsy();
  const offReport = off.structuredContent as Report;
  // The PNG was fetched and read, so there was a data URL to leak.
  expect(offReport.desktop.icons.png?.width).toBe(32);
  expect(offReport.desktop.icon).toBeNull();
  expect(JSON.stringify(offReport)).not.toContain('base64');

  const on = await client.callTool({ name: 'realfavicon_check', arguments: { url: `${origin}/wired/`, include_icon_data: true } });
  expect(on.isError).toBeFalsy();
  const onReport = on.structuredContent as Report;
  expect(onReport.desktop.icon).toStartWith('data:image/png;base64,');
  expect(onReport.desktop.icons.png?.content).toStartWith('data:image/png;base64,');
});

test('a wired set reports its files as reachable', async () => {
  const client = await makeClient();
  const r = await client.callTool({ name: 'realfavicon_check', arguments: { url: `${origin}/wired/` } });

  expect(r.isError).toBeFalsy();
  const sc = r.structuredContent as Report;
  expect(sc.page_title).toBe('Local');
  expect(allTexts(sc)).toContain('The SVG favicon is accessible at `/wired/favicon.svg`');
  expect(allTexts(sc)).toContain('The touch icon is downloadable');
  expect(sc.web_app_manifest.name).toBe('Local App');
  expect(allTexts(sc).filter(t => t.includes('HTML'))).toEqual([]);
});

// A single-page-app fallback answers 200 with HTML for a file that is not there.
test('icon and manifest URLs that answer 200 with HTML are reported per file', async () => {
  const client = await makeClient();
  const r = await client.callTool({ name: 'realfavicon_check', arguments: { url: `${origin}/spa/` } });

  expect(r.isError).toBeFalsy();
  const sc = r.structuredContent as Report;
  expect(sc.has_errors).toBe(true);

  for (const [section, file] of [
    [sc.desktop, 'favicon.svg'],
    [sc.desktop, 'favicon-96x96.png'],
    [sc.desktop, 'favicon.ico'],
    [sc.touch_icon, 'apple-touch-icon.png'],
    [sc.web_app_manifest, 'site.webmanifest'],
  ] as const) {
    // One message per file says what came back, with the real status, not an invented 404.
    const errors = errorsAbout(section, `\`${origin}/spa/${file}\` answered 200 with an HTML page`);
    expect(errors.length).toBe(1);
  }
  expect(allTexts(sc).filter(t => t.includes('404'))).toEqual([]);
  // The library's own "cannot get" line for the same file would call a 200 an error.
  expect(allTexts(sc).filter(t => /\((status )?200( error)?\)/.test(t))).toEqual([]);
});

// The body decides, not the label: real files labelled text/html are read as what they are.
test('real icon and manifest files labelled text/html are still read', async () => {
  const client = await makeClient();
  const r = await client.callTool({ name: 'realfavicon_check', arguments: { url: `${origin}/mislabelled/` } });

  expect(r.isError).toBeFalsy();
  const sc = r.structuredContent as Report;
  expect(allTexts(sc)).toContain('The SVG favicon is accessible at `/mislabelled/favicon.svg`');
  expect(allTexts(sc)).toContain('The 96x96 desktop PNG favicon is accessible');
  expect(allTexts(sc)).toContain('The touch icon is downloadable');
  expect(allTexts(sc)).toContain('The 512x512 icon is downloadable');
  expect(sc.web_app_manifest.name).toBe('Local App');
  expect(sc.desktop.icons.png?.width).toBe(32);
  expect(allTexts(sc).filter(t => t.includes('HTML page'))).toEqual([]);
});

// An app shell labelled text/plain or not labelled at all, and an empty 204, are each reported
// on their own, and the files beside them are still checked.
test('a body that cannot be the file is reported without ending its section', async () => {
  const client = await makeClient();
  const r = await client.callTool({ name: 'realfavicon_check', arguments: { url: `${origin}/shell/` } });

  expect(r.isError).toBeFalsy();
  const sc = r.structuredContent as Report;
  expect(errorsAbout(sc.desktop, `\`${origin}/shell/favicon.svg\` answered 200 with an HTML page`).length).toBe(1);
  expect(errorsAbout(sc.touch_icon, `\`${origin}/shell/apple-touch-icon.png\` answered 200 with an HTML page`).length).toBe(1);
  expect(errorsAbout(sc.web_app_manifest, `\`${origin}/shell/site.webmanifest\` answered 204 with an empty body`).length).toBe(1);

  // The PNG and the ICO next to the bad SVG were read.
  expect(sc.desktop.icons.png?.width).toBe(32);
  expect(allTexts(sc)).toContain('ICO favicon found');
  expect(allTexts(sc).filter(t => t.includes('ended this part'))).toEqual([]);
  expect(allTexts(sc).filter(t => /\((status )?20\d( error)?\)/.test(t))).toEqual([]);
});

// The library joins a relative href to the full page URL, and a manifest icon src to the full
// manifest URL; both have to resolve the way a browser resolves them.
test('relative hrefs and manifest icon srcs resolve like a browser resolves them', async () => {
  const client = await makeClient();
  const r = await client.callTool({ name: 'realfavicon_check', arguments: { url: `${origin}/deep/dir/index.html` } });

  expect(r.isError).toBeFalsy();
  const sc = r.structuredContent as Report;
  expect(sc.desktop.icons.svg?.url).toBe(`${origin}/deep/dir/favicon.svg`);
  expect(allTexts(sc)).toContain('The SVG favicon is accessible at `favicon.svg`');
  expect(allTexts(sc)).toContain('The 96x96 desktop PNG favicon is accessible');
  expect(allTexts(sc)).toContain('ICO favicon found');
  expect(allTexts(sc)).toContain('The touch icon is downloadable');
  expect(sc.web_app_manifest.name).toBe('Local App');
  expect(allTexts(sc)).toContain('The 192x192 icon is downloadable');
  expect(allTexts(sc)).toContain('The 512x512 icon is downloadable');
  expect(sc.web_app_manifest.icon?.url).toBe(`${origin}/deep/dir/web-app-manifest-512x512.png`);
  expect(allTexts(sc).filter(t => /not found|does not exist|404/.test(t))).toEqual([]);
});

test('an implicit /favicon.ico that answers 200 with HTML is reported, not fatal', async () => {
  const client = await makeClient();
  const r = await client.callTool({ name: 'realfavicon_check', arguments: { url: `${origin}/bare/` } });

  expect(r.isError).toBeFalsy();
  const sc = r.structuredContent as Report;
  expect(sc.page_title).toBe('Bare');
  expect(errorsAbout(sc.desktop, 'There is no ICO favicon').length).toBe(1);
  expect(errorsAbout(sc.desktop, `\`${origin}/favicon.ico\` answered 200 with an HTML page`).length).toBe(1);
});

test('a file that is not an image is an error naming it, and the rest of its section still runs', async () => {
  const client = await makeClient();
  const r = await client.callTool({ name: 'realfavicon_check', arguments: { url: `${origin}/junk/` } });

  expect(r.isError).toBeFalsy();
  const sc = r.structuredContent as Report;
  expect(sc.has_errors).toBe(true);
  expect(errorsAbout(sc.desktop, `\`${origin}/junk/favicon-96x96.png\` answered 200 with content that is not`).length).toBe(1);
  expect(errorsAbout(sc.touch_icon, `\`${origin}/junk/apple-touch-icon.png\` answered 200 with an empty body`).length).toBe(1);
  // The SVG before the bad PNG and the ICO after it are still reported, the ICO with its real status.
  expect(allTexts(sc)).toContain('The SVG favicon is accessible at `/junk/favicon.svg`');
  expect(errorsAbout(sc.desktop, `Error fetching ICO favicon at ${origin}/junk/favicon.ico (status 500)`).length).toBe(1);
  // The other section is still checked and reported.
  expect(errorsAbout(sc.web_app_manifest, 'is not found').length).toBe(1);
});

// The guard applies to every request the check makes, not only the page.
test('requests the page steers at a link-local address are refused', async () => {
  const client = await makeClient();
  const r = await client.callTool({ name: 'realfavicon_check', arguments: { url: `${origin}/steer/` } });

  expect(r.isError).toBeFalsy();
  const sc = r.structuredContent as Report;

  const manifestErrors = errorsAbout(sc.web_app_manifest, '`http://[fe80::1]/internal/config.json` could not be fetched');
  expect(manifestErrors.length).toBe(1);
  expect(manifestErrors[0]).toMatch(/link-local\/metadata/);
  // No second line from the library calling the refusal a "0 error".
  expect(sc.web_app_manifest.messages.length).toBe(1);

  // The touch icon lives on the page's own host and redirects to a metadata address.
  const touchErrors = errorsAbout(sc.touch_icon, `\`${origin}/steer/bounce.png\` could not be fetched`);
  expect(touchErrors.length).toBe(1);
  expect(touchErrors[0]).toMatch(/link-local\/metadata/);
});

test('a page URL that is, or redirects to, a link-local address is refused', async () => {
  const client = await makeClient();

  for (const url of ['http://[::ffff:169.254.169.254]/', `${origin}/moved-to-link-local`]) {
    const r = await client.callTool({ name: 'realfavicon_check', arguments: { url } });

    expect(r.isError).toBe(true);
    expect(textOf(r)).toMatch(/link-local\/metadata/);
  }
});

// A file that never answers, and one whose body stalls after the headers.
test('a stalled icon times out on its own and the rest of the report survives', async () => {
  const client = await makeClient({ pageMs: 10_000, assetMs: 1_000, totalMs: 20_000 });

  const started = Date.now();
  const r = await client.callTool({ name: 'realfavicon_check', arguments: { url: `${origin}/stall/` } });
  const elapsed = Date.now() - started;

  expect(r.isError).toBeFalsy();
  expect(elapsed).toBeLessThan(8_000);
  const sc = r.structuredContent as Report;

  const never = errorsAbout(sc.touch_icon, `\`${origin}/stall/apple-touch-icon.png\` could not be fetched`);
  expect(never.length).toBe(1);
  expect(never[0]).toMatch(/no answer within 1 s/);

  const stalledBody = errorsAbout(sc.desktop, `\`${origin}/stall/favicon.svg\` could not be fetched`);
  expect(stalledBody.length).toBe(1);
  expect(stalledBody[0]).toMatch(/no answer within 1 s/);

  // Files after the stalled ones were still checked.
  expect(errorsAbout(sc.web_app_manifest, 'is not found').length).toBe(1);
}, 15_000);

test('the whole check has a time limit of its own', async () => {
  const client = await makeClient({ pageMs: 10_000, assetMs: 60_000, totalMs: 1_500 });

  const started = Date.now();
  const r = await client.callTool({ name: 'realfavicon_check', arguments: { url: `${origin}/stall/` } });
  const elapsed = Date.now() - started;

  expect(r.isError).toBeFalsy();
  expect(elapsed).toBeLessThan(8_000);
  const sc = r.structuredContent as Report;
  expect(errorsAbout(sc.desktop, `\`${origin}/stall/favicon.svg\` could not be fetched`)[0]).toMatch(/time limit of 1\.5 s/);
}, 15_000);

// --- The page itself ---

test('icons are resolved against the address the page redirected to', async () => {
  const client = await makeClient();
  const r = await client.callTool({ name: 'realfavicon_check', arguments: { url: `${origin}/moved` } });

  expect(r.isError).toBeFalsy();
  const sc = r.structuredContent as Report;
  expect(sc.page_title).toBe('Moved Here');
  expect(sc.desktop.icons.svg?.url).toBe(`${otherOrigin}/favicon.svg`);
  expect(allTexts(sc)).toContain('The SVG favicon is accessible at `/favicon.svg`');
  expect(sc.web_app_manifest.name).toBe('Local App');
});

test('a page whose head tags are implied is still read', async () => {
  const client = await makeClient();
  const r = await client.callTool({ name: 'realfavicon_check', arguments: { url: `${origin}/implicit/` } });

  expect(r.isError).toBeFalsy();
  const sc = r.structuredContent as Report;
  expect(sc.page_title).toBe('Implicit');
  expect(allTexts(sc)).toContain('The SVG favicon is declared');
  expect(allTexts(sc).filter(t => t.includes('No <head> element'))).toEqual([]);
});

test('a URL that does not return HTML is an error, not a favicon report', async () => {
  const client = await makeClient();
  const r = await client.callTool({ name: 'realfavicon_check', arguments: { url: `${origin}/api.json` } });

  expect(r.isError).toBe(true);
  expect(textOf(r)).toContain('application/json');
});
