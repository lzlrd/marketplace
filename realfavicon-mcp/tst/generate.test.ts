import { test, expect, beforeAll, afterAll } from 'bun:test';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { registerGenerateFavicon } from '../src/tools/generate.ts';

// --- Setup ---

// A 32×32 solid-colour RGBA PNG, inlined so the suite needs no image library of its own.
const MASTER_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAK0lEQVR42u3OoQEAAAwCIE/f5+4MC4FOcu2UgICAgICAgICAgICAgIDAOvBNk/iIlQmc1wAAAABJRU5ErkJggg==',
  'base64',
);

const MASTER_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="#0080ff"/></svg>';

// An app shell with an inline SVG that could pass for a master image, and a script.
const APP_SHELL = `<!doctype html><html><head><script>document.title = 'shell'</script></head><body>${MASTER_SVG.replace('<svg ', '<svg width="32" height="32" ')}</body></html>`;

const pluginRoot = join(import.meta.dir, '..');

let client: Client;
let masterPng: string;
let server: ReturnType<typeof Bun.serve>;
let origin: string;
const tempDirs: string[] = [];

type Result = {
  output_dir: string;
  files: Array<{ name: string; bytes: number }>;
  overwritten: string[];
  html: string;
  markups: string[];
  css_selectors: string[];
  webmanifest: string | null;
};

async function makeClient(): Promise<Client> {
  const server = new McpServer({ name: 't', version: '0.0.0' });
  registerGenerateFavicon(server);
  const [ct, st] = InMemoryTransport.createLinkedPair();
  const c = new Client({ name: 'c', version: '0.0.0' });
  await Promise.all([server.connect(st), c.connect(ct)]);
  return c;
}

beforeAll(async () => {
  masterPng = join(tmpdir(), `rfg-master-${randomUUID()}.png`);
  await writeFile(masterPng, MASTER_PNG);

  // Local stand-in for a remote master image.
  server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(req) {
      const { pathname } = new URL(req.url);
      const redirect = (location: string) => new Response(null, { status: 302, headers: { location } });
      if (pathname === '/logo.png') return new Response(MASTER_PNG, { headers: { 'content-type': 'image/png' } });
      // The same image behind URLs whose path says nothing true about its type.
      if (pathname === '/logo' || pathname === '/avatar.php') return new Response(MASTER_PNG, { headers: { 'content-type': 'image/png; charset=binary' } });
      if (pathname === '/moved.svg') return redirect('/logo.png');
      // Nothing names the type: no extension, no Content-Type.
      if (pathname === '/raw') return new Response(MASTER_PNG, { headers: { 'content-type': '' } });
      // An SVG named by its Content-Type alone, and one named by its URL alone.
      if (pathname === '/vector') return new Response(MASTER_SVG, { headers: { 'content-type': 'image/svg+xml' } });
      if (pathname === '/vector.svg') return new Response(MASTER_SVG, { headers: { 'content-type': 'text/plain' } });
      // Content-Types that lie about the bytes.
      if (pathname === '/lying.svg') return new Response(MASTER_SVG, { headers: { 'content-type': 'image/png' } });
      if (pathname === '/lying-xml') return new Response(`﻿<?xml version="1.0"?>\n<!-- Drawn by hand -->\n${MASTER_SVG}`, { headers: { 'content-type': 'image/png' } });
      if (pathname === '/logo.ico') return new Response(MASTER_PNG, { headers: { 'content-type': 'image/vnd.microsoft.icon' } });
      // A single-page app answers a missing file with its shell, which may hold an inline SVG.
      if (pathname === '/spa/logo.svg') return new Response(APP_SHELL, { headers: { 'content-type': 'text/html' } });
      if (pathname === '/spa/plain.svg') return new Response('<!doctype html><html><body>Not here</body></html>', { headers: { 'content-type': 'text/html' } });
      if (pathname === '/spa/labelled.png') return new Response(APP_SHELL, { headers: { 'content-type': 'image/png' } });
      if (pathname === '/moved-to-spa.png') return redirect('/spa/logo.svg');
      if (pathname === '/blank.svg') return new Response('', { headers: { 'content-type': 'image/svg+xml' } });
      if (pathname === '/moved.png') return redirect('/logo.png');
      if (pathname === '/to-link-local.png') return redirect('http://[fe80::1]/logo.png');
      return new Response('not found', { status: 404 });
    },
  });
  origin = `http://127.0.0.1:${server.port}`;

  client = await makeClient();
});

