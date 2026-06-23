import { test, expect, beforeAll, afterAll } from 'bun:test';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { registerGenerateFavicon } from '../src/tools/generate.ts';

// --- Setup ---

let client: Client;
let masterPng: string;
const tempDirs: string[] = [];

async function makeClient(): Promise<Client> {
  const server = new McpServer({ name: 't', version: '0.0.0' });
  registerGenerateFavicon(server);
  const [ct, st] = InMemoryTransport.createLinkedPair();
  const c = new Client({ name: 'c', version: '0.0.0' });
  await Promise.all([server.connect(st), c.connect(ct)]);
  return c;
}

beforeAll(async () => {
  // Deterministic 32×32 RGBA PNG in temp — no committed binary needed.
  masterPng = join(tmpdir(), `rfg-master-${randomUUID()}.png`);
  await sharp({
    create: { width: 32, height: 32, channels: 4, background: { r: 0, g: 128, b: 255, alpha: 1 } },
  }).png().toFile(masterPng);

  client = await makeClient();
});

afterAll(async () => {
  // Clean up all temp output dirs created during tests.
  for (const d of tempDirs) {
    try { await rm(d, { recursive: true, force: true }); } catch { /* ignore */ }
  }
  // Clean up master PNG.
  try { await rm(masterPng, { force: true }); } catch { /* ignore */ }
});

// --- Helpers ---

async function freshOutDir(): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), 'rfg-out-'));
  tempDirs.push(d);
  return d;
}

// --- Tests ---

test('happy path: returns non-error structured result with files, markups, html, webmanifest', async () => {
  const output_dir = await freshOutDir();
  const r = await client.callTool({ name: 'realfavicon_generate', arguments: { source: masterPng, output_dir } });

  expect(r.isError).toBeFalsy();

  const sc = r.structuredContent as {
    output_dir: string;
    files: Array<{ name: string; bytes: number }>;
    html: string;
    markups: string[];
    css_selectors: string[];
    webmanifest: string | null;
  };

  // files: non-empty array
  expect(Array.isArray(sc.files)).toBe(true);
  expect(sc.files.length).toBeGreaterThan(0);

  // every file has bytes > 0
  for (const f of sc.files) {
    expect(f.bytes).toBeGreaterThan(0);
  }

  // site.webmanifest is present in the file list
  const names = sc.files.map(f => f.name);
  expect(names).toContain('site.webmanifest');

  // at least one PNG in the written set
  expect(names.some(n => n.endsWith('.png'))).toBe(true);

  // markups non-empty; html non-empty
  expect(sc.markups.length).toBeGreaterThan(0);
  expect(sc.html.length).toBeGreaterThan(0);

  // html equals markups joined by newline
  expect(sc.html).toBe(sc.markups.join('\n'));

  // webmanifest is a non-empty string
  expect(typeof sc.webmanifest).toBe('string');
  expect((sc.webmanifest as string).length).toBeGreaterThan(0);

  // output_dir echoed back correctly
  expect(sc.output_dir).toBe(output_dir);

  // content[0].text is a human-readable summary
  expect((r.content as Array<{ type: string; text: string }>)[0].text).toMatch(/favicon files/i);
});

test('happy path: written files actually exist on disk with correct byte counts', async () => {
  const output_dir = await freshOutDir();
  const r = await client.callTool({ name: 'realfavicon_generate', arguments: { source: masterPng, output_dir } });

  expect(r.isError).toBeFalsy();

  const sc = r.structuredContent as { files: Array<{ name: string; bytes: number }> };

  // Spot-check site.webmanifest on disk.
  const manifest = sc.files.find(f => f.name === 'site.webmanifest')!;
  const info = await stat(join(output_dir, manifest.name));
  expect(info.size).toBe(manifest.bytes);
  expect(info.size).toBeGreaterThan(0);
});

test('happy path: output_dir is created when it does not already exist', async () => {
  // Point at a nested path that does not yet exist.
  const base = await mkdtemp(join(tmpdir(), 'rfg-base-'));
  tempDirs.push(base);
  const output_dir = join(base, 'nested', 'favicons');

  const r = await client.callTool({ name: 'realfavicon_generate', arguments: { source: masterPng, output_dir } });
  expect(r.isError).toBeFalsy();

  // Directory must now exist.
  const info = await stat(output_dir);
  expect(info.isDirectory()).toBe(true);
});

test('error path: non-existent source returns isError:true with the source path in the message', async () => {
  const output_dir = await freshOutDir();
  const fakePath = join(tmpdir(), `rfg-nonexistent-${randomUUID()}.png`);

  const r = await client.callTool({ name: 'realfavicon_generate', arguments: { source: fakePath, output_dir } });

  expect(r.isError).toBe(true);
  const text = (r.content as Array<{ type: string; text: string }>)[0].text;
  // Message must mention the bad path so the caller can diagnose it.
  expect(text).toContain(fakePath);
});

test('error path: call resolves (does not throw) when source does not exist', async () => {
  const output_dir = await freshOutDir();
  const fakePath = join(tmpdir(), `rfg-nonexistent-${randomUUID()}.png`);

  // Must resolve, never reject/throw out of the process.
  const r = await client.callTool({ name: 'realfavicon_generate', arguments: { source: fakePath, output_dir } });
  expect(r.isError).toBe(true);
});

test('optional fields: app_name, theme_color, background_color are accepted without error', async () => {
  const output_dir = await freshOutDir();
  const r = await client.callTool({
    name: 'realfavicon_generate',
    arguments: {
      source: masterPng,
      output_dir,
      app_name: 'Test App',
      theme_color: '#336699',
      background_color: '#fff',
    },
  });
  expect(r.isError).toBeFalsy();
  const sc = r.structuredContent as { files: Array<unknown> };
  expect(sc.files.length).toBeGreaterThan(0);
});

test('webmanifest field is null when not emitted, or a string when emitted', async () => {
  const output_dir = await freshOutDir();
  const r = await client.callTool({ name: 'realfavicon_generate', arguments: { source: masterPng, output_dir } });

  expect(r.isError).toBeFalsy();
  const sc = r.structuredContent as { webmanifest: string | null };
  // Must be string or null — never undefined.
  expect(sc.webmanifest === null || typeof sc.webmanifest === 'string').toBe(true);
});

test('css_selectors is an array (may be empty)', async () => {
  const output_dir = await freshOutDir();
  const r = await client.callTool({ name: 'realfavicon_generate', arguments: { source: masterPng, output_dir } });

  expect(r.isError).toBeFalsy();
  const sc = r.structuredContent as { css_selectors: unknown };
  expect(Array.isArray(sc.css_selectors)).toBe(true);
});
