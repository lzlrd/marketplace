import { test, expect, afterEach } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { registerCheckFavicon } from '../src/tools/check.ts';

const pageUrl = 'http://localhost:9999/';
const fixtureHtml = readFileSync(join(import.meta.dir, 'fixtures/page-head.html'), 'utf8');

async function makeClient(): Promise<Client> {
  const server = new McpServer({ name: 't', version: '0.0.0' });
  registerCheckFavicon(server);
  const [ct, st] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'c', version: '0.0.0' });
  await Promise.all([server.connect(st), client.connect(ct)]);
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

// Test 3 — missing <head> does not throw; call resolves.
test('page with no <head> does not crash the handler', async () => {
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], _init?: RequestInit) => {
    const u = String((input as Request).url ?? input);
    if (u === pageUrl) {
      return new Response('<html><body>x</body></html>', { status: 200, headers: { 'content-type': 'text/html' } });
    }
    return new Response('', { status: 404 });
  }) as typeof fetch;

  const client = await makeClient();
  // Must resolve — no thrown error escapes the handler.
  const r = await client.callTool({ name: 'realfavicon_check', arguments: { url: pageUrl } });
  // r is returned (isError may be true or false — what matters is no unhandled throw).
  expect(r).toBeDefined();
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