afterAll(async () => {
  server.stop(true);
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

// A stand-in project with a master image at brand/logo.png.
async function freshProject(): Promise<string> {
  const project = await realpath(await freshOutDir());
  await mkdir(join(project, 'brand'));
  await writeFile(join(project, 'brand', 'logo.png'), MASTER_PNG);
  return project;
}

// A directory name no real tree has. A relative path that resolves against the wrong base
// would create it there, so every candidate is registered for removal.
function strayDirName(): string {
  const name = `rfg-test-out-${randomUUID()}`;
  tempDirs.push(join(process.cwd(), name), join(pluginRoot, name));
  return name;
}

async function exists(path: string): Promise<boolean> {
  return stat(path).then(() => true, () => false);
}

function textOf(r: unknown): string {
  return (r as { content: Array<{ type: string; text: string }> }).content[0]!.text;
}

async function downloadedTemps(): Promise<string[]> {
  return (await readdir(tmpdir())).filter(n => n.startsWith('rfg-src-')).sort();
}

// Runs `fn` with CLAUDE_PROJECT_DIR set to `value` (or unset), then restores it.
async function withProjectDir<T>(value: string | undefined, fn: () => Promise<T>): Promise<T> {
  const before = process.env.CLAUDE_PROJECT_DIR;
  if (value === undefined) delete process.env.CLAUDE_PROJECT_DIR;
  else process.env.CLAUDE_PROJECT_DIR = value;
  try {
    return await fn();
  } finally {
    if (before === undefined) delete process.env.CLAUDE_PROJECT_DIR;
    else process.env.CLAUDE_PROJECT_DIR = before;
  }
}

// --- Tests ---

test('happy path: returns non-error structured result with files, markups, html, webmanifest', async () => {
  const output_dir = await freshOutDir();
  const r = await client.callTool({ name: 'realfavicon_generate', arguments: { source: masterPng, output_dir } });

  expect(r.isError).toBeFalsy();

  const sc = r.structuredContent as Result;

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
  expect(textOf(r)).toMatch(/favicon files/i);
});

test('happy path: written files actually exist on disk with correct byte counts', async () => {
  const output_dir = await freshOutDir();
  const r = await client.callTool({ name: 'realfavicon_generate', arguments: { source: masterPng, output_dir } });

  expect(r.isError).toBeFalsy();

  const sc = r.structuredContent as Result;

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
  // Message must mention the bad path so the caller can diagnose it.
  expect(textOf(r)).toContain(fakePath);
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
  const sc = r.structuredContent as Result;
  expect(sc.files.length).toBeGreaterThan(0);
});

test('webmanifest field is null when not emitted, or a string when emitted', async () => {
  const output_dir = await freshOutDir();
  const r = await client.callTool({ name: 'realfavicon_generate', arguments: { source: masterPng, output_dir } });

  expect(r.isError).toBeFalsy();
  const sc = r.structuredContent as Result;
  // Must be string or null — never undefined.
  expect(sc.webmanifest === null || typeof sc.webmanifest === 'string').toBe(true);
});

test('css_selectors is an array (may be empty)', async () => {
  const output_dir = await freshOutDir();
  const r = await client.callTool({ name: 'realfavicon_generate', arguments: { source: masterPng, output_dir } });

  expect(r.isError).toBeFalsy();
  const sc = r.structuredContent as Result;
  expect(Array.isArray(sc.css_selectors)).toBe(true);
});

// --- Relative paths ---

test('relative source, dark_icon_source and output_dir resolve against CLAUDE_PROJECT_DIR', async () => {
  const project = await freshProject();
  const out = strayDirName();

  const r = await withProjectDir(project, () => client.callTool({
    name: 'realfavicon_generate',
    arguments: { source: './brand/logo.png', dark_icon_source: 'brand/logo.png', output_dir: `${out}/` },
  }));

  expect(r.isError).toBeFalsy();
  const sc = r.structuredContent as Result;

  // The result names the directory that was written, as an absolute path.
  expect(sc.output_dir).toBe(join(project, out));
  expect(textOf(r)).toContain(join(project, out));

  expect(await exists(join(project, out, 'favicon.ico'))).toBe(true);
  expect(await exists(join(process.cwd(), out))).toBe(false);
});

test('a relative path is refused when CLAUDE_PROJECT_DIR is not set', async () => {
  const project = await freshProject();
  const out = strayDirName();

  const relativeOut = await withProjectDir(undefined, () => client.callTool({
    name: 'realfavicon_generate',
    arguments: { source: join(project, 'brand', 'logo.png'), output_dir: out },
  }));
  expect(relativeOut.isError).toBe(true);
  // The message says which argument, and where the path would have landed.
  expect(textOf(relativeOut)).toContain('output_dir');
  expect(textOf(relativeOut)).toContain(process.cwd());
  expect(await exists(join(process.cwd(), out))).toBe(false);

  const relativeSource = await withProjectDir(undefined, () => client.callTool({
    name: 'realfavicon_generate',
    arguments: { source: 'brand/logo.png', output_dir: join(project, 'public') },
  }));
  expect(relativeSource.isError).toBe(true);
  expect(textOf(relativeSource)).toContain('source');
  expect(textOf(relativeSource)).toContain(process.cwd());
});

test('a relative path is refused when CLAUDE_PROJECT_DIR is itself relative', async () => {
  const project = await freshProject();
  // A relative root would resolve against the working directory, which is the plugin under the
  // launch command, so both are registered for removal in case it is written anyway.
  const root = strayDirName();
  const out = 'web';

  const r = await withProjectDir(root, () => client.callTool({
    name: 'realfavicon_generate',
    arguments: { source: join(project, 'brand', 'logo.png'), output_dir: out },
  }));

  expect(r.isError).toBe(true);
  expect(textOf(r)).toContain('output_dir');
  expect(textOf(r)).toContain(`CLAUDE_PROJECT_DIR is not absolute (${root})`);
  expect(await exists(join(process.cwd(), root))).toBe(false);
});

test('a server whose working directory is the plugin writes relative paths into the project', async () => {
  const project = await freshProject();
  const out = strayDirName();

  // As Claude Code runs it: started inside the plugin directory, with the project root in
  // CLAUDE_PROJECT_DIR.
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(pluginRoot, 'src', 'index.ts')],
    cwd: pluginRoot,
    env: { CLAUDE_PROJECT_DIR: project },
  });
  const spawned = new Client({ name: 'c', version: '0.0.0' });
  await spawned.connect(transport);

  try {
    const r = await spawned.callTool({
      name: 'realfavicon_generate',
      arguments: { source: './brand/logo.png', output_dir: `${out}/` },
    });

    expect(r.isError).toBeFalsy();
    expect((r.structuredContent as Result).output_dir).toBe(join(project, out));
    expect(await exists(join(project, out, 'site.webmanifest'))).toBe(true);
    expect(await exists(join(pluginRoot, out))).toBe(false);
  } finally {
    await spawned.close();
  }
});

// --- path and app_title ---

test('a path without a trailing slash still yields working hrefs and manifest icon URLs', async () => {
  for (const [path, prefix] of [
    ['/favicons', '/favicons/'],
    ['/favicons/', '/favicons/'],
    ['https://cdn.example.com/icons', 'https://cdn.example.com/icons/'],
    ['favicons', 'favicons/'],
  ] as const) {
    const output_dir = await freshOutDir();
    const r = await client.callTool({ name: 'realfavicon_generate', arguments: { source: masterPng, output_dir, path } });

    expect(r.isError).toBeFalsy();
    const sc = r.structuredContent as Result;
    expect(sc.html).toContain(`href="${prefix}favicon-96x96.png"`);
    expect(sc.html).toContain(`href="${prefix}site.webmanifest"`);

    const manifest = JSON.parse(sc.webmanifest as string) as { icons: Array<{ src: string }> };
    expect(manifest.icons.map(i => i.src)).toContain(`${prefix}web-app-manifest-192x192.png`);
  }
});

test('an empty path keeps the hrefs relative', async () => {
  const output_dir = await freshOutDir();
  const r = await client.callTool({ name: 'realfavicon_generate', arguments: { source: masterPng, output_dir, path: '' } });

  expect(r.isError).toBeFalsy();
  expect((r.structuredContent as Result).html).toContain('href="favicon-96x96.png"');
});

test('a version or path that would break out of the markup is refused', async () => {
  for (const args of [{ version: '1"><script>x</script>' }, { path: '/fav"icons' }, { path: '/a<b>/' }, { version: 'a>b' }]) {
    const output_dir = await freshOutDir();
    const r = await client.callTool({ name: 'realfavicon_generate', arguments: { source: masterPng, output_dir, ...args } });

    expect(r.isError).toBe(true);
    expect(textOf(r)).toContain(Object.keys(args)[0]!);
    expect(await readdir(output_dir)).toEqual([]);
  }

  // Ordinary values still pass.
  const output_dir = await freshOutDir();
  const ok = await client.callTool({ name: 'realfavicon_generate', arguments: { source: masterPng, output_dir, version: '2026-11-19.1', path: '/static/icons/' } });
  expect(ok.isError).toBeFalsy();
  expect((ok.structuredContent as Result).html).toContain('href="/static/icons/favicon-96x96.png?v=2026-11-19.1"');
});

test('app_title is HTML-escaped in the markup', async () => {
  const output_dir = await freshOutDir();
  const r = await client.callTool({
    name: 'realfavicon_generate',
    arguments: { source: masterPng, output_dir, app_title: 'Bob "B" & <Co>' },
  });

  expect(r.isError).toBeFalsy();
  expect((r.structuredContent as Result).html).toContain(
    '<meta name="apple-mobile-web-app-title" content="Bob &quot;B&quot; &amp; &lt;Co&gt;" />',
  );
});

// --- Existing files ---

test('files that already exist are replaced and named in the result', async () => {
  const output_dir = await freshOutDir();
  await writeFile(join(output_dir, 'site.webmanifest'), '{"name":"Hand tuned","start_url":"/app"}');
  await writeFile(join(output_dir, 'favicon.ico'), 'ORIGINAL-ICO');
  await writeFile(join(output_dir, 'robots.txt'), 'User-agent: *');

  const r = await client.callTool({ name: 'realfavicon_generate', arguments: { source: masterPng, output_dir } });

  expect(r.isError).toBeFalsy();
  const sc = r.structuredContent as Result;
  expect([...sc.overwritten].sort()).toEqual(['favicon.ico', 'site.webmanifest']);
  expect(textOf(r)).toContain('favicon.ico');
  expect(textOf(r)).toContain('site.webmanifest');

  // Only the generated names are touched.
  expect(await readFile(join(output_dir, 'robots.txt'), 'utf8')).toBe('User-agent: *');
  expect(await readFile(join(output_dir, 'favicon.ico'), 'utf8')).not.toBe('ORIGINAL-ICO');
});

test('a write that fails partway names the files already written and replaced', async () => {
  const output_dir = await freshOutDir();
  await writeFile(join(output_dir, 'favicon.svg'), 'ORIGINAL-SVG');
  // A directory where a file is due makes that one write fail.
  await mkdir(join(output_dir, 'favicon.ico'));

  const r = await client.callTool({ name: 'realfavicon_generate', arguments: { source: masterPng, output_dir } });

  expect(r.isError).toBe(true);
  const text = textOf(r);
  expect(text).toContain('favicon.ico');
  // Every file that now holds generated content is named, and the replaced one as replaced.
  const written = (await readdir(output_dir)).filter(n => n !== 'favicon.ico');
  expect(written).toContain('favicon.svg');
  for (const name of written) expect(text).toContain(name);
  expect(text).toMatch(/replaced existing: favicon\.svg\b/);
  expect(await readFile(join(output_dir, 'favicon.svg'), 'utf8')).not.toBe('ORIGINAL-SVG');
});

test('a symlink at a generated name in output_dir is refused and its target left alone', async () => {
  const output_dir = await freshOutDir();
  const outside = await freshOutDir();
  const victim = join(outside, 'victim.txt');
  await writeFile(victim, 'KEEP-ME');
  // A cloned repository can carry links like these in its public/ folder.
  await symlink(victim, join(output_dir, 'favicon.ico'));
  await symlink(join(outside, 'not-there.svg'), join(output_dir, 'favicon.svg'));

  const r = await client.callTool({ name: 'realfavicon_generate', arguments: { source: masterPng, output_dir } });

  expect(r.isError).toBe(true);
  expect(textOf(r)).toContain('favicon.ico');
  expect(textOf(r)).toContain('favicon.svg');
  expect(textOf(r)).toMatch(/symlink/);
  expect(await readFile(victim, 'utf8')).toBe('KEEP-ME');
  expect(await exists(join(outside, 'not-there.svg'))).toBe(false);
  // Nothing was written, not even the files with no link in the way.
  expect((await readdir(output_dir)).sort()).toEqual(['favicon.ico', 'favicon.svg']);
});

test('a fresh output_dir reports nothing replaced', async () => {
  const output_dir = await freshOutDir();
  const r = await client.callTool({ name: 'realfavicon_generate', arguments: { source: masterPng, output_dir } });

  expect(r.isError).toBeFalsy();
  expect((r.structuredContent as Result).overwritten).toEqual([]);
  expect(textOf(r)).not.toMatch(/replaced/i);
});

test('the tool is not declared as additive-only', async () => {
  const { tools } = await client.listTools();
  const annotations = tools.find(t => t.name === 'realfavicon_generate')!.annotations;

  expect(annotations?.readOnlyHint).toBe(false);
  expect(annotations?.destructiveHint).toBe(true);
});

// --- URL sources ---

test('a URL source is downloaded, through an allowed redirect too, and the temp file is removed', async () => {
  const before = await downloadedTemps();

  for (const source of [`${origin}/logo.png`, `${origin}/moved.png`]) {
    const output_dir = await freshOutDir();
    const r = await client.callTool({
      name: 'realfavicon_generate',
      arguments: { source, dark_icon_source: `${origin}/logo.png`, output_dir },
    });

    expect(r.isError).toBeFalsy();
    expect(isAbsolute((r.structuredContent as Result).output_dir)).toBe(true);
    expect(await exists(join(output_dir, 'favicon.ico'))).toBe(true);
  }

  expect(await downloadedTemps()).toEqual(before);
});

test('a URL source that redirects to a link-local address is refused', async () => {
  const before = await downloadedTemps();

  for (const args of [
    { source: `${origin}/to-link-local.png` },
    { source: masterPng, dark_icon_source: `${origin}/to-link-local.png` },
  ]) {
    const output_dir = await freshOutDir();
    const r = await client.callTool({ name: 'realfavicon_generate', arguments: { ...args, output_dir } });

    expect(r.isError).toBe(true);
    expect(textOf(r)).toMatch(/link-local\/metadata/);
  }

  expect(await downloadedTemps()).toEqual(before);
});

test('a URL source is typed by its bytes and Content-Type, not by the URL path', async () => {
  for (const source of [`${origin}/logo`, `${origin}/avatar.php`, `${origin}/moved.svg`, `${origin}/logo.ico`]) {
    const output_dir = await freshOutDir();
    const r = await client.callTool({ name: 'realfavicon_generate', arguments: { source, output_dir } });

    expect(r.isError).toBeFalsy();
    // The raster master is embedded in favicon.svg under its real type, and no local path leaks.
    const faviconSvg = await readFile(join(output_dir, 'favicon.svg'), 'utf8');
    expect(faviconSvg).toContain('data:image/png;base64,');
    expect(faviconSvg).not.toContain('rfg-src-');
  }
});

test('an SVG URL source stays vector, whatever its Content-Type says', async () => {
  for (const source of [`${origin}/vector`, `${origin}/vector.svg`, `${origin}/lying.svg`, `${origin}/lying-xml`]) {
    const output_dir = await freshOutDir();
    const r = await client.callTool({ name: 'realfavicon_generate', arguments: { source, output_dir } });

    expect(r.isError).toBeFalsy();
    const faviconSvg = await readFile(join(output_dir, 'favicon.svg'), 'utf8');
    expect(faviconSvg).toContain('<rect');
    expect(faviconSvg).not.toContain('data:image');
  }
});

test('a URL source that answers with an HTML page or an empty body is refused, whatever its name and type', async () => {
  const before = await downloadedTemps();

  for (const [args, url, answer] of [
    [{ source: `${origin}/spa/logo.svg` }, `${origin}/spa/logo.svg`, 'an HTML page'],
    [{ source: `${origin}/spa/plain.svg` }, `${origin}/spa/plain.svg`, 'an HTML page'],
    [{ source: `${origin}/spa/labelled.png` }, `${origin}/spa/labelled.png`, 'an HTML page'],
    [{ source: `${origin}/moved-to-spa.png` }, `${origin}/moved-to-spa.png (redirected to ${origin}/spa/logo.svg)`, 'an HTML page'],
    [{ source: `${origin}/blank.svg` }, `${origin}/blank.svg`, 'an empty body'],
    [{ source: masterPng, dark_icon_source: `${origin}/spa/logo.svg` }, `${origin}/spa/logo.svg`, 'an HTML page'],
  ] as const) {
    const output_dir = await freshOutDir();
    const r = await client.callTool({ name: 'realfavicon_generate', arguments: { ...args, output_dir } });

    expect(r.isError).toBe(true);
    // The message names the URL and what it answered with, not a decoder's complaint.
    expect(textOf(r)).toContain(`${url} answered 200 with ${answer}, not an image`);
    expect(textOf(r)).not.toMatch(/corrupt header|unsupported image format/i);
    expect(await readdir(output_dir)).toEqual([]);
  }

  expect(await downloadedTemps()).toEqual(before);
});

test('a URL source that names no type at all still works and leaks no temp path', async () => {
  // The stand-in really sends no usable Content-Type.
  const probe = await fetch(`${origin}/raw`);
  expect(probe.headers.get('content-type') ?? '').not.toContain('image/');

  const output_dir = await freshOutDir();
  const r = await client.callTool({ name: 'realfavicon_generate', arguments: { source: `${origin}/raw`, output_dir } });

  expect(r.isError).toBeFalsy();
  expect(await readFile(join(output_dir, 'favicon.svg'), 'utf8')).not.toContain('rfg-src-');
});
